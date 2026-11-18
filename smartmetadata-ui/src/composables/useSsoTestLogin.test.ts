/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { UserManagerSettings } from 'oidc-client';
import { popupCandidateFor } from '@/admin/ssoTestLogin';
import { ApiError } from '@/api/client';
import type {
  SecurityConfigurationDocument,
  TestLoginResult,
  TestLoginSession,
} from '@/api/system';
import { SSO_TEST_LOGIN_CANDIDATE_KEY } from '@/auth/ssoTestCallback';
import { createTestI18n } from '@/test/i18n';
import { useSsoTestLogin, type ConfigurationCheckOutcome } from './useSsoTestLogin';

const mockGetTestLoginResult = vi.fn();
const mockStartTestLogin = vi.fn();
const mockSubmitTestLoginCredentials = vi.fn();
const mockTestLoginValidateToken = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getTestLoginResult: (...args: unknown[]) => mockGetTestLoginResult(...args),
    startTestLogin: (...args: unknown[]) => mockStartTestLogin(...args),
    submitTestLoginCredentials: (...args: unknown[]) => mockSubmitTestLoginCredentials(...args),
    testLoginValidateToken: (...args: unknown[]) => mockTestLoginValidateToken(...args),
  };
});

const CONFIGURATION_INVALID =
  'The configuration has problems, so Test Login stopped before signing in. Fix them and run Test Login again.';
const POPUP_BLOCKED = 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
const POPUP_CLOSED = 'The sign-in window was closed before the sign-in finished.';
const POPUP_FAILED = 'The test sign-in was cancelled or could not be completed. Please try again.';
const NO_TOKEN = 'No token was returned from the identity provider.';
const UNSAFE_REDIRECT =
  'The identity provider sent a sign-in address that is not an http or https link, so Test Login did not open it.';
const TIMEOUT_ERROR =
  'The sign-in did not finish in time. If the identity provider showed an error in the sign-in window, such as an unregistered redirect URI, fix it and try again.';
const SERVER_ERROR = 'The sign-in could not be validated due to a server error. Please try again.';

const PENDING_RESULT: TestLoginResult = {
  status: 'pending',
  stages: [
    { stage: 'STARTED', status: 'passed' },
    { stage: 'REDIRECTED', status: 'pending' },
  ],
};
const SUCCESS_RESULT: TestLoginResult = {
  status: 'success',
  resolvedEmail: 'admin@example.test',
  stages: [{ stage: 'STARTED', status: 'passed' }],
};
const FAILED_RESULT: TestLoginResult = { status: 'failed', errors: ['login rejected'] };

const REDIRECT_SESSION: TestLoginSession = {
  testSessionId: 'sess-1',
  protocol: 'oidc',
  authorizationUrl: 'https://idp.example/authorize?x=1',
};
const CREDENTIALS_SESSION: TestLoginSession = {
  testSessionId: 'sess-2',
  protocol: 'ldap',
  requiresCredentials: true,
};
const BARE_SESSION: TestLoginSession = { testSessionId: 'sess-3', protocol: 'oidc' };

function candidate(
  provider: string,
  clientType?: string,
  extra: Record<string, unknown> = {},
): SecurityConfigurationDocument {
  return {
    authenticationConfiguration: {
      provider,
      ...(clientType === undefined ? {} : { clientType }),
      ...extra,
    },
    authorizerConfiguration: {},
  };
}

function passingCheck(): (doc: SecurityConfigurationDocument) => Promise<ConfigurationCheckOutcome> {
  return vi.fn(async () => ({ passed: true, problems: [] }));
}

function failingCheck(problems: string[]) {
  return vi.fn(async () => ({ passed: false, problems }));
}

const managerBehavior = {
  endpoint: 'https://idp.example/authorize',
  token: undefined as string | undefined,
  signinError: undefined as unknown,
  seenCandidateKey: null as string | null,
};

function createManager() {
  const manager = {
    metadataService: {
      getAuthorizationEndpoint: vi.fn(async () => managerBehavior.endpoint),
    },
    signinPopup: vi.fn(async () => {
      managerBehavior.seenCandidateKey = localStorage.getItem(SSO_TEST_LOGIN_CANDIDATE_KEY);
      // Mirror oidc-client: the authorization endpoint is read before the
      // popup is sent anywhere, which is what lets the guard run the check.
      await manager.metadataService.getAuthorizationEndpoint();
      if (managerBehavior.signinError) {
        throw managerBehavior.signinError;
      }
      return { id_token: managerBehavior.token };
    }),
  };
  return manager;
}

type FakeManager = ReturnType<typeof createManager>;

interface FakePopup {
  location: { href: string };
  closed: boolean;
  opener: unknown;
  close: ReturnType<typeof vi.fn>;
}

function createPopup(): FakePopup {
  const popup: FakePopup = {
    location: { href: '' },
    closed: false,
    opener: {},
    close: vi.fn(() => {
      popup.closed = true;
    }),
  };
  return popup;
}

describe('useSsoTestLogin', () => {
  let api: ReturnType<typeof useSsoTestLogin>;
  let wrapper: VueWrapper | undefined;
  let createdManagers: FakeManager[];
  let lastSettings: UserManagerSettings | undefined;
  let popup: FakePopup;
  const mockOpen = vi.fn();

  const Harness = defineComponent({
    setup() {
      api = useSsoTestLogin({
        userManagerFactory: (settings) => {
          lastSettings = settings;
          const manager = createManager();
          createdManagers.push(manager);
          return manager;
        },
      });
      return () => h('div');
    },
  });

  function mountHarness() {
    wrapper = mount(Harness, { global: { plugins: [createTestI18n('en-US')] } });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    createdManagers = [];
    lastSettings = undefined;
    popup = createPopup();
    mockOpen.mockReset();
    mockOpen.mockImplementation(() => popup);
    vi.stubGlobal('open', mockOpen);
    mockGetTestLoginResult.mockReset();
    mockStartTestLogin.mockReset();
    mockSubmitTestLoginCredentials.mockReset();
    mockTestLoginValidateToken.mockReset();
    managerBehavior.endpoint = 'https://idp.example/authorize';
    managerBehavior.token = 'test-id-token';
    managerBehavior.signinError = undefined;
    managerBehavior.seenCandidateKey = null;
    localStorage.clear();
    mountHarness();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('browser flow', () => {
    it('checks the configuration, signs in in the popup, and validates the token', async () => {
      const doc = candidate('google', 'public', {
        authority: 'https://accounts.google.com',
        clientId: 'cid',
      });
      const check = passingCheck();
      mockTestLoginValidateToken.mockResolvedValue(SUCCESS_RESULT);
      await api.runTestLogin(doc, check);
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledWith(doc);
      expect(createdManagers).toHaveLength(1);
      expect(createdManagers[0].signinPopup).toHaveBeenCalledTimes(1);
      expect(mockTestLoginValidateToken).toHaveBeenCalledWith({
        securityConfiguration: doc,
        idToken: 'test-id-token',
      });
      expect(api.result.value).toEqual(SUCCESS_RESULT);
      expect(api.isTesting.value).toBe(false);
      expect(api.error.value).toBeUndefined();
      expect(api.configurationCheck.value).toEqual({ status: 'passed', problems: [] });
    });

    it('writes the popup candidate before signing in and removes it afterwards', async () => {
      const doc = candidate('google', 'public', {
        authority: 'https://accounts.google.com',
        clientId: 'cid',
      });
      mockTestLoginValidateToken.mockResolvedValue(SUCCESS_RESULT);
      await api.runTestLogin(doc, passingCheck());
      expect(managerBehavior.seenCandidateKey).toBe(JSON.stringify(popupCandidateFor(doc)));
      expect(localStorage.getItem(SSO_TEST_LOGIN_CANDIDATE_KEY)).toBeNull();
    });

    it('stops before validating when the configuration check fails', async () => {
      const check = failingCheck(['authority is bad']);
      await api.runTestLogin(candidate('google', 'public'), check);
      expect(api.error.value).toBe(CONFIGURATION_INVALID);
      expect(api.configurationCheck.value).toEqual({
        status: 'failed',
        problems: ['authority is bad'],
      });
      expect(mockTestLoginValidateToken).not.toHaveBeenCalled();
      expect(api.result.value).toBeUndefined();
      expect(api.isTesting.value).toBe(false);
      expect(localStorage.getItem(SSO_TEST_LOGIN_CANDIDATE_KEY)).toBeNull();
    });

    it('reports a missing token without calling validate', async () => {
      managerBehavior.token = undefined;
      mockTestLoginValidateToken.mockResolvedValue(SUCCESS_RESULT);
      await api.runTestLogin(candidate('google', 'public'), passingCheck());
      expect(api.error.value).toBe(NO_TOKEN);
      expect(mockTestLoginValidateToken).not.toHaveBeenCalled();
      expect(api.result.value).toBeUndefined();
    });

    it('reports a failed popup sign-in', async () => {
      managerBehavior.signinError = new Error('popup closed');
      await api.runTestLogin(candidate('google', 'public'), passingCheck());
      expect(api.error.value).toBe(POPUP_FAILED);
      expect(mockTestLoginValidateToken).not.toHaveBeenCalled();
    });

    it('refuses a non-http authorization endpoint', async () => {
      managerBehavior.endpoint = 'javascript:alert(1)';
      await api.runTestLogin(candidate('google', 'public'), passingCheck());
      expect(api.error.value).toBe(UNSAFE_REDIRECT);
      expect(mockTestLoginValidateToken).not.toHaveBeenCalled();
    });

    it('uses the code flow with PKCE for code-flow providers', async () => {
      mockTestLoginValidateToken.mockResolvedValue(SUCCESS_RESULT);
      await api.runTestLogin(candidate('okta', 'public'), passingCheck());
      expect(lastSettings?.response_type).toBe('code');
      expect(lastSettings?.scope).toBe('openid email profile');
    });

    it('uses the stored response type otherwise, defaulting to id_token', async () => {
      mockTestLoginValidateToken.mockResolvedValue(SUCCESS_RESULT);
      await api.runTestLogin(
        candidate('google', 'public', { responseType: 'code', authority: 'https://a.example', clientId: 'cid' }),
        passingCheck(),
      );
      expect(lastSettings?.response_type).toBe('code');
      expect(lastSettings?.authority).toBe('https://a.example');
      expect(lastSettings?.client_id).toBe('cid');
      await api.runTestLogin(candidate('google', 'public'), passingCheck());
      expect(lastSettings?.response_type).toBe('id_token');
    });

    it('ignores a late validate response after the run was abandoned', async () => {
      let resolveValidate: ((value: TestLoginResult) => void) | undefined;
      mockTestLoginValidateToken.mockImplementation(
        () =>
          new Promise<TestLoginResult>((resolve) => {
            resolveValidate = resolve;
          }),
      );
      const run = api.runTestLogin(candidate('google', 'public'), passingCheck());
      await flushPromises();
      expect(mockTestLoginValidateToken).toHaveBeenCalledTimes(1);
      api.reset();
      resolveValidate?.(SUCCESS_RESULT);
      await run;
      await flushPromises();
      expect(api.result.value).toBeUndefined();
      expect(api.isTesting.value).toBe(false);
    });
  });

  describe('server flow', () => {
    it('opens the popup synchronously, redirects it, and polls to a settled result', async () => {
      const doc = candidate('google', 'confidential');
      const check = passingCheck();
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockResolvedValue(SUCCESS_RESULT);
      const run = api.runTestLogin(doc, check);
      expect(mockOpen).toHaveBeenCalledWith('', 'omSsoTestLogin', 'width=520,height=680');
      expect(popup.opener).toBeNull();
      await flushPromises();
      expect(check).toHaveBeenCalledWith(doc);
      expect(mockStartTestLogin).toHaveBeenCalledWith({ securityConfiguration: doc });
      expect(popup.location.href).toBe('https://idp.example/authorize?x=1');
      expect(api.isTesting.value).toBe(true);
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await run;
      expect(api.result.value).toEqual(SUCCESS_RESULT);
      expect(popup.close).toHaveBeenCalled();
      expect(api.isTesting.value).toBe(false);
    });

    it('closes the popup and never starts when the configuration check fails', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      await api.runTestLogin(candidate('google', 'confidential'), failingCheck(['bad']));
      expect(popup.close).toHaveBeenCalled();
      expect(mockStartTestLogin).not.toHaveBeenCalled();
      expect(api.error.value).toBe(CONFIGURATION_INVALID);
      expect(api.isTesting.value).toBe(false);
    });

    it('reports a blocked popup without starting anything', async () => {
      mockOpen.mockReturnValue(null);
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(api.error.value).toBe(POPUP_BLOCKED);
      expect(api.isTesting.value).toBe(false);
      expect(mockStartTestLogin).not.toHaveBeenCalled();
    });

    it('asks for credentials without a popup for LDAP', async () => {
      mockStartTestLogin.mockResolvedValue(CREDENTIALS_SESSION);
      await api.runTestLogin(candidate('ldap'), passingCheck());
      expect(mockOpen).not.toHaveBeenCalled();
      expect(api.isAwaitingCredentials.value).toBe(true);
      expect(api.isTesting.value).toBe(false);
      expect(api.result.value).toBeUndefined();
    });

    it('reads a single result without polling when the server starts no redirect', async () => {
      mockStartTestLogin.mockResolvedValue(BARE_SESSION);
      mockGetTestLoginResult.mockResolvedValue(FAILED_RESULT);
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(mockGetTestLoginResult).toHaveBeenCalledTimes(1);
      expect(mockGetTestLoginResult).toHaveBeenCalledWith('sess-3');
      expect(popup.close).toHaveBeenCalled();
      expect(api.result.value).toEqual(FAILED_RESULT);
    });

    it('renders intermediate pending results while polling', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult
        .mockResolvedValueOnce(PENDING_RESULT)
        .mockResolvedValueOnce(SUCCESS_RESULT);
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      expect(api.result.value).toEqual(PENDING_RESULT);
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await run;
      expect(api.result.value).toEqual(SUCCESS_RESULT);
    });

    it('polls every two seconds', async () => {
      const pollTimes: number[] = [];
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockImplementation(async () => {
        pollTimes.push(Date.now());
        return pollTimes.length < 3 ? PENDING_RESULT : SUCCESS_RESULT;
      });
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await run;
      expect(pollTimes).toHaveLength(3);
      expect(pollTimes[1] - pollTimes[0]).toBe(2000);
      expect(pollTimes[2] - pollTimes[1]).toBe(2000);
    });

    it('reports an admin-closed popup with the last pending result', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockResolvedValue(PENDING_RESULT);
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      popup.closed = true;
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      await run;
      expect(api.result.value).toEqual(PENDING_RESULT);
      expect(api.error.value).toBe(POPUP_CLOSED);
    });

    it('times out after three minutes of pending polls', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockResolvedValue(PENDING_RESULT);
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      await vi.advanceTimersByTimeAsync(200000);
      await flushPromises();
      await run;
      expect(api.result.value).toEqual(PENDING_RESULT);
      expect(api.error.value).toBe(TIMEOUT_ERROR);
      expect(mockGetTestLoginResult).toHaveBeenCalledTimes(91);
    });

    it('refuses a non-http authorization URL from the server', async () => {
      mockStartTestLogin.mockResolvedValue({
        ...REDIRECT_SESSION,
        authorizationUrl: 'javascript:alert(1)',
      });
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(api.error.value).toBe(UNSAFE_REDIRECT);
      expect(popup.close).toHaveBeenCalled();
      expect(mockGetTestLoginResult).not.toHaveBeenCalled();
    });

    it('shows the server reason when starting the test fails', async () => {
      mockStartTestLogin.mockRejectedValue(
        new ApiError(500, JSON.stringify({ message: 'IdP unreachable' })),
      );
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(api.error.value).toBe('IdP unreachable');
      expect(popup.close).toHaveBeenCalled();
    });

    it('falls back to the generic error when the server body carries no reason', async () => {
      mockStartTestLogin.mockRejectedValue(new ApiError(500, 'not json'));
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(api.error.value).toBe(SERVER_ERROR);
    });

    it('abandons polling when the run is reset', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockResolvedValue(SUCCESS_RESULT);
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      api.reset();
      await vi.advanceTimersByTimeAsync(4000);
      await flushPromises();
      await run;
      expect(api.result.value).toBeUndefined();
      expect(api.error.value).toBeUndefined();
      expect(api.isTesting.value).toBe(false);
    });

    it('closes the popup when the component unmounts mid-run', async () => {
      mockStartTestLogin.mockResolvedValue(REDIRECT_SESSION);
      mockGetTestLoginResult.mockResolvedValue(PENDING_RESULT);
      const run = api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      await flushPromises();
      wrapper?.unmount();
      wrapper = undefined;
      expect(popup.close).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4000);
      await flushPromises();
      await run;
    });
  });

  describe('credentials flow', () => {
    async function awaitCredentials() {
      mockStartTestLogin.mockResolvedValue(CREDENTIALS_SESSION);
      await api.runTestLogin(candidate('ldap'), passingCheck());
      expect(api.isAwaitingCredentials.value).toBe(true);
    }

    it('submits the credentials once and reports the outcome', async () => {
      await awaitCredentials();
      mockSubmitTestLoginCredentials.mockResolvedValue(SUCCESS_RESULT);
      await api.submitCredentials('admin@example.test', 'secret');
      expect(mockSubmitTestLoginCredentials).toHaveBeenCalledWith({
        testSessionId: 'sess-2',
        email: 'admin@example.test',
        password: 'secret',
      });
      expect(api.result.value).toEqual(SUCCESS_RESULT);
      expect(api.isAwaitingCredentials.value).toBe(false);
      expect(api.isTesting.value).toBe(false);
    });

    it('silently ignores a submit with no credentials session', async () => {
      await api.submitCredentials('admin@example.test', 'secret');
      expect(mockSubmitTestLoginCredentials).not.toHaveBeenCalled();
      expect(api.error.value).toBeUndefined();
    });

    it('clears the credentials session even when the submit fails', async () => {
      await awaitCredentials();
      mockSubmitTestLoginCredentials.mockRejectedValue(
        new ApiError(500, JSON.stringify({ error: 'bad credentials' })),
      );
      await api.submitCredentials('admin@example.test', 'wrong');
      expect(api.error.value).toBe('bad credentials');
      expect(api.isAwaitingCredentials.value).toBe(false);
      expect(api.isTesting.value).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears every piece of state', async () => {
      mockStartTestLogin.mockResolvedValue(BARE_SESSION);
      mockGetTestLoginResult.mockResolvedValue(FAILED_RESULT);
      await api.runTestLogin(candidate('google', 'confidential'), passingCheck());
      expect(api.result.value).toEqual(FAILED_RESULT);
      api.reset();
      expect(api.result.value).toBeUndefined();
      expect(api.error.value).toBeUndefined();
      expect(api.configurationCheck.value).toBeUndefined();
      expect(api.isTesting.value).toBe(false);
      expect(api.isAwaitingCredentials.value).toBe(false);
    });
  });
});
