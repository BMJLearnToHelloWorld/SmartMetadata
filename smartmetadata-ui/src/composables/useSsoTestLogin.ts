/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { UserManager, type UserManagerSettings } from 'oidc-client';
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  isBrowserTestLogin,
  isTestLoginSettled,
  popupCandidateFor,
  TEST_LOGIN_POLL_MS,
  TEST_LOGIN_POPUP_FEATURES,
  TEST_LOGIN_POPUP_NAME,
  TEST_LOGIN_TIMEOUT_MS,
} from '@/admin/ssoTestLogin';
import { ApiError } from '@/api/client';
import {
  getTestLoginResult,
  startTestLogin,
  submitTestLoginCredentials,
  testLoginValidateToken,
  type SecurityConfigurationDocument,
  type TestLoginResult,
  type TestLoginSession,
} from '@/api/system';
import { getCandidateUserManagerConfig, SSO_TEST_LOGIN_CANDIDATE_KEY } from '@/auth/ssoTestCallback';
import { isHttpUrl, UnsafeSignInUrlError } from '@/auth/ssoTestLoginPopup';

/** What the checks a save runs said about a configuration, before Test Login signs in with it. */
export interface ConfigurationCheckOutcome {
  passed: boolean;
  /** Shown in the modal; problems tied to a field are also highlighted in the form. */
  problems: string[];
}

export type ConfigurationCheck = (
  securityConfiguration: SecurityConfigurationDocument,
) => Promise<ConfigurationCheckOutcome>;

export interface ConfigurationCheckState {
  status: 'running' | 'passed' | 'failed';
  problems: string[];
}

/** The slice of oidc-client's UserManager the browser test drives. Tests inject a fake. */
export interface SsoTestUserManager {
  metadataService: {
    getAuthorizationEndpoint(): Promise<string>;
  };
  signinPopup(): Promise<{ id_token?: string } | undefined>;
}

export type SsoTestUserManagerFactory = (
  settings: UserManagerSettings,
) => SsoTestUserManager;

const delay = (millis: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, millis);
  });

/** The configuration check failed; the check itself already reported why. */
class ConfigurationCheckFailedError extends Error {}

/**
 * The server's own reason for a failed backend call, or the fallback when
 * the body carries none. The generic `Request failed (500)` shape is
 * never shown: it says nothing the admin can act on.
 */
export function testLoginErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    try {
      const parsed = JSON.parse(error.body) as { message?: unknown; error?: unknown };
      if (typeof parsed.message === 'string' && parsed.message) {
        return parsed.message;
      }
      if (typeof parsed.error === 'string' && parsed.error) {
        return parsed.error;
      }
    } catch {
      // A body without a message falls through to the fallback below.
    }
    return fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * oidc-client opens the popup at once, inside the click, then reads the authorization endpoint
 * before sending the popup there. That is the one point where the configuration check can finish
 * before the sign-in starts, and where the endpoint — taken unchecked from the discovery document
 * while the popup is still same-origin — can be refused.
 */
function guardAuthorizationEndpoint(
  userManager: SsoTestUserManager,
  beforeSignIn: () => Promise<boolean>,
): void {
  const { metadataService } = userManager;
  const getAuthorizationEndpoint = metadataService.getAuthorizationEndpoint.bind(metadataService);
  metadataService.getAuthorizationEndpoint = async () => {
    if (!(await beforeSignIn())) {
      throw new ConfigurationCheckFailedError();
    }
    const endpoint = await getAuthorizationEndpoint();
    if (!isHttpUrl(endpoint)) {
      throw new UnsafeSignInUrlError();
    }

    return endpoint;
  };
}

async function acquireIdToken(
  candidate: SecurityConfigurationDocument,
  beforeSignIn: () => Promise<boolean>,
  userManagerFactory: SsoTestUserManagerFactory,
): Promise<string | undefined> {
  const popupCandidate = popupCandidateFor(candidate);
  globalThis.localStorage.setItem(SSO_TEST_LOGIN_CANDIDATE_KEY, JSON.stringify(popupCandidate));
  const userManager = userManagerFactory(getCandidateUserManagerConfig(popupCandidate));
  guardAuthorizationEndpoint(userManager, beforeSignIn);
  const user = await userManager.signinPopup();

  return user?.id_token;
}

/**
 * Drives the interactive SSO "Test Login" against a candidate (unsaved) configuration. It first runs
 * the checks a save runs, then signs in with the same flow the real login uses:
 *
 * - Public-client OIDC signs in in the browser, so the admin completes the sign-in in an isolated
 *   popup and the resulting id_token is checked by the admin-only validate-token endpoint.
 * - Confidential OIDC and SAML sign in on the server: the server starts the test, the popup is sent
 *   to the identity provider, and the outcome is read back by polling.
 * - LDAP and Basic take the admin's credentials in the modal instead of a popup.
 *
 * The admin's current session is never touched: the popup uses a dedicated token store, and the
 * server-driven flows never issue a token or start a session at all.
 * ADR:2026-11-18-sso-test-login-browser-flow-in-vue.
 */
export function useSsoTestLogin(options?: {
  userManagerFactory?: SsoTestUserManagerFactory;
}) {
  const { t } = useI18n();
  const userManagerFactory: SsoTestUserManagerFactory =
    options?.userManagerFactory ?? ((settings) => new UserManager(settings));

  const isTesting = ref(false);
  const configurationCheck = ref<ConfigurationCheckState | undefined>();
  const result = ref<TestLoginResult | undefined>();
  const error = ref<string | undefined>();
  const credentialsSessionId = ref<string | undefined>();
  // Bumping the run id abandons whatever run is in flight: its polling stops and its late
  // responses are ignored, so a slow first test can never overwrite a newer one.
  const runIdRef = ref(0);
  const popupRef = ref<Window | null>(null);

  const isAwaitingCredentials = computed(() => !!credentialsSessionId.value);

  function abandonRun(): void {
    runIdRef.value += 1;
    popupRef.value?.close();
    popupRef.value = null;
  }

  onUnmounted(abandonRun);

  function reset(): void {
    abandonRun();
    isTesting.value = false;
    configurationCheck.value = undefined;
    result.value = undefined;
    error.value = undefined;
    credentialsSessionId.value = undefined;
  }

  async function passesConfigurationCheck(
    securityConfiguration: SecurityConfigurationDocument,
    checkConfiguration: ConfigurationCheck | undefined,
    runId: number,
  ): Promise<boolean> {
    if (!checkConfiguration) {
      return true;
    }
    configurationCheck.value = { status: 'running', problems: [] };
    const outcome = await checkConfiguration(securityConfiguration);
    if (runId !== runIdRef.value) {
      return false;
    }
    configurationCheck.value = {
      status: outcome.passed ? 'passed' : 'failed',
      problems: outcome.problems,
    };
    if (!outcome.passed) {
      error.value = t('sso.testLogin.configurationInvalid');
    }

    return outcome.passed;
  }

  async function runBrowserTestLogin(
    securityConfiguration: SecurityConfigurationDocument,
    runId: number,
    beforeSignIn: () => Promise<boolean>,
  ): Promise<void> {
    let idToken: string | undefined;
    try {
      idToken = await acquireIdToken(securityConfiguration, beforeSignIn, userManagerFactory);
    } catch (err) {
      if (err instanceof ConfigurationCheckFailedError || runId !== runIdRef.value) {
        return;
      }
      // Failure obtaining the token in the popup (cancelled / blocked / refused).
      error.value =
        err instanceof UnsafeSignInUrlError
          ? t('sso.testLogin.unsafeRedirect')
          : t('sso.testLogin.popupFailed');

      return;
    } finally {
      globalThis.localStorage.removeItem(SSO_TEST_LOGIN_CANDIDATE_KEY);
    }
    if (runId !== runIdRef.value) {
      return;
    }

    if (!idToken) {
      error.value = t('sso.testLogin.noToken');

      return;
    }

    const response = await testLoginValidateToken({ securityConfiguration, idToken });
    if (runId === runIdRef.value) {
      result.value = response;
    }
  }

  async function pollUntilSettled(
    testSessionId: string,
    runId: number,
    deadline: number,
  ): Promise<TestLoginResult | undefined> {
    await delay(TEST_LOGIN_POLL_MS);
    if (runId !== runIdRef.value) {
      return undefined;
    }
    const data = await getTestLoginResult(testSessionId);
    if (runId !== runIdRef.value) {
      return undefined;
    }
    const popupClosed = popupRef.value?.closed ?? true;
    if (isTestLoginSettled(data) || popupClosed || Date.now() > deadline) {
      return data;
    }
    result.value = data;

    return pollUntilSettled(testSessionId, runId, deadline);
  }

  async function awaitRedirectResult(
    session: TestLoginSession,
    popup: Window,
    runId: number,
  ): Promise<void> {
    const authorizationUrl = session.authorizationUrl ?? '';
    // The server refuses these too; the popup is same-origin until it leaves, so check here as well.
    if (!isHttpUrl(authorizationUrl)) {
      popup.close();
      error.value = t('sso.testLogin.unsafeRedirect');

      return;
    }
    popup.location.href = authorizationUrl;
    const latest = await pollUntilSettled(
      session.testSessionId,
      runId,
      Date.now() + TEST_LOGIN_TIMEOUT_MS,
    );
    if (runId !== runIdRef.value || !latest) {
      return;
    }
    // Read before closing it ourselves: an admin-closed window means an abandoned sign-in, an
    // open one means the provider never came back (e.g. it rejected the redirect URI).
    const closedByAdmin = popup.closed;
    popup.close();
    result.value = latest;
    if (!isTestLoginSettled(latest)) {
      error.value = closedByAdmin
        ? t('sso.testLogin.popupClosed')
        : t('sso.testLogin.timeout');
    }
  }

  async function runServerTestLogin(
    securityConfiguration: SecurityConfigurationDocument,
    popup: Window | null,
    runId: number,
    beforeSignIn: () => Promise<boolean>,
  ): Promise<void> {
    if (!(await beforeSignIn())) {
      popup?.close();

      return;
    }
    const session = await startTestLogin({ securityConfiguration });
    if (runId !== runIdRef.value) {
      return;
    }
    if (session.requiresCredentials) {
      credentialsSessionId.value = session.testSessionId;
    } else if (session.authorizationUrl && popup) {
      await awaitRedirectResult(session, popup, runId);
    } else {
      // The server could not even begin a sign-in; its result already explains why.
      popup?.close();
      const data = await getTestLoginResult(session.testSessionId);
      if (runId === runIdRef.value) {
        result.value = data;
      }
    }
  }

  async function runTestLogin(
    securityConfiguration: SecurityConfigurationDocument,
    checkConfiguration?: ConfigurationCheck,
  ): Promise<void> {
    reset();
    const runId = runIdRef.value;
    const beforeSignIn = () =>
      passesConfigurationCheck(securityConfiguration, checkConfiguration, runId);
    const auth = securityConfiguration.authenticationConfiguration;
    const provider = typeof auth.provider === 'string' ? auth.provider : undefined;
    const clientType = typeof auth.clientType === 'string' ? auth.clientType : undefined;
    const inBrowser = isBrowserTestLogin(provider, clientType);
    const needsPopup = !inBrowser && provider !== 'ldap' && provider !== 'basic';
    // Opened synchronously, inside the click that started the test: a popup opened after the
    // server responds is no longer a user gesture, and browsers block it.
    const popup = needsPopup
      ? globalThis.open('', TEST_LOGIN_POPUP_NAME, TEST_LOGIN_POPUP_FEATURES)
      : null;
    if (needsPopup && !popup) {
      error.value = t('sso.testLogin.popupBlocked');

      return;
    }
    if (popup) {
      // Cut the identity provider's way back to this page (reverse tabnabbing) while the popup is
      // still blank. The test only polls, so it never needs the link. Without it, though, this
      // page can close the popup only once the provider has sent it back to this origin: one
      // abandoned at the provider stays open on whatever the provider last showed.
      popup.opener = null;
    }
    popupRef.value = popup;
    isTesting.value = true;
    try {
      await (inBrowser
        ? runBrowserTestLogin(securityConfiguration, runId, beforeSignIn)
        : runServerTestLogin(securityConfiguration, popup, runId, beforeSignIn));
    } catch (err) {
      popup?.close();
      if (runId === runIdRef.value) {
        // The admin-only backend call failed (server error / network) — distinct from a
        // cancelled sign-in, and the server's own reason is the most useful thing to show.
        error.value = testLoginErrorText(err, t('sso.testLogin.error'));
      }
    } finally {
      if (runId === runIdRef.value) {
        isTesting.value = false;
      }
    }
  }

  async function submitCredentials(email: string, password: string): Promise<void> {
    if (!credentialsSessionId.value) {
      return;
    }
    const runId = runIdRef.value;
    isTesting.value = true;
    error.value = undefined;
    try {
      const data = await submitTestLoginCredentials({
        testSessionId: credentialsSessionId.value,
        email,
        password,
      });
      if (runId === runIdRef.value) {
        result.value = data;
      }
    } catch (err) {
      if (runId === runIdRef.value) {
        error.value = testLoginErrorText(err, t('sso.testLogin.error'));
      }
    } finally {
      if (runId === runIdRef.value) {
        // The server allows one attempt per test, refused or not, so a retry needs a new test.
        credentialsSessionId.value = undefined;
        isTesting.value = false;
      }
    }
  }

  return {
    isTesting,
    isAwaitingCredentials,
    configurationCheck,
    result,
    error,
    runTestLogin,
    submitCredentials,
    reset,
  };
}
