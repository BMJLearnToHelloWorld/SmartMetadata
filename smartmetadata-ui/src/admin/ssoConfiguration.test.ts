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
import type { SecurityConfigurationDocument } from '@/api/system';
import {
  carriesOidcSecret,
  isOidcSecretSaveBlocked,
  restoreEmptyOidcSecret,
  storedAcceptsOidcSecret,
  type SsoSecretDocument,
} from './ssoConfiguration';

function documentWith(auth: Record<string, unknown>): SecurityConfigurationDocument {
  return {
    authenticationConfiguration: auth,
    authorizerConfiguration: { defaultOAuthRole: 'DataConsumer' },
  };
}

describe('carriesOidcSecret', () => {
  it('carries for OIDC providers with a confidential client', () => {
    for (const provider of ['google', 'azure', 'okta', 'auth0', 'aws-cognito', 'custom-oidc']) {
      expect(carriesOidcSecret(provider, 'confidential')).toBe(true);
    }
  });

  it('refuses the four non-OIDC providers even when confidential', () => {
    for (const provider of ['basic', 'ldap', 'openmetadata', 'saml']) {
      expect(carriesOidcSecret(provider, 'confidential')).toBe(false);
    }
  });

  it('refuses non-confidential clients', () => {
    expect(carriesOidcSecret('google', 'public')).toBe(false);
    expect(carriesOidcSecret('google', '')).toBe(false);
    expect(carriesOidcSecret('google', undefined)).toBe(false);
  });

  it('refuses a missing or empty provider', () => {
    expect(carriesOidcSecret(undefined, 'confidential')).toBe(false);
    expect(carriesOidcSecret('', 'confidential')).toBe(false);
  });

  it('treats a provider outside the exclusion list as OIDC', () => {
    // The effective side is defined by exclusion, so an unknown value
    // carries; the stored side judges by the server's positive
    // definition instead and rejects the same value.
    expect(carriesOidcSecret('future-provider', 'confidential')).toBe(true);
  });
});

describe('storedAcceptsOidcSecret', () => {
  it.each([
    ['stored OIDC provider with a block', { provider: 'google', oidcConfiguration: { secret: 'old' } }, true],
    ['stored non-OIDC provider with a block', { provider: 'ldap', oidcConfiguration: { secret: 'old' } }, false],
    ['stored OIDC provider without a block', { provider: 'google' }, false],
    ['stored non-OIDC provider without a block', { provider: 'ldap' }, false],
    ['stored OIDC provider with a null block', { provider: 'google', oidcConfiguration: null }, false],
    ['missing stored provider with a block', { oidcConfiguration: { secret: 'old' } }, false],
  ])('%s', (_label, auth, expected) => {
    expect(storedAcceptsOidcSecret(documentWith(auth))).toBe(expected);
  });

  it('mirrors the server positive definition for the stored provider', () => {
    const block = { secret: 'old' };
    expect(storedAcceptsOidcSecret(documentWith({ provider: 'GOOGLE', oidcConfiguration: block }))).toBe(true);
    expect(storedAcceptsOidcSecret(documentWith({ provider: 'my-oidc', oidcConfiguration: block }))).toBe(true);
    expect(storedAcceptsOidcSecret(documentWith({ provider: 'custom-oidc', oidcConfiguration: block }))).toBe(true);
    expect(storedAcceptsOidcSecret(documentWith({ provider: 'future-provider', oidcConfiguration: block }))).toBe(false);
    expect(storedAcceptsOidcSecret(documentWith({ provider: 42, oidcConfiguration: block }))).toBe(false);
  });
});

describe('restoreEmptyOidcSecret', () => {
  const savedWithMaskedSecret = (): SecurityConfigurationDocument =>
    documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'masked-secret-value' },
    });

  it('pins an emptied secret back to the stored value', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '', id: 'cid' },
    });
    const restored = restoreEmptyOidcSecret(candidate, savedWithMaskedSecret());
    expect(
      (restored.authenticationConfiguration?.oidcConfiguration as Record<string, unknown>).secret,
    ).toBe('masked-secret-value');
    expect(
      (restored.authenticationConfiguration?.oidcConfiguration as Record<string, unknown>).id,
    ).toBe('cid');
  });

  it('drops the secret key when the stored document has none', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '' },
    });
    const saved = documentWith({ provider: 'ldap', clientType: 'public' });
    const restored = restoreEmptyOidcSecret(candidate, saved);
    expect(
      'secret' in (restored.authenticationConfiguration?.oidcConfiguration as Record<string, unknown>),
    ).toBe(false);
  });

  it('leaves an emptied secret alone when the stored secret is already empty', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '' },
    });
    const saved = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '' },
    });
    expect(restoreEmptyOidcSecret(candidate, saved)).toBe(candidate);
  });

  it('leaves a non-empty secret and a missing block untouched', () => {
    const withSecret = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'new-secret' },
    });
    expect(restoreEmptyOidcSecret(withSecret, savedWithMaskedSecret())).toBe(withSecret);

    const withoutBlock = documentWith({ provider: 'google', clientType: 'confidential' });
    expect(restoreEmptyOidcSecret(withoutBlock, savedWithMaskedSecret())).toBe(withoutBlock);
  });

  it('never mutates its inputs', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '' },
    });
    const saved = savedWithMaskedSecret();
    restoreEmptyOidcSecret(candidate, saved);
    expect(
      (candidate.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).secret,
    ).toBe('');
    expect(
      (saved.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).secret,
    ).toBe('masked-secret-value');
  });
});

describe('isOidcSecretSaveBlocked', () => {
  const storedGoogleWithBlock = (): SsoSecretDocument =>
    documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'masked-secret-value' },
    });

  it('allows an entered secret when the stored document accepts it', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'new-secret' },
    });
    expect(isOidcSecretSaveBlocked(candidate, storedGoogleWithBlock())).toBe(false);
  });

  it('blocks an entered secret when the stored provider is not OIDC', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'new-secret' },
    });
    const storedLdap = documentWith({ provider: 'ldap', clientType: 'public' });
    expect(isOidcSecretSaveBlocked(candidate, storedLdap)).toBe(true);
  });

  it('blocks an entered secret when the stored document has no block', () => {
    const candidate = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'new-secret' },
    });
    const storedWithoutBlock = documentWith({ provider: 'google', clientType: 'confidential' });
    expect(isOidcSecretSaveBlocked(candidate, storedWithoutBlock)).toBe(true);
  });

  it('does not block for a public client or a non-OIDC provider', () => {
    const storedLdap = documentWith({ provider: 'ldap', clientType: 'public' });
    const publicCandidate = documentWith({
      provider: 'google',
      clientType: 'public',
      oidcConfiguration: { secret: 'new-secret' },
    });
    expect(isOidcSecretSaveBlocked(publicCandidate, storedLdap)).toBe(false);

    const ldapCandidate = documentWith({
      provider: 'ldap',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'new-secret' },
    });
    expect(isOidcSecretSaveBlocked(ldapCandidate, storedLdap)).toBe(false);
  });

  it('does not block an empty secret or an unchanged secret', () => {
    const stored = storedGoogleWithBlock();
    const cleared = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: '' },
    });
    expect(isOidcSecretSaveBlocked(cleared, stored)).toBe(false);

    const untouched = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'masked-secret-value' },
    });
    expect(isOidcSecretSaveBlocked(untouched, stored)).toBe(false);
  });
});
