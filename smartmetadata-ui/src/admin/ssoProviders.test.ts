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
  getSsoDefaultClientType,
  getSsoProviderDisplayName,
  getSsoProviderIcon,
  getSsoProviderJwtClaims,
  isSsoValidUrl,
  splitSsoCsv,
  SSO_PROVIDER_FIELD_MAPPINGS,
  SSO_PROVIDER_OPTIONS,
} from './ssoProviders';

describe('getSsoProviderDisplayName', () => {
  it.each([
    ['azure', 'Azure AD'],
    ['google', 'Google'],
    ['okta', 'Okta'],
    ['auth0', 'Auth0'],
    ['aws-cognito', 'AWS Cognito'],
    ['saml', 'SAML'],
    ['custom-oidc', 'Custom OIDC'],
    ['basic', 'Basic Authentication'],
    ['ldap', 'Ldap'],
    ['openmetadata', 'Openmetadata'],
    ['unknown-provider', 'Unknown-provider'],
    ['', ''],
  ])('maps %s to %s', (provider, expected) => {
    expect(getSsoProviderDisplayName(provider)).toBe(expected);
  });
});

describe('getSsoProviderIcon', () => {
  it('returns null for every provider until the pin assets land', () => {
    for (const provider of [
      'google',
      'azure',
      'okta',
      'saml',
      'aws-cognito',
      'custom-oidc',
      'ldap',
      'auth0',
      'basic',
      'openmetadata',
      'unknown',
    ]) {
      expect(getSsoProviderIcon(provider)).toBeNull();
    }
  });
});

describe('SSO_PROVIDER_OPTIONS', () => {
  it('lists eight cards in pin order with hyphenated labels', () => {
    expect(SSO_PROVIDER_OPTIONS.map((option) => option.key)).toEqual([
      'google',
      'azure',
      'okta',
      'saml',
      'aws-cognito',
      'custom-oidc',
      'ldap',
      'auth0',
    ]);
    expect(SSO_PROVIDER_OPTIONS.map((option) => option.label)).toEqual([
      'Google',
      'Azure AD',
      'Okta',
      'SAML',
      'AWS-Cognito',
      'Custom-OIDC',
      'LDAP',
      'Auth0',
    ]);
  });
});

describe('getSsoProviderJwtClaims', () => {
  it.each([
    ['azure', ['preferred_username', 'email', 'upn', 'sub']],
    ['auth0', ['email', 'name', 'sub']],
    ['aws-cognito', ['email', 'cognito:username', 'sub']],
    ['google', ['email', 'preferred_username', 'sub']],
    ['basic', ['email', 'preferred_username', 'sub']],
    ['openmetadata', ['email', 'preferred_username', 'sub']],
    ['unknown', ['email', 'preferred_username', 'sub']],
  ])('returns the %s claim order', (provider, expected) => {
    expect(getSsoProviderJwtClaims(provider)).toEqual(expected);
  });
});

describe('getSsoDefaultClientType', () => {
  it('returns public only for saml and ldap', () => {
    expect(getSsoDefaultClientType('saml')).toBe('public');
    expect(getSsoDefaultClientType('ldap')).toBe('public');
    for (const provider of ['google', 'azure', 'okta', 'auth0', 'aws-cognito', 'custom-oidc', 'basic', 'openmetadata']) {
      expect(getSsoDefaultClientType(provider)).toBe('confidential');
    }
  });
});

describe('SSO_PROVIDER_FIELD_MAPPINGS', () => {
  it('keeps the customoidc key mismatch verbatim', () => {
    expect(SSO_PROVIDER_FIELD_MAPPINGS['customoidc']).toEqual([
      'ldapConfiguration',
      'samlConfiguration',
    ]);
    expect(SSO_PROVIDER_FIELD_MAPPINGS['custom-oidc']).toBeUndefined();
  });
});

describe('isSsoValidUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://localhost:8585/callback', true],
    ['  https://example.com/x  ', true],
    ['ftp://example.com', false],
    ['example.com', false],
    ['https://', false],
    ['https://exa mple.com', false],
    ['', false],
  ])('validates %s as %s', (value, expected) => {
    expect(isSsoValidUrl(value)).toBe(expected);
  });
});

describe('splitSsoCsv', () => {
  it.each([
    ['a,b,c', ['a', 'b', 'c']],
    ['a, b ,c', ['a', 'b', 'c']],
    ['"a,b",c', ['a,b', 'c']],
    ['"a""b",c', ['a"b', 'c']],
    [' \\"a\\" ,b', ['"a"', 'b']],
    [' "a" ,b', ['a', 'b']],
    ['', []],
    ['a\nb,c', ['a']],
    ['\n\na,b', ['a', 'b']],
    ['a,', ['a', '']],
    ['single', ['single']],
    // Papaparse ground truth: a quote after a space is not a field
    // opener, so the comma inside splits and the quotes survive.
    ['email, sub, "a,b"', ['email', 'sub', '"a', 'b"']],
  ])('splits %s', (input, expected) => {
    expect(splitSsoCsv(input)).toEqual(expected);
  });

  it('keeps commas and line breaks inside quoted cells', () => {
    expect(splitSsoCsv('"a\nb",c')).toEqual(['a\nb', 'c']);
  });
});
