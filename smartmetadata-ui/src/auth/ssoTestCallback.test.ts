/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserManagerSettings } from 'oidc-client';

const callbackState = vi.hoisted(() => ({
  instances: [] as Array<{
    settings: UserManagerSettings;
    signinPopupCallback: ReturnType<typeof vi.fn>;
  }>,
  failCallback: false,
}));

vi.mock('oidc-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('oidc-client')>();
  // oidc-client ships CommonJS: under vitest's interop its exports surface
  // on the default export, so a plain spread of the namespace misses them.
  const fallback = (actual as unknown as { default?: typeof import('oidc-client') }).default;
  const real = { ...fallback, ...actual };
  class FakeUserManager {
    settings: UserManagerSettings;
    signinPopupCallback = vi.fn(async () => {
      if (callbackState.failCallback) {
        throw new Error('callback failed');
      }
    });

    constructor(settings: UserManagerSettings) {
      this.settings = settings;
      callbackState.instances.push(this);
    }
  }
  return { ...real, UserManager: FakeUserManager };
});

import {
  getCandidateUserManagerConfig,
  resolveTestLoginRedirectUri,
  runSsoTestCallback,
  SSO_TEST_LOGIN_CANDIDATE_KEY,
} from './ssoTestCallback';
import { SSO_TEST_LOGIN_STORE_PREFIX } from './ssoTestLoginPopup';

describe('resolveTestLoginRedirectUri', () => {
  it('trims the candidate callback URL and uses it as-is', () => {
    expect(resolveTestLoginRedirectUri('  https://app.test/custom-callback  ')).toBe(
      'https://app.test/custom-callback',
    );
  });

  it('falls back to the product login callback for a blank or missing URL', () => {
    expect(resolveTestLoginRedirectUri('')).toBe(`${window.location.origin}/saml-callback`);
    expect(resolveTestLoginRedirectUri('   ')).toBe(`${window.location.origin}/saml-callback`);
    expect(resolveTestLoginRedirectUri(undefined)).toBe(`${window.location.origin}/saml-callback`);
  });
});

describe('getCandidateUserManagerConfig', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('maps the candidate onto an isolated manager config', () => {
    const config = getCandidateUserManagerConfig({
      authority: 'https://idp.example',
      clientId: 'cid',
      callbackUrl: 'https://app.test/callback',
      responseType: 'code',
      scope: 'openid email',
    });
    expect(config.authority).toBe('https://idp.example');
    expect(config.client_id).toBe('cid');
    expect(config.redirect_uri).toBe('https://app.test/callback');
    expect(config.response_type).toBe('code');
    expect(config.scope).toBe('openid email');
    expect(config.loadUserInfo).toBe(false);
    expect(config.monitorSession).toBe(false);
  });

  it('defaults the response type and scope when the candidate omits them', () => {
    const config = getCandidateUserManagerConfig({ authority: 'https://idp.example' });
    expect(config.response_type).toBe('id_token');
    expect(config.scope).toBe('openid email profile');
    expect(config.client_id).toBe('');
    expect(config.redirect_uri).toBe(`${window.location.origin}/saml-callback`);
  });

  it('keeps tokens in memory, never in localStorage', async () => {
    const config = getCandidateUserManagerConfig({ authority: 'https://idp.example' });
    await config.userStore?.set('user-key', 'token-value');
    expect(localStorage.getItem('user-key')).toBeNull();
    expect(await config.userStore?.get('user-key')).toBe('token-value');
  });

  it('writes sign-in state under the dedicated prefixed store', async () => {
    const config = getCandidateUserManagerConfig({ authority: 'https://idp.example' });
    await config.stateStore?.set('state-1', 'state-value');
    expect(localStorage.getItem(`${SSO_TEST_LOGIN_STORE_PREFIX}state-1`)).toBe('state-value');
    expect(await config.stateStore?.get('state-1')).toBe('state-value');
  });
});

describe('runSsoTestCallback', () => {
  const closeWindow = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    callbackState.instances.length = 0;
    callbackState.failCallback = false;
    closeWindow.mockClear();
    vi.stubGlobal('close', closeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('completes the popup handshake with the stored candidate and closes', async () => {
    localStorage.setItem(
      SSO_TEST_LOGIN_CANDIDATE_KEY,
      JSON.stringify({
        authority: 'https://idp.example',
        clientId: 'cid',
        callbackUrl: 'https://app.test/callback',
        responseType: 'id_token',
      }),
    );
    await runSsoTestCallback();
    expect(callbackState.instances).toHaveLength(1);
    const [instance] = callbackState.instances;
    expect(instance.settings.authority).toBe('https://idp.example');
    expect(instance.settings.client_id).toBe('cid');
    expect(instance.settings.redirect_uri).toBe('https://app.test/callback');
    expect(instance.signinPopupCallback).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it('still closes without throwing when no candidate was stored', async () => {
    await runSsoTestCallback();
    expect(callbackState.instances).toHaveLength(1);
    expect(callbackState.instances[0].settings.authority).toBe('');
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it('still closes without throwing when the stored candidate is invalid JSON', async () => {
    localStorage.setItem(SSO_TEST_LOGIN_CANDIDATE_KEY, '{not json');
    await runSsoTestCallback();
    expect(callbackState.instances).toHaveLength(0);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it('still closes when the popup callback itself fails', async () => {
    callbackState.failCallback = true;
    localStorage.setItem(
      SSO_TEST_LOGIN_CANDIDATE_KEY,
      JSON.stringify({ authority: 'https://idp.example' }),
    );
    await runSsoTestCallback();
    expect(callbackState.instances).toHaveLength(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
