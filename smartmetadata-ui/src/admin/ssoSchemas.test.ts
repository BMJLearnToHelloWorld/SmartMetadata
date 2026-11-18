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
  getSsoProviderSchema,
  normalizeSsoFormData,
  SSO_AUTH_SCHEMA,
  SSO_AUTHORIZER_SCHEMA,
  type SsoJsonSchema,
} from './ssoSchemas';

function authOf(schema: SsoJsonSchema): SsoJsonSchema {
  return schema.properties!.authenticationConfiguration;
}

describe('getSsoProviderSchema', () => {
  it('returns the original schemas untouched when no provider is given', () => {
    const schema = getSsoProviderSchema(undefined);
    expect(authOf(schema)).toBe(SSO_AUTH_SCHEMA);
    expect(schema.properties!.authorizerConfiguration).toBe(SSO_AUTHORIZER_SCHEMA);
  });

  it('removes providerName from required for existing configs only', () => {
    expect(authOf(getSsoProviderSchema('google', false)).required).toEqual([
      'provider',
      'providerName',
    ]);
    expect(authOf(getSsoProviderSchema('google', true)).required).toEqual(['provider']);
  });

  it('removes the four OIDC root fields for saml and ldap', () => {
    for (const provider of ['saml', 'ldap']) {
      const props = Object.keys(authOf(getSsoProviderSchema(provider)).properties!);
      expect(props).not.toContain('callbackUrl');
      expect(props).not.toContain('clientId');
      expect(props).not.toContain('authority');
      expect(props).not.toContain('publicKeyUrls');
      expect(props).toContain('ldapConfiguration');
      expect(props).toContain('samlConfiguration');
    }
  });

  it('removes the non-OIDC fields for custom-oidc', () => {
    const props = Object.keys(authOf(getSsoProviderSchema('custom-oidc')).properties!);
    expect(props).not.toContain('ldapConfiguration');
    expect(props).not.toContain('samlConfiguration');
    expect(props).not.toContain('clientType');
    expect(props).toContain('authority');
  });

  it('leaves the original schema unmutated (deep clone before surgery)', () => {
    getSsoProviderSchema('saml', true);
    getSsoProviderSchema('custom-oidc', true);
    expect(Object.keys(SSO_AUTH_SCHEMA.properties!)).toHaveLength(23);
    expect(SSO_AUTH_SCHEMA.required).toEqual(['provider', 'providerName']);
  });

  it('keeps the authorizer schema as-is for every provider', () => {
    for (const provider of ['google', 'saml', 'ldap', 'custom-oidc', 'openmetadata']) {
      expect(getSsoProviderSchema(provider).properties!.authorizerConfiguration).toBe(
        SSO_AUTHORIZER_SCHEMA,
      );
    }
  });
});

describe('normalizeSsoFormData', () => {
  const schema = getSsoProviderSchema('google');

  it('fills root and nested defaults for a missing key', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, unknown>>;
    const auth = normalized.authenticationConfiguration;
    expect(auth.clientType).toBe('public');
    expect(auth.responseType).toBe('id_token');
    expect(auth.tokenValidationAlgorithm).toBe('RS256');
    expect(auth.enableSelfSignup).toBe(false);
    expect(auth.forceSecureSessionCookie).toBe(false);
    expect(auth.maxActiveSessionsPerUser).toBe(5);
    expect(auth.enableAutoRedirect).toBe(false);
    expect(auth.publicKeyUrls).toEqual([]);
    expect(auth.jwtPrincipalClaims).toEqual([]);
    expect(auth.jwtPrincipalClaimsMapping).toEqual([]);
    expect(auth.additionalTrustedRedirectUris).toEqual([]);
    const authorizer = normalized.authorizerConfiguration;
    expect(authorizer.adminEmails).toEqual([]);
    expect(authorizer.allowedEmailDomains).toEqual([]);
    expect(authorizer.botPrincipals).toEqual([]);
    expect(authorizer.useRolesFromProvider).toBe(false);
  });

  it('fills OIDC leaf defaults verbatim, including the boolean useNonce', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: { provider: 'google', oidcConfiguration: {} },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, Record<string, unknown>>>;
    const oidc = normalized.authenticationConfiguration.oidcConfiguration;
    expect(oidc.scope).toBe('openid email profile');
    expect(oidc.useNonce).toBe(true);
    expect(oidc.preferredJwsAlgorithm).toBe('RS256');
    expect(oidc.responseType).toBe('code');
    expect(oidc.disablePkce).toBe(true);
    expect(oidc.tokenValidity).toBe(3600);
    expect(oidc.sessionExpiry).toBe(604800);
    expect(oidc.endSessionWithProvider).toBe(false);
    expect(oidc).not.toHaveProperty('customParams');
  });

  it('creates missing objects with non-empty defaults and required empty ones', () => {
    const normalized = normalizeSsoFormData(getSsoProviderSchema('saml'), {
      authenticationConfiguration: { provider: 'saml' },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, Record<string, unknown>>>;
    const auth = normalized.authenticationConfiguration;
    const saml = auth.samlConfiguration as Record<string, unknown>;
    expect(saml).toBeDefined();
    expect((saml.idp as Record<string, unknown>).nameId).toBe(
      'urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress',
    );
    expect(saml.sp).toEqual({});
    expect((saml.security as Record<string, unknown>).tokenValidity).toBe(3600);
    expect(saml.debugMode).toBe(false);
    expect(saml.samlDisplayNameAttributes).toEqual([]);
    const ldap = auth.ldapConfiguration as Record<string, unknown>;
    expect(ldap.maxPoolSize).toBe(3);
    expect(ldap.isFullDn).toBe(false);
    expect(
      (ldap.trustStoreConfig as Record<string, Record<string, unknown>>)
        .hostNameConfig.allowWildCards,
    ).toBe(false);
  });

  it('does not create missing leaves, even required ones', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: {},
      authorizerConfiguration: {},
    }) as Record<string, Record<string, unknown>>;
    expect(normalized.authenticationConfiguration).not.toHaveProperty('providerName');
    expect(normalized.authenticationConfiguration).not.toHaveProperty('authority');
  });

  it('keeps present values and passes extra keys through at every level', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: {
        provider: 'google',
        extraRoot: 'kept',
        oidcConfiguration: { id: 'mine', extraNested: 7 },
      },
      authorizerConfiguration: { extraSection: true },
      extraTop: 'top',
    }) as Record<string, unknown>;
    const auth = normalized.authenticationConfiguration as Record<string, unknown>;
    expect(auth.extraRoot).toBe('kept');
    expect(
      (auth.oidcConfiguration as Record<string, unknown>).extraNested,
    ).toBe(7);
    expect((auth.oidcConfiguration as Record<string, unknown>).id).toBe('mine');
    expect(normalized.extraTop).toBe('top');
  });

  it('lets explicit null pass through untouched', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: {
        provider: 'google',
        ldapConfiguration: null,
        publicKeyUrls: null,
      },
      authorizerConfiguration: { botPrincipals: null },
    }) as Record<string, Record<string, unknown>>;
    expect(normalized.authenticationConfiguration.ldapConfiguration).toBeNull();
    expect(normalized.authenticationConfiguration.publicKeyUrls).toBeNull();
    expect(normalized.authorizerConfiguration.botPrincipals).toBeNull();
  });

  it('replaces an enum-invalid scalar with the schema default, or keeps it', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: {
        provider: 'google',
        clientType: 'bogus',
        tokenValidationAlgorithm: 'bogus',
        oidcConfiguration: { clientAuthenticationMethod: 'bogus' },
      },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, Record<string, unknown>>>;
    const auth = normalized.authenticationConfiguration;
    expect(auth.clientType).toBe('public');
    expect(auth.tokenValidationAlgorithm).toBe('RS256');
    expect(auth.oidcConfiguration.clientAuthenticationMethod).toBe('bogus');
  });

  it('ignores allOf conditional required when filling', () => {
    const normalized = normalizeSsoFormData(schema, {
      authenticationConfiguration: { provider: 'ldap' },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, unknown>>;
    // ldapConfiguration is created for its non-empty defaults, not because
    // allOf branch 0 requires it; a default-less branch would stay absent.
    expect(normalized.authenticationConfiguration.ldapConfiguration).toBeDefined();
  });

  it('does not fill defaults for schema-removed properties', () => {
    const normalized = normalizeSsoFormData(getSsoProviderSchema('saml'), {
      authenticationConfiguration: { provider: 'saml', authority: 'kept-as-extra' },
      authorizerConfiguration: {},
    }) as Record<string, Record<string, unknown>>;
    // Removed at schema level: the value survives only as an extra key, and
    // no default is filled for the removed array property.
    expect(normalized.authenticationConfiguration.authority).toBe('kept-as-extra');
    expect(normalized.authenticationConfiguration).not.toHaveProperty('publicKeyUrls');
    // clientType is only hidden for SAML, not removed: its default still fills.
    expect(normalized.authenticationConfiguration.clientType).toBe('public');
  });

  it('returns the full default tree for undefined input', () => {
    const normalized = normalizeSsoFormData(schema, undefined) as Record<
      string,
      Record<string, unknown>
    >;
    expect(normalized.authenticationConfiguration.provider).toBe('basic');
    expect(normalized.authorizerConfiguration).toBeDefined();
  });

  it('does not mutate its input', () => {
    const input = {
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    };
    normalizeSsoFormData(schema, input);
    expect(input).toEqual({
      authenticationConfiguration: { provider: 'google' },
      authorizerConfiguration: {},
    });
  });
});
