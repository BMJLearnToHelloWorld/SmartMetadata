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
  applySsoSamlConfiguration,
  cleanupSsoProviderFields,
  comparableSsoFormData,
  createSsoFreshFormData,
  getSsoAuthorityUrl,
  getSsoCallbackUrl,
  getSsoDefaultsForProvider,
  getSsoServerUrl,
  handleSsoClientTypeChange,
  ssoAuthorityUrl,
  ssoCallbackUrl,
  ssoServerUrl,
} from './ssoDefaults';
import { getSsoProviderSchema } from './ssoSchemas';
import type { SsoFormData, SsoSectionData } from './ssoSchemas';

function doc(auth: SsoSectionData, authorizer: SsoSectionData = {}): SsoFormData {
  return {
    authenticationConfiguration: auth,
    authorizerConfiguration: authorizer,
  };
}

describe('URL defaults', () => {
  it('uses localhost:8585 in dev and the origin otherwise', () => {
    expect(ssoCallbackUrl(true, 'https://app.example.com')).toBe(
      'http://localhost:8585/callback',
    );
    expect(ssoServerUrl(true, 'https://app.example.com')).toBe('http://localhost:8585');
    expect(ssoAuthorityUrl(true, 'https://app.example.com')).toBe(
      'http://localhost:8585/api/v1/auth/login',
    );
    expect(ssoCallbackUrl(false, 'https://app.example.com')).toBe(
      'https://app.example.com/callback',
    );
    expect(ssoServerUrl(false, 'https://app.example.com')).toBe(
      'https://app.example.com',
    );
    expect(ssoAuthorityUrl(false, 'https://app.example.com')).toBe(
      'https://app.example.com/api/v1/auth/login',
    );
  });

  it('resolves the getters from the runtime origin in tests', () => {
    const origin = globalThis.location.origin;
    expect(getSsoCallbackUrl()).toBe(`${origin}/callback`);
    expect(getSsoServerUrl()).toBe(origin);
    expect(getSsoAuthorityUrl()).toBe(`${origin}/api/v1/auth/login`);
  });
});

describe('getSsoDefaultsForProvider', () => {
  it('builds the confidential OIDC block for google with google overrides', () => {
    const fresh = getSsoDefaultsForProvider('google', 'confidential');
    const auth = fresh.authenticationConfiguration;
    expect(auth.provider).toBe('google');
    expect(auth.providerName).toBe('google');
    expect(auth.enableSelfSignup).toBe(true);
    expect(auth.clientType).toBe('confidential');
    expect(auth.authority).toBe('https://accounts.google.com');
    expect(auth.publicKeyUrls).toEqual(['https://www.googleapis.com/oauth2/v3/certs']);
    expect(auth.tokenValidationAlgorithm).toBe('RS256');
    expect(auth.jwtPrincipalClaims).toEqual(['email', 'preferred_username', 'sub']);
    const oidc = auth.oidcConfiguration as SsoSectionData;
    expect(oidc.type).toBe('google');
    expect(oidc.id).toBe('');
    expect(oidc.secret).toBe('');
    expect(oidc.scope).toBe('openid email profile');
    expect(oidc.discoveryUri).toBe(
      'https://accounts.google.com/.well-known/openid-configuration',
    );
    expect(oidc.useNonce).toBe(false);
    expect(oidc.disablePkce).toBe(false);
    expect(oidc.maxClockSkew).toBe(0);
    expect(oidc.tokenValidity).toBe(3600);
    expect(oidc.sessionExpiry).toBe(604800);
    expect(oidc.customParams).toEqual({});
    expect(oidc.callbackUrl).toBe(getSsoCallbackUrl());
    expect(oidc.serverUrl).toBe(getSsoServerUrl());
    expect(fresh.authorizerConfiguration.className).toBe(
      'org.openmetadata.service.security.DefaultAuthorizer',
    );
  });

  it('uses root fields for public clients', () => {
    const fresh = getSsoDefaultsForProvider('okta', 'public');
    const auth = fresh.authenticationConfiguration;
    expect(auth).not.toHaveProperty('oidcConfiguration');
    expect(auth.callbackUrl).toBe(getSsoCallbackUrl());
    expect(auth.authority).toBe('');
    expect(auth.publicKeyUrls).toEqual([]);
  });

  it('builds the full SAML block with the 1.1 nameId URN', () => {
    const fresh = getSsoDefaultsForProvider('saml', 'public');
    const auth = fresh.authenticationConfiguration;
    expect(auth.clientType).toBe('public');
    expect(auth.authority).toBe(getSsoAuthorityUrl());
    const saml = auth.samlConfiguration as SsoSectionData;
    const idp = saml.idp as SsoSectionData;
    expect(idp.nameId).toBe('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress');
    expect(idp.authorityUrl).toBe('');
    const sp = saml.sp as SsoSectionData;
    expect(sp.entityId).toBe(getSsoServerUrl());
    expect(sp.acs).toBe(getSsoCallbackUrl());
    expect(sp.callback).toBe(getSsoCallbackUrl());
    const security = saml.security as SsoSectionData;
    expect(security.tokenValidity).toBe(3600);
    expect(security.strictMode).toBe(false);
    expect(saml.debugMode).toBe(false);
    expect(auth).not.toHaveProperty('oidcConfiguration');
  });

  it('builds no ldapConfiguration block for ldap', () => {
    const fresh = createSsoFreshFormData('ldap');
    expect(fresh.authenticationConfiguration.clientType).toBe('public');
    expect(fresh.authenticationConfiguration).not.toHaveProperty('ldapConfiguration');
    expect(fresh.authenticationConfiguration.callbackUrl).toBe(getSsoCallbackUrl());
  });

  it('uses the azure claim order', () => {
    const fresh = createSsoFreshFormData('azure');
    expect(fresh.authenticationConfiguration.jwtPrincipalClaims).toEqual([
      'preferred_username',
      'email',
      'upn',
      'sub',
    ]);
  });
});

describe('cleanupSsoProviderFields', () => {
  it('returns undefined for undefined input', () => {
    expect(cleanupSsoProviderFields(undefined, 'google')).toBeUndefined();
  });

  it('forces saml and ldap to public and drops the mapped blocks', () => {
    const input = doc({
      provider: 'saml',
      clientType: 'confidential',
      tokenValidationAlgorithm: 'RS256',
      ldapConfiguration: { host: 'x' },
      oidcConfiguration: { id: 'x' },
      samlConfiguration: { debugMode: true },
    });
    const cleaned = cleanupSsoProviderFields(input, 'saml')!;
    const auth = cleaned.authenticationConfiguration;
    expect(auth.clientType).toBe('public');
    expect(auth).not.toHaveProperty('tokenValidationAlgorithm');
    expect(auth).not.toHaveProperty('ldapConfiguration');
    expect(auth).not.toHaveProperty('oidcConfiguration');
    expect(auth.samlConfiguration).toBeDefined();
  });

  it('keeps tokenValidationAlgorithm for ldap (mapping lacks it)', () => {
    const input = doc({
      provider: 'ldap',
      clientType: 'confidential',
      tokenValidationAlgorithm: 'RS256',
      samlConfiguration: {},
      oidcConfiguration: {},
      ldapConfiguration: {},
    });
    const cleaned = cleanupSsoProviderFields(input, 'ldap')!;
    expect(cleaned.authenticationConfiguration.tokenValidationAlgorithm).toBe('RS256');
    expect(cleaned.authenticationConfiguration).not.toHaveProperty('samlConfiguration');
    expect(cleaned.authenticationConfiguration).not.toHaveProperty('oidcConfiguration');
  });

  it('deletes the root secret key on the public path only', () => {
    const pub = cleanupSsoProviderFields(
      doc({ provider: 'google', clientType: 'public', secret: 'x' }),
      'google',
    )!;
    expect(pub.authenticationConfiguration).not.toHaveProperty('secret');
    const conf = cleanupSsoProviderFields(
      doc({
        provider: 'google',
        clientType: 'confidential',
        secret: 'x',
        oidcConfiguration: {},
      }),
      'google',
    )!;
    expect(conf.authenticationConfiguration.secret).toBe('x');
  });

  it('copies oidc id/callbackUrl to root and strips /callback from serverUrl', () => {
    const input = doc({
      provider: 'okta',
      clientType: 'confidential',
      clientId: 'old',
      callbackUrl: 'old',
      oidcConfiguration: {
        id: 'new-id',
        callbackUrl: 'https://app/callback',
        serverUrl: 'https://idp.example.com/callback/',
      },
    });
    const cleaned = cleanupSsoProviderFields(input, 'okta')!;
    const auth = cleaned.authenticationConfiguration;
    expect(auth.clientId).toBe('new-id');
    expect(auth.callbackUrl).toBe('https://app/callback');
    expect((auth.oidcConfiguration as SsoSectionData).serverUrl).toBe(
      'https://idp.example.com',
    );
  });

  it('deletes botPrincipals for the nine table providers but keeps it for openmetadata', () => {
    const kept = cleanupSsoProviderFields(
      doc({ provider: 'openmetadata' }, { botPrincipals: ['b'] }),
      'openmetadata',
    )!;
    expect(kept.authorizerConfiguration.botPrincipals).toEqual(['b']);
    const dropped = cleanupSsoProviderFields(
      doc({ provider: 'custom-oidc' }, { botPrincipals: ['b'] }),
      'custom-oidc',
    )!;
    expect(dropped.authorizerConfiguration).not.toHaveProperty('botPrincipals');
  });

  it('forces authorizer defaults and fills the two flags', () => {
    const cleaned = cleanupSsoProviderFields(
      doc({ provider: 'google' }, { className: 'Custom', containerRequestFilter: 'X' }),
      'google',
    )!;
    const authorizer = cleaned.authorizerConfiguration;
    expect(authorizer.className).toBe(
      'org.openmetadata.service.security.DefaultAuthorizer',
    );
    expect(authorizer.containerRequestFilter).toBe(
      'org.openmetadata.service.security.JwtFilter',
    );
    expect(authorizer.enforcePrincipalDomain).toBe(false);
    expect(authorizer.enableSecureSocketConnection).toBe(false);
  });

  it('extracts the trustStoreConfig keyed on truststoreFormat, clearing on mismatch', () => {
    const matched = cleanupSsoProviderFields(
      doc({
        provider: 'ldap',
        ldapConfiguration: {
          truststoreFormat: 'HostName',
          trustStoreConfig: { hostNameConfig: { a: 1 }, trustAllConfig: { b: 2 } },
        },
      }),
      'ldap',
    )!;
    expect(
      (matched.authenticationConfiguration.ldapConfiguration as SsoSectionData)
        .trustStoreConfig,
    ).toEqual({ hostNameConfig: { a: 1 } });

    const mismatched = cleanupSsoProviderFields(
      doc({
        provider: 'ldap',
        ldapConfiguration: {
          truststoreFormat: 'JKS',
          truststoreConfigType: 'HostName',
          trustStoreConfig: { hostNameConfig: { a: 1 } },
        },
      }),
      'ldap',
    )!;
    expect(
      (mismatched.authenticationConfiguration.ldapConfiguration as SsoSectionData)
        .trustStoreConfig,
    ).toEqual({});
  });

  it('leaves trustStoreConfig untouched when truststoreFormat is empty', () => {
    const input = doc({
      provider: 'ldap',
      ldapConfiguration: {
        truststoreFormat: '',
        trustStoreConfig: { hostNameConfig: { a: 1 } },
      },
    });
    const cleaned = cleanupSsoProviderFields(input, 'ldap')!;
    expect(
      (cleaned.authenticationConfiguration.ldapConfiguration as SsoSectionData)
        .trustStoreConfig,
    ).toEqual({ hostNameConfig: { a: 1 } });
  });

  it('applies the SAML cleanup: authority/callback lift and newline conversion', () => {
    const input = doc({
      provider: 'saml',
      authority: 'root-old',
      callbackUrl: 'root-cb-old',
      samlConfiguration: {
        idp: { authorityUrl: 'https://idp', idpX509Certificate: 'AB\\nCD' },
        sp: {
          callback: 'https://app/callback',
          acs: 'old-acs',
          spX509Certificate: 'X\\nY',
          spPrivateKey: 'K\\nL',
        },
        security: {},
      },
    });
    const cleaned = cleanupSsoProviderFields(input, 'saml')!;
    const auth = cleaned.authenticationConfiguration;
    expect(auth.authority).toBe('https://idp');
    expect(auth.callbackUrl).toBe('https://app/callback');
    const saml = auth.samlConfiguration as SsoSectionData;
    expect((saml.idp as SsoSectionData).idpX509Certificate).toBe('AB\nCD');
    const sp = saml.sp as SsoSectionData;
    expect(sp.acs).toBe('https://app/callback');
    expect(sp.spX509Certificate).toBe('X\nY');
    expect(sp.spPrivateKey).toBe('K\nL');
    const security = saml.security as SsoSectionData;
    expect(security.strictMode).toBe(false);
    expect(security.wantAssertionsSigned).toBe(false);
    expect(security.wantMessagesSigned).toBe(false);
    expect(security.sendSignedAuthRequest).toBe(false);
    expect(saml.debugMode).toBe(false);
  });

  it('mutates nested objects in place (shallow-copy semantics)', () => {
    const auth = { provider: 'google', clientType: 'confidential', oidcConfiguration: {} };
    const input = doc(auth, {});
    cleanupSsoProviderFields(input, 'google');
    expect(auth.oidcConfiguration).toBeDefined();
    expect(input.authenticationConfiguration).toBe(auth);
  });
});

describe('comparableSsoFormData', () => {
  it('normalizes then cleans, reading the provider from the raw input', () => {
    const schema = getSsoProviderSchema('google');
    const comparable = comparableSsoFormData(
      schema,
      doc({ provider: 'google', clientType: 'confidential' }),
    )!;
    const auth = comparable.authenticationConfiguration;
    expect(auth.responseType).toBe('id_token');
    expect(auth).not.toHaveProperty('ldapConfiguration');
    expect(auth).not.toHaveProperty('samlConfiguration');
    expect(auth.oidcConfiguration).toBeDefined();
  });

  it('returns undefined for undefined input', () => {
    expect(comparableSsoFormData(getSsoProviderSchema('google'), undefined)).toBeUndefined();
  });
});

describe('applySsoSamlConfiguration', () => {
  it('fills idp authority from root authority, else the empty default', () => {
    const filled = doc({
      authority: 'https://root',
      samlConfiguration: { idp: { authorityUrl: '' } },
    });
    applySsoSamlConfiguration(filled);
    expect(
      ((filled.authenticationConfiguration.samlConfiguration as SsoSectionData)
        .idp as SsoSectionData).authorityUrl,
    ).toBe('https://root');

    const defaulted = doc({ samlConfiguration: { idp: {} } });
    applySsoSamlConfiguration(defaulted);
    expect(
      ((defaulted.authenticationConfiguration.samlConfiguration as SsoSectionData)
        .idp as SsoSectionData).authorityUrl,
    ).toBe('');
  });

  it('fills sp callback/acs only when empty and root callbackUrl is set', () => {
    const filled = doc({
      callbackUrl: 'https://app/callback',
      samlConfiguration: { sp: { callback: '', acs: '/api/v1/saml/acs' } },
    });
    applySsoSamlConfiguration(filled);
    const sp = (filled.authenticationConfiguration.samlConfiguration as SsoSectionData)
      .sp as SsoSectionData;
    expect(sp.callback).toBe('https://app/callback');
    expect(sp.acs).toBe('/api/v1/saml/acs');
  });

  it('is a no-op without a samlConfiguration block', () => {
    const input = doc({ authority: 'x', callbackUrl: 'y' });
    applySsoSamlConfiguration(input);
    expect(input.authenticationConfiguration).toEqual({
      authority: 'x',
      callbackUrl: 'y',
    });
  });
});

describe('handleSsoClientTypeChange', () => {
  it('is a no-op without a transition', () => {
    const auth: SsoSectionData = { provider: 'google', clientType: 'public' };
    handleSsoClientTypeChange(auth, 'public', 'public');
    handleSsoClientTypeChange(auth, undefined, 'public');
    handleSsoClientTypeChange(auth, 'public', undefined);
    handleSsoClientTypeChange(undefined, 'public', 'confidential');
    expect(auth).toEqual({ provider: 'google', clientType: 'public' });
  });

  it('moves callbackUrl root-ward on confidential to public', () => {
    const auth: SsoSectionData = {
      provider: 'okta',
      oidcConfiguration: { callbackUrl: 'https://oidc/callback' },
    };
    handleSsoClientTypeChange(auth, 'confidential', 'public');
    expect(auth.callbackUrl).toBe('https://oidc/callback');
  });

  it('fills google authority and keys on confidential to public', () => {
    const auth: SsoSectionData = {
      provider: 'google',
      authority: 'old',
      oidcConfiguration: {},
    };
    handleSsoClientTypeChange(auth, 'confidential', 'public');
    expect(auth.authority).toBe('https://accounts.google.com');
    expect(auth.publicKeyUrls).toEqual([
      'https://www.googleapis.com/oauth2/v3/certs',
    ]);
    expect(auth.callbackUrl).toBe(getSsoCallbackUrl());
  });

  it('creates the oidc block and fills google fields on public to confidential', () => {
    const auth: SsoSectionData = {
      provider: 'google',
      callbackUrl: 'https://root/callback',
    };
    handleSsoClientTypeChange(auth, 'public', 'confidential');
    const oidc = auth.oidcConfiguration as SsoSectionData;
    expect(oidc.callbackUrl).toBe('https://root/callback');
    expect(oidc.type).toBe('google');
    expect(oidc.discoveryUri).toBe(
      'https://accounts.google.com/.well-known/openid-configuration',
    );
    expect(oidc.scope).toBe('openid email profile');
    expect(oidc.useNonce).toBe(false);
    expect(oidc.maxClockSkew).toBe(0);
    expect(oidc.clientAuthenticationMethod).toBe('client_secret_post');
  });
});
