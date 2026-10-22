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
