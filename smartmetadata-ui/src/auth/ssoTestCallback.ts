/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  InMemoryWebStorage,
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from 'oidc-client';
import { TEST_LOGIN_OIDC_SCOPE, type TestLoginPopupCandidate } from '@/admin/ssoTestLogin';
import { SSO_TEST_LOGIN_STORE_PREFIX } from './ssoTestLoginPopup';

export const SSO_TEST_LOGIN_CANDIDATE_KEY = `${SSO_TEST_LOGIN_STORE_PREFIX}candidate`;

/**
 * The redirect URI the test popup sends to the identity provider: the
 * candidate's own callback URL, so the test exercises the actual
 * registered redirect URI. A blank callback falls back to the product's
 * real login callback, the same default the server-driven login uses.
 */
export function resolveTestLoginRedirectUri(callbackUrl?: string): string {
  const trimmed = (callbackUrl ?? '').trim();
  return trimmed || `${globalThis.location.origin}/saml-callback`;
}

/**
 * Build an isolated UserManager config used ONLY for the SSO "Test Login" popup.
 * The tested identity's tokens stay in memory and its sign-in state goes to a
 * dedicated prefixed store (never the app's token storage), but the popup
 * uses the SAME configured callback URL the real login uses — so
 * the test exercises the actual registered redirect URI and never requires the
 * admin to register an extra one. Isolation is achieved by diverting the popup
 * at the callback (see isSsoTestLoginPopup), not by using a separate route.
 */
export const getCandidateUserManagerConfig = (
  candidate: TestLoginPopupCandidate,
): UserManagerSettings => {
  const { authority = '', clientId = '', callbackUrl, scope, responseType } = candidate;

  return {
    authority,
    client_id: clientId,
    redirect_uri: resolveTestLoginRedirectUri(callbackUrl),
    response_type: responseType ?? 'id_token',
    scope: scope || TEST_LOGIN_OIDC_SCOPE,
    loadUserInfo: false,
    monitorSession: false,
    // Only this page reads the tested identity's tokens back, so they are never written to storage.
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    // The same-origin popup finds its sign-in state here (see isSsoTestLoginPopup).
    stateStore: new WebStorageStateStore({
      store: globalThis.localStorage,
      prefix: SSO_TEST_LOGIN_STORE_PREFIX,
    }),
  };
};

/**
 * Runs INSIDE the Test Login popup when it returns from the identity provider to
 * the configured callback URL (the main.ts guard routes here via
 * isSsoTestLoginPopup instead of mounting the app).
 *
 * It completes the OIDC popup handshake against the candidate configuration and
 * hands the resulting token back to the opener. It deliberately does NOT mount
 * the application, so it cannot touch the admin's real session, token storage,
 * or auth context.
 */
export const runSsoTestCallback = async (): Promise<void> => {
  try {
    const raw = globalThis.localStorage.getItem(SSO_TEST_LOGIN_CANDIDATE_KEY);
    const candidate = (raw ? JSON.parse(raw) : {}) as TestLoginPopupCandidate;
    const userManager = new UserManager(getCandidateUserManagerConfig(candidate));
    await userManager.signinPopupCallback();
  } catch {
    // The opener resolves the failure via its signinPopup() rejection/timeout.
  } finally {
    globalThis.close();
  }
};
