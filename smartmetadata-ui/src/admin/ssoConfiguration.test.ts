/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { SecurityConfigurationDocument } from '@/api/system';
import {
  applySecurityFieldErrors,
  buildCandidateConfiguration,
  carriesOidcSecret,
  clearFieldErrorForKey,
  firstErrorControlKey,
  FORM_FIELD_ORDER,
  storedAcceptsOidcSecret,
  type ManagedInfo,
} from './ssoConfiguration';

const EDITABLE: ManagedInfo = { authenticationEditable: true, authenticationManagedPaths: [] };

function documentWith(auth: Record<string, unknown>): SecurityConfigurationDocument {
  return {
    authenticationConfiguration: auth,
    authorizerConfiguration: { defaultOAuthRole: 'DataConsumer' },
  };
}

describe('applySecurityFieldErrors', () => {
  it('maps the seven form paths onto their fields', () => {
    const { fieldErrors, problems } = applySecurityFieldErrors([
      { field: 'authenticationConfiguration.provider', error: 'bad provider' },
      { field: 'authenticationConfiguration.providerName', error: 'bad name' },
      { field: 'authenticationConfiguration.clientType', error: 'bad type' },
      { field: 'authenticationConfiguration.authority', error: 'bad authority' },
      { field: 'authenticationConfiguration.clientId', error: 'bad id' },
      { field: 'authenticationConfiguration.callbackUrl', error: 'bad url' },
      { field: 'authenticationConfiguration.enableSelfSignup', error: 'bad signup' },
    ]);
    expect(fieldErrors).toEqual({
      provider: 'bad provider',
      providerName: 'bad name',
      clientType: 'bad type',
      authority: 'bad authority',
      clientId: 'bad id',
      callbackUrl: 'bad url',
      enableSelfSignup: 'bad signup',
    });
    expect(problems).toEqual([]);
  });

  it('sends every unmapped path to the problems list, never dropping one', () => {
    const { fieldErrors, problems } = applySecurityFieldErrors([
      { field: 'authenticationConfiguration.oidcConfiguration.secret', error: 'secret bad' },
      { field: 'authenticationConfiguration.oidcConfiguration.discoveryUri', error: 'uri bad' },
      { field: 'authenticationConfiguration.samlConfiguration.idp.entityId', error: 'saml bad' },
      { field: 'authenticationConfiguration', error: 'whole section bad' },
      { field: 'authenticationConfiguration.provider.extra', error: 'deeper bad' },
      { field: 'authorizerConfiguration.defaultOAuthRole', error: 'role bad' },
      { field: 'authenticationConfiguration.clientSecret', error: 'secret field bad' },
      { field: '', error: 'blank field bad' },
      { field: 'general', error: 'general bad' },
      { field: 'unknown.path', error: 'unknown bad' },
      { field: 'authenticationConfiguration.jwtTokenExpiry', error: 'expiry bad' },
    ]);
    expect(fieldErrors).toEqual({});
    expect(problems).toEqual([
      'authenticationConfiguration.oidcConfiguration.secret: secret bad',
      'authenticationConfiguration.oidcConfiguration.discoveryUri: uri bad',
      'authenticationConfiguration.samlConfiguration.idp.entityId: saml bad',
      'authenticationConfiguration: whole section bad',
      'authenticationConfiguration.provider.extra: deeper bad',
      'authorizerConfiguration.defaultOAuthRole: role bad',
      'authenticationConfiguration.clientSecret: secret field bad',
      'blank field bad',
      'general: general bad',
      'unknown.path: unknown bad',
      'authenticationConfiguration.jwtTokenExpiry: expiry bad',
    ]);
  });

  it('lets a later error for the same field overwrite the earlier one', () => {
    const { fieldErrors } = applySecurityFieldErrors([
      { field: 'authenticationConfiguration.clientId', error: 'first' },
      { field: 'authenticationConfiguration.clientId', error: 'second' },
    ]);
    expect(fieldErrors).toEqual({ clientId: 'second' });
  });

  it('does not deduplicate problems', () => {
    const { problems } = applySecurityFieldErrors([
      { field: 'general', error: 'same' },
      { field: 'general', error: 'same' },
    ]);
    expect(problems).toEqual(['general: same', 'general: same']);
  });
});

describe('clearFieldErrorForKey / firstErrorControlKey', () => {
  it('clears only the named field', () => {
    const fieldErrors = { provider: 'bad', clientId: 'bad' };
    clearFieldErrorForKey(fieldErrors, 'provider');
    expect(fieldErrors).toEqual({ clientId: 'bad' });
  });

  it('returns the earliest errored field in form order', () => {
    expect(
      firstErrorControlKey({ callbackUrl: 'x', provider: 'y' }, [], FORM_FIELD_ORDER),
    ).toBe('provider');
    expect(
      firstErrorControlKey({ callbackUrl: 'x', clientId: 'y' }, [], FORM_FIELD_ORDER),
    ).toBe('clientId');
    expect(
      firstErrorControlKey({ enableSelfSignup: 'x' }, [], FORM_FIELD_ORDER),
    ).toBe('enableSelfSignup');
  });

  it("falls back to 'problems' only when the problems list is non-empty", () => {
    expect(firstErrorControlKey({}, ['p'], FORM_FIELD_ORDER)).toBe('problems');
    expect(firstErrorControlKey({}, [], FORM_FIELD_ORDER)).toBeUndefined();
    expect(firstErrorControlKey({ provider: 'x' }, ['p'], FORM_FIELD_ORDER)).toBe('provider');
  });
});

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

describe('buildCandidateConfiguration', () => {
  it('overlays form values onto the stored document and keeps unshown fields', () => {
    const raw = documentWith({
      provider: 'google',
      clientId: 'old',
      authority: 'https://old.example',
      oidcConfiguration: { discoveryUri: 'https://old.example/.well-known' },
      sessionExpiry: 3600,
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientId: 'new', authority: 'https://okta.example' },
      EDITABLE,
      '',
    );
    expect(candidate.authenticationConfiguration.provider).toBe('okta');
    expect(candidate.authenticationConfiguration.clientId).toBe('new');
    expect(candidate.authenticationConfiguration.authority).toBe('https://okta.example');
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({
      discoveryUri: 'https://old.example/.well-known',
    });
    expect(candidate.authenticationConfiguration.sessionExpiry).toBe(3600);
    expect(candidate.authorizerConfiguration).toEqual({ defaultOAuthRole: 'DataConsumer' });
  });

  it('deletes a key for an empty or missing form value, but writes false through', () => {
    const raw = documentWith({
      provider: 'google',
      clientId: 'cid',
      authority: 'https://a.example',
      enableSelfSignup: true,
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'google', clientId: '', enableSelfSignup: false },
      EDITABLE,
      '',
    );
    expect('clientId' in candidate.authenticationConfiguration).toBe(false);
    expect('authority' in candidate.authenticationConfiguration).toBe(false);
    expect(candidate.authenticationConfiguration.enableSelfSignup).toBe(false);
  });

  it('overlays providerName only for custom-oidc and leaves the stored value otherwise', () => {
    const raw = documentWith({ provider: 'google', providerName: 'Stored' });
    const google = buildCandidateConfiguration(
      raw,
      { provider: 'google', providerName: 'Typed' },
      EDITABLE,
      '',
    );
    expect(google.authenticationConfiguration.providerName).toBe('Stored');
    const custom = buildCandidateConfiguration(
      raw,
      { provider: 'custom-oidc', providerName: 'Typed' },
      EDITABLE,
      '',
    );
    expect(custom.authenticationConfiguration.providerName).toBe('Typed');
    const customCleared = buildCandidateConfiguration(
      raw,
      { provider: 'custom-oidc', providerName: '' },
      EDITABLE,
      '',
    );
    expect('providerName' in customCleared.authenticationConfiguration).toBe(false);
  });

  it('returns a deep copy of the stored document when the section is not editable', () => {
    const raw = documentWith({ provider: 'google', nested: { value: 1 } });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta' },
      { authenticationEditable: false, authenticationManagedPaths: [] },
      '',
    );
    expect(candidate).toEqual(raw);
    expect(candidate).not.toBe(raw);
    expect(candidate.authenticationConfiguration).not.toBe(raw.authenticationConfiguration);
  });

  it('pins a managed leaf back to the stored value', () => {
    const raw = documentWith({ provider: 'google', clientId: 'stored' });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientId: 'typed' },
      { authenticationEditable: true, authenticationManagedPaths: ['/provider'] },
      '',
    );
    expect(candidate.authenticationConfiguration.provider).toBe('google');
    expect(candidate.authenticationConfiguration.clientId).toBe('typed');
  });

  it('pins a nested managed pointer back to the stored value', () => {
    const raw = documentWith({
      provider: 'saml',
      samlConfiguration: { security: { tokenValidity: 300 } },
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'saml' },
      {
        authenticationEditable: true,
        authenticationManagedPaths: ['/samlConfiguration/security/tokenValidity'],
      },
      '',
    );
    expect(candidate.authenticationConfiguration.samlConfiguration).toEqual({
      security: { tokenValidity: 300 },
    });
  });

  it('removes a managed field that has no stored value', () => {
    const raw = documentWith({ provider: 'google' });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'google', clientId: 'typed' },
      { authenticationEditable: true, authenticationManagedPaths: ['/clientId'] },
      '',
    );
    expect('clientId' in candidate.authenticationConfiguration).toBe(false);
  });

  it('replaces the whole section with the stored clone for an empty pointer', () => {
    const raw = documentWith({ provider: 'google', clientId: 'stored' });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientId: 'typed' },
      { authenticationEditable: true, authenticationManagedPaths: [''] },
      '',
    );
    expect(candidate.authenticationConfiguration).toEqual({
      provider: 'google',
      clientId: 'stored',
    });
  });

  it('unescapes ~0 and ~1 in managed pointers', () => {
    const raw = documentWith({ provider: 'google', 'a/b': 'slash', 'c~d': 'tilde' });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta' },
      {
        authenticationEditable: true,
        authenticationManagedPaths: ['/a~1b', '/c~0d'],
      },
      '',
    );
    expect(candidate.authenticationConfiguration['a/b']).toBe('slash');
    expect(candidate.authenticationConfiguration['c~d']).toBe('tilde');
  });

  it('never mutates the stored document and isolates the candidate from it', () => {
    const raw = documentWith({
      provider: 'google',
      oidcConfiguration: { discoveryUri: 'https://a.example' },
    });
    const before = JSON.parse(JSON.stringify(raw)) as SecurityConfigurationDocument;
    const candidate = buildCandidateConfiguration(raw, { provider: 'okta' }, EDITABLE, '');
    expect(raw).toEqual(before);
    (candidate.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).discoveryUri =
      'https://mutated.example';
    expect(
      (raw.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).discoveryUri,
    ).toBe('https://a.example');
    const second = buildCandidateConfiguration(raw, { provider: 'okta' }, EDITABLE, '');
    expect(second.authenticationConfiguration.oidcConfiguration).not.toBe(
      candidate.authenticationConfiguration.oidcConfiguration,
    );
  });

  it('keeps the stored secret when no secret is typed', () => {
    const raw = documentWith({
      provider: 'okta',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'stored-secret', discoveryUri: 'https://okta.example/.well-known' },
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientType: 'confidential' },
      EDITABLE,
      '',
    );
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({
      secret: 'stored-secret',
      discoveryUri: 'https://okta.example/.well-known',
    });
    expect(raw.authenticationConfiguration.oidcConfiguration).toEqual({
      secret: 'stored-secret',
      discoveryUri: 'https://okta.example/.well-known',
    });
  });

  it('writes a typed secret into the existing block and leaves the other keys alone', () => {
    const raw = documentWith({
      provider: 'okta',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'old-secret', discoveryUri: 'https://okta.example/.well-known' },
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientType: 'confidential' },
      EDITABLE,
      'new-secret',
    );
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({
      secret: 'new-secret',
      discoveryUri: 'https://okta.example/.well-known',
    });
    expect(
      (raw.authenticationConfiguration.oidcConfiguration as Record<string, unknown>).secret,
    ).toBe('old-secret');
  });

  it('creates a block holding only the secret when the stored document has none', () => {
    const raw = documentWith({ provider: 'okta', clientType: 'confidential' });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientType: 'confidential' },
      EDITABLE,
      'new-secret',
    );
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({ secret: 'new-secret' });
    expect('oidcConfiguration' in raw.authenticationConfiguration).toBe(false);
  });

  it('replaces a null block with a block holding only the secret', () => {
    const raw = documentWith({
      provider: 'okta',
      clientType: 'confidential',
      oidcConfiguration: null,
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientType: 'confidential' },
      EDITABLE,
      'new-secret',
    );
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({ secret: 'new-secret' });
  });

  it('does not carry the secret for a non-OIDC provider', () => {
    const withBlock = documentWith({
      provider: 'ldap',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'stored-secret', discoveryUri: 'https://old.example/.well-known' },
    });
    const kept = buildCandidateConfiguration(
      withBlock,
      { provider: 'ldap', clientType: 'confidential' },
      EDITABLE,
      'new-secret',
    );
    expect(kept.authenticationConfiguration.oidcConfiguration).toEqual({
      secret: 'stored-secret',
      discoveryUri: 'https://old.example/.well-known',
    });
    const withoutBlock = documentWith({ provider: 'ldap', clientType: 'confidential' });
    const unbuilt = buildCandidateConfiguration(
      withoutBlock,
      { provider: 'ldap', clientType: 'confidential' },
      EDITABLE,
      'new-secret',
    );
    expect('oidcConfiguration' in unbuilt.authenticationConfiguration).toBe(false);
  });

  it('does not carry the secret for a public client', () => {
    const withBlock = documentWith({
      provider: 'google',
      clientType: 'public',
      oidcConfiguration: { secret: 'stored-secret' },
    });
    const kept = buildCandidateConfiguration(
      withBlock,
      { provider: 'google', clientType: 'public' },
      EDITABLE,
      'new-secret',
    );
    expect(kept.authenticationConfiguration.oidcConfiguration).toEqual({ secret: 'stored-secret' });
    const withoutBlock = documentWith({ provider: 'google', clientType: 'public' });
    const unbuilt = buildCandidateConfiguration(
      withoutBlock,
      { provider: 'google', clientType: 'public' },
      EDITABLE,
      'new-secret',
    );
    expect('oidcConfiguration' in unbuilt.authenticationConfiguration).toBe(false);
  });

  it('does not carry the secret when the client type is empty or missing', () => {
    const raw = documentWith({
      provider: 'google',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'stored-secret' },
    });
    const cleared = buildCandidateConfiguration(
      raw,
      { provider: 'google', clientType: '' },
      EDITABLE,
      'new-secret',
    );
    expect('clientType' in cleared.authenticationConfiguration).toBe(false);
    expect(cleared.authenticationConfiguration.oidcConfiguration).toEqual({ secret: 'stored-secret' });
    const missing = buildCandidateConfiguration(raw, { provider: 'google' }, EDITABLE, 'new-secret');
    expect('clientType' in missing.authenticationConfiguration).toBe(false);
    expect(missing.authenticationConfiguration.oidcConfiguration).toEqual({ secret: 'stored-secret' });
  });

  it('pins a managed secret back to the stored value', () => {
    const raw = documentWith({
      provider: 'okta',
      clientType: 'confidential',
      oidcConfiguration: { secret: 'stored-secret', discoveryUri: 'https://okta.example/.well-known' },
    });
    const candidate = buildCandidateConfiguration(
      raw,
      { provider: 'okta', clientType: 'confidential' },
      { authenticationEditable: true, authenticationManagedPaths: ['/oidcConfiguration/secret'] },
      'new-secret',
    );
    expect(candidate.authenticationConfiguration.oidcConfiguration).toEqual({
      secret: 'stored-secret',
      discoveryUri: 'https://okta.example/.well-known',
    });
  });
});
