/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { isSsoOnlyProvider, ssoProviderLabel, supportsPasswordLogin } from './authProvider';

describe('authProvider', () => {
  it('treats basic and ldap as password login', () => {
    expect(supportsPasswordLogin('basic')).toBe(true);
    expect(supportsPasswordLogin('LDAP')).toBe(true);
    expect(supportsPasswordLogin(undefined)).toBe(true);
    expect(supportsPasswordLogin('')).toBe(true);
  });

  it('treats OIDC and SAML providers as SSO-only', () => {
    for (const provider of ['google', 'okta', 'auth0', 'azure', 'custom-oidc', 'aws-cognito', 'saml']) {
      expect(isSsoOnlyProvider(provider)).toBe(true);
      expect(supportsPasswordLogin(provider)).toBe(false);
    }
  });

  it('prefers the server providerName for the SSO message', () => {
    expect(ssoProviderLabel('okta', 'Company Okta')).toBe('Company Okta');
    expect(ssoProviderLabel('google')).toBe('google');
  });
});
