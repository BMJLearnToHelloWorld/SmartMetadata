/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Session-expiry notification channel.
 *
 * The API client clears the local session on HTTP 401, but it cannot
 * navigate (it has no router). It dispatches this event instead; the
 * app root listens and redirects to /login with the current path as
 * the redirect target. This closes the Stage 1–8 gap where a 401 left
 * the user sitting on a dead page until the next navigation.
 *
 * Deliberately not a silent token refresh: the product has no
 * auth/refresh endpoint wired (official `auth/refresh` / `saml/refresh`
 * have no product counterpart), so expiry means re-login, stated
 * plainly rather than faked.
 */
export const SESSION_EXPIRED_EVENT = 'sm:session-expired';

export function dispatchSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}
