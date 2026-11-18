/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

// This module must not import any application code: the main.ts guard
// runs it before the application mounts, inside the isolated Test Login
// popup, where loading the app graph would defeat the isolation.

// Dedicated, prefixed storage namespace so the Test Login popup never reads or
// writes the app's real auth state, while remaining shareable between the
// opener and the same-origin popup so the OIDC handshake completes.
export const SSO_TEST_LOGIN_STORE_PREFIX = 'omSsoTestLogin.';

/**
 * Test Login points a same-origin popup at a sign-in address that comes from the candidate identity
 * provider. Anything other than http(s) — a `javascript:` or `data:` URL — would run in this origin.
 */
export const isHttpUrl = (url?: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(url ?? '').protocol);
  } catch {
    return false;
  }
};

/** Raised instead of sending the Test Login popup to a sign-in address that is not http(s). */
export class UnsafeSignInUrlError extends Error {}

/**
 * Returns true only when the current document is the SSO "Test Login" popup
 * returning from the identity provider.
 *
 * The Test Login popup reuses the admin's CONFIGURED callback URL (so the test
 * exercises the real, registered redirect URI), so we must distinguish it from a
 * normal login landing on the same callback. The discriminator is precise and
 * fails closed: it requires an opener window AND an OIDC `state` that exists in
 * the dedicated Test Login store. A real login never writes that prefixed store,
 * so a real callback is never diverted.
 */
export const isSsoTestLoginPopup = (): boolean => {
  let isTestPopup = false;
  try {
    const hasOpener =
      typeof window !== 'undefined' && window.opener != null && window.opener !== window;
    if (hasOpener) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const state =
        hashParams.get('state') ?? new URLSearchParams(window.location.search).get('state');
      isTestPopup =
        !!state && window.localStorage.getItem(SSO_TEST_LOGIN_STORE_PREFIX + state) !== null;
    }
  } catch {
    isTestPopup = false;
  }

  return isTestPopup;
};
