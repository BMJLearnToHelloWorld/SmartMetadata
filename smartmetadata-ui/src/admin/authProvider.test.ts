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
import {
  buildSsoLoginUrl,
  isSsoOnlyProvider,
  ssoBrandName,
  ssoProviderLabel,
  supportsPasswordLogin,
} from './authProvider';

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

  it('maps SSO providers to official sign-in brand names', () => {
    expect(ssoBrandName('google')).toBe('Google');
    expect(ssoBrandName('okta')).toBe('Okta');
    expect(ssoBrandName('azure')).toBe('Azure');
    expect(ssoBrandName('auth0')).toBe('Auth0');
    expect(ssoBrandName('cognito')).toBe('AWS Cognito');
    expect(ssoBrandName('aws-cognito')).toBe('AWS Cognito');
    expect(ssoBrandName('saml', 'Company SAML')).toBe('Company SAML');
    expect(ssoBrandName('saml')).toBe('SAML SSO');
    expect(ssoBrandName('customOidc', 'Company SSO')).toBe('Company SSO');
    expect(ssoBrandName('customOidc')).toBe('SSO');
  });

  it('returns null for providers the official sign-in switch does not cover', () => {
    expect(ssoBrandName('unknown-provider')).toBeNull();
    expect(ssoBrandName('basic')).toBeNull();
    expect(ssoBrandName(undefined)).toBeNull();
  });

  it('builds the server-driven SSO login URL with the advertised callback first', () => {
    expect(buildSsoLoginUrl('/api', 'https://idp.example/callback', 'https://console.example')).toBe(
      '/api/v1/auth/login?redirectUri=https%3A%2F%2Fidp.example%2Fcallback',
    );
    expect(buildSsoLoginUrl('/api', undefined, 'https://console.example')).toBe(
      '/api/v1/auth/login?redirectUri=https%3A%2F%2Fconsole.example%2Fsaml-callback',
    );
  });
});
