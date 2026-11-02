/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** AuthProvider values whose login path is POST /v1/users/login (email + Base64 password). */
const PASSWORD_PROVIDERS = new Set(['basic', 'ldap']);

export function normalizeAuthProvider(provider?: string | null): string {
  return (provider || '').trim().toLowerCase();
}

/**
 * Missing provider is treated as basic: stock servers omit or default the field, and
 * hiding the form would lock operators out of the documented login API.
 */
export function supportsPasswordLogin(provider?: string | null): boolean {
  const normalized = normalizeAuthProvider(provider);
  return normalized.length === 0 || PASSWORD_PROVIDERS.has(normalized);
}

export function isSsoOnlyProvider(provider?: string | null): boolean {
  return !supportsPasswordLogin(provider);
}

export function ssoProviderLabel(provider?: string | null, providerName?: string | null): string {
  const named = (providerName || '').trim();
  if (named) {
    return named;
  }
  const normalized = normalizeAuthProvider(provider);
  return normalized || 'SSO';
}

/**
 * SSO sign-in brand names, mirroring official SignInPage's signInButton
 * switch (pages/LoginPage/SignInPage.tsx): fixed brands for the SDK-less
 * providers, providerName fallbacks for the generic ones. Returns null for
 * providers the official switch does not cover — the caller then renders
 * the official sso-provider-not-supported message instead of a button.
 */
const SSO_FIXED_BRANDS: Readonly<Record<string, string>> = {
  google: 'Google',
  okta: 'Okta',
  azure: 'Azure',
  auth0: 'Auth0',
  cognito: 'AWS Cognito',
  'aws-cognito': 'AWS Cognito',
};

export function ssoBrandName(provider?: string | null, providerName?: string | null): string | null {
  const normalized = normalizeAuthProvider(provider);
  if (normalized === 'saml') {
    return (providerName || '').trim() || 'SAML SSO';
  }
  if (normalized === 'customoidc' || normalized === 'custom-oidc') {
    return (providerName || '').trim() || 'SSO';
  }
  return SSO_FIXED_BRANDS[normalized] ?? null;
}

/**
 * Server-driven SSO login URL, mirroring official GenericAuthenticator
 * buildLoginUrl (components/Auth/AppAuthenticators/GenericAuthenticator.tsx):
 * `${base}/api/v1/auth/login?redirectUri=...`. The redirect target prefers
 * the callback URL the server itself advertises in the auth config and
 * falls back to the product's existing callback page (/saml-callback).
 */
export function buildSsoLoginUrl(apiBase: string, callbackUrl: string | undefined, origin: string): string {
  const redirectUri = (callbackUrl || '').trim() || `${origin}/saml-callback`;
  return `${apiBase}/v1/auth/login?redirectUri=${encodeURIComponent(redirectUri)}`;
}
