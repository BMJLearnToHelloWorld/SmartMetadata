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
import { SSO_FIELD_TEXT_ZH } from './ssoFieldText';
import {
  getSsoProviderSchema,
  type SsoJsonSchema,
} from './ssoSchemas';
import {
  buildSsoFieldGroups,
  getSsoUiEntry,
  isSsoDeprecatedProperty,
  isSsoUiHidden,
  resolveSsoFieldLabel,
  resolveSsoObjectTitle,
  resolveSsoUiSchema,
  resolveSsoWidgetKind,
  splitSsoAdvancedProperties,
  SSO_AUTHORIZER_FIELD_TITLES,
  SSO_COMMON_FIELD_TITLES,
  SSO_PROVIDER_UI_SCHEMAS,
  type SsoUiSchemaEntry,
  type SsoUiSchemaResolution,
} from './ssoUiSchema';

function resolve(
  provider: string,
  clientType: string | undefined,
  hasExistingConfig = false,
  hasSavedData = false,
): SsoUiSchemaResolution {
  return resolveSsoUiSchema({
    provider,
    hasExistingConfig,
    hasSavedData,
    clientType,
  }) as SsoUiSchemaResolution;
}

/** Rendered visibility = present in the surgered schema AND not UI-hidden. */
function renderedNames(
  provider: string,
  clientType: string | undefined,
  section: 'authenticationConfiguration' | 'authorizerConfiguration',
  hasExistingConfig = false,
  hasSavedData = false,
): string[] {
  const schema = getSsoProviderSchema(provider);
  const sectionSchema = schema.properties![section]!;
  const ui = resolve(provider, clientType, hasExistingConfig, hasSavedData);
  return Object.keys(sectionSchema.properties ?? {}).filter(
    (name) => !isSsoUiHidden(getSsoUiEntry(ui, [section, name])),
  );
}

function renderedOidcLeaves(
  provider: string,
  clientType: string | undefined,
): string[] {
  const schema = getSsoProviderSchema(provider);
  const oidc = schema.properties!.authenticationConfiguration.properties!
    .oidcConfiguration!;
  const ui = resolve(provider, clientType);
  return Object.keys(oidc.properties ?? {}).filter(
    (name) =>
      !isSsoUiHidden(
        getSsoUiEntry(ui, [
          'authenticationConfiguration',
          'oidcConfiguration',
          name,
        ]),
      ),
  );
}

describe('resolveSsoUiSchema', () => {
  it('returns an empty schema for an empty provider', () => {
    expect(
      resolveSsoUiSchema({
        provider: '',
        hasExistingConfig: false,
        hasSavedData: false,
        clientType: undefined,
      }),
    ).toEqual({});
  });

  it('always hides the provider field', () => {
    const ui = resolve('google', 'confidential');
    expect(
      getSsoUiEntry(ui, ['authenticationConfiguration', 'provider']),
    ).toEqual({ 'ui:widget': 'hidden', 'ui:hideError': true });
  });

  it('hides clientType for existing configs with saved data, saml and ldap', () => {
    expect(
      isSsoUiHidden(
        getSsoUiEntry(resolve('google', 'confidential', true, true), [
          'authenticationConfiguration',
          'clientType',
        ]),
      ),
    ).toBe(true);
    expect(
      isSsoUiHidden(
        getSsoUiEntry(resolve('saml', 'public'), [
          'authenticationConfiguration',
          'clientType',
        ]),
      ),
    ).toBe(true);
    expect(
      isSsoUiHidden(
        getSsoUiEntry(resolve('ldap', 'public'), [
          'authenticationConfiguration',
          'clientType',
        ]),
      ),
    ).toBe(true);
    // Existing without saved data keeps clientType visible (pin condition).
    expect(
      isSsoUiHidden(
        getSsoUiEntry(resolve('google', 'confidential', true, false), [
          'authenticationConfiguration',
          'clientType',
        ]),
      ),
    ).toBe(false);
  });

  it('hides enableSelfSignup for existing configs only', () => {
    expect(
      isSsoUiHidden(
        getSsoUiEntry(resolve('google', 'confidential', true, true), [
          'authenticationConfiguration',
          'enableSelfSignup',
        ]),
      ),
    ).toBe(true);
    expect(
      getSsoUiEntry(resolve('google', 'confidential'), [
        'authenticationConfiguration',
        'enableSelfSignup',
      ]),
    ).toEqual({ 'ui:title': 'Enable Self Signup' });
  });

  it('keeps confidential root authority visible for all OIDC providers (C4)', () => {
    for (const provider of [
      'google',
      'azure',
      'okta',
      'auth0',
      'aws-cognito',
      'custom-oidc',
    ]) {
      const entry = getSsoUiEntry(resolve(provider, 'confidential'), [
        'authenticationConfiguration',
        'authority',
      ]);
      expect(isSsoUiHidden(entry), provider).toBe(false);
      expect(entry?.['ui:title']).toBe('Authority');
    }
    expect(
      getSsoUiEntry(resolve('google', 'confidential'), [
        'authenticationConfiguration',
        'authority',
      ])?.['ui:placeholder'],
    ).toBe('https://accounts.google.com');
    expect(
      getSsoUiEntry(resolve('okta', 'confidential'), [
        'authenticationConfiguration',
        'authority',
      ])?.['ui:placeholder'],
    ).toBe('e.g. https://accounts.google.com');
  });

  it('hides root clientId/callbackUrl for confidential clients', () => {
    const ui = resolve('okta', 'confidential');
    expect(
      isSsoUiHidden(
        getSsoUiEntry(ui, ['authenticationConfiguration', 'clientId']),
      ),
    ).toBe(true);
    expect(
      isSsoUiHidden(
        getSsoUiEntry(ui, ['authenticationConfiguration', 'callbackUrl']),
      ),
    ).toBe(true);
  });

  it('forces root fields visible for public clients', () => {
    const ui = resolve('okta', 'public');
    expect(
      isSsoUiHidden(
        getSsoUiEntry(ui, ['authenticationConfiguration', 'oidcConfiguration']),
      ),
    ).toBe(true);
    expect(
      getSsoUiEntry(ui, ['authenticationConfiguration', 'callbackUrl']),
    ).toEqual({
      'ui:title': 'Callback URL',
      'ui:placeholder': 'e.g. https://myapp.com/callback',
    });
    expect(
      getSsoUiEntry(ui, ['authenticationConfiguration', 'publicKeyUrls']),
    ).toEqual({
      'ui:title': 'Public Key URLs',
      'ui:placeholder':
        'Enter value (e.g. https://www.googleapis.com/oauth2/v3/certs) and press ENTER',
    });
    expect(
      getSsoUiEntry(ui, ['authenticationConfiguration', 'authority']),
    ).toEqual({
      'ui:title': 'Authority',
      'ui:placeholder': 'e.g. https://accounts.google.com',
    });
  });

  it('applies the ??= OIDC title rule only when no entry exists', () => {
    // custom-oidc resolves to {} so the title-only entry is created.
    expect(
      getSsoUiEntry(resolve('custom-oidc', 'confidential'), [
        'authenticationConfiguration',
        'oidcConfiguration',
      ]),
    ).toEqual({ 'ui:title': 'OIDC Configuration' });
    // Standard providers keep their full nested entry.
    const google = getSsoUiEntry(resolve('google', 'confidential'), [
      'authenticationConfiguration',
      'oidcConfiguration',
    ]);
    expect(google?.['ui:title']).toBe('OIDC Configuration');
    expect(google?.children?.id?.['ui:title']).toBe('OIDC Client ID');
  });

  it('runs neither client-type branch when clientType is undefined', () => {
    const ui = resolve('google', undefined);
    expect(
      isSsoUiHidden(
        getSsoUiEntry(ui, ['authenticationConfiguration', 'clientId']),
      ),
    ).toBe(false);
    expect(
      isSsoUiHidden(
        getSsoUiEntry(ui, ['authenticationConfiguration', 'oidcConfiguration']),
      ),
    ).toBe(false);
    // custom-oidc with undefined clientType has no OIDC UI entry at all.
    expect(
      getSsoUiEntry(resolve('custom-oidc', undefined), [
        'authenticationConfiguration',
        'oidcConfiguration',
      ]),
    ).toBeUndefined();
  });

  it('keeps the customoidc key mismatch verbatim', () => {
    expect(Object.keys(SSO_PROVIDER_UI_SCHEMAS)).toContain('customoidc');
    expect(Object.keys(SSO_PROVIDER_UI_SCHEMAS)).not.toContain('custom-oidc');
  });
});

describe('rendered visibility matrix (schema ∩ UI schema)', () => {
  it('confidential OIDC: root clientId/callbackUrl hidden, authority visible', () => {
    const names = renderedNames('okta', 'confidential', 'authenticationConfiguration');
    expect(names).not.toContain('clientId');
    expect(names).not.toContain('callbackUrl');
    expect(names).toContain('authority');
    expect(names).toContain('oidcConfiguration');
    expect(names).not.toContain('publicKeyUrls');
    expect(names).not.toContain('tokenValidationAlgorithm');
    expect(names).not.toContain('ldapConfiguration');
    expect(names).not.toContain('samlConfiguration');
    expect(names).toContain('clientType');
  });

  it('public OIDC: root fields visible, oidc object hidden', () => {
    const names = renderedNames('okta', 'public', 'authenticationConfiguration');
    expect(names).toContain('clientId');
    expect(names).toContain('callbackUrl');
    expect(names).toContain('authority');
    expect(names).toContain('publicKeyUrls');
    expect(names).not.toContain('oidcConfiguration');
    expect(names).not.toContain('tokenValidationAlgorithm');
  });

  it('saml: only the saml block and identity fields render', () => {
    const names = renderedNames('saml', 'public', 'authenticationConfiguration');
    expect(names).toContain('samlConfiguration');
    expect(names).not.toContain('clientId');
    expect(names).not.toContain('callbackUrl');
    expect(names).not.toContain('authority');
    expect(names).not.toContain('publicKeyUrls');
    expect(names).not.toContain('clientType');
    expect(names).not.toContain('jwtPrincipalClaims');
    expect(names).toContain('emailClaim');
    expect(names).toContain('displayNameClaim');
    expect(names).toContain('providerName');
  });

  it('ldap: only the ldap block and identity fields render', () => {
    const names = renderedNames('ldap', 'public', 'authenticationConfiguration');
    expect(names).toContain('ldapConfiguration');
    expect(names).not.toContain('clientId');
    expect(names).not.toContain('callbackUrl');
    expect(names).not.toContain('authority');
    expect(names).not.toContain('publicKeyUrls');
    expect(names).not.toContain('jwtPrincipalClaims');
    expect(names).toContain('emailClaim');
    expect(names).toContain('additionalTrustedRedirectUris');
    expect(names).toContain('sessionExpiry');
  });

  it('custom-oidc: schema-default rendering with the mismatched tables', () => {
    const names = renderedNames(
      'custom-oidc',
      'confidential',
      'authenticationConfiguration',
    );
    expect(names).toContain('tokenValidationAlgorithm');
    expect(names).not.toContain('clientType');
    expect(names).toContain('oidcConfiguration');
    expect(names).toContain('authority');
    // OIDC leaves all render with default rendering (no UI entries).
    expect(renderedOidcLeaves('custom-oidc', 'confidential')).toEqual([
      'type',
      'id',
      'secret',
      'scope',
      'discoveryUri',
      'useNonce',
      'preferredJwsAlgorithm',
      'responseType',
      'disablePkce',
      'maxClockSkew',
      'clientAuthenticationMethod',
      'tokenValidity',
      'customParams',
      'tenant',
      'serverUrl',
      'callbackUrl',
      'maxAge',
      'prompt',
      'sessionExpiry',
      'endSessionWithProvider',
    ]);
    // allowedEmailRegistrationDomains stays visible (customoidc mismatch);
    // botPrincipals is hidden (hyphenated key hits).
    const authorizer = renderedNames(
      'custom-oidc',
      'confidential',
      'authorizerConfiguration',
    );
    expect(authorizer).toContain('allowedEmailRegistrationDomains');
    expect(authorizer).not.toContain('botPrincipals');
  });

  it('openmetadata: all three blocks render, botPrincipals visible', () => {
    const names = renderedNames(
      'openmetadata',
      'confidential',
      'authenticationConfiguration',
    );
    expect(names).toContain('oidcConfiguration');
    expect(names).toContain('ldapConfiguration');
    expect(names).toContain('samlConfiguration');
    expect(names).toContain('tokenValidationAlgorithm');
    expect(names).toContain('clientType');
    const authorizer = renderedNames(
      'openmetadata',
      'confidential',
      'authorizerConfiguration',
    );
    expect(authorizer).toContain('botPrincipals');
    expect(authorizer).toContain('allowedEmailRegistrationDomains');
    expect(authorizer).toContain('useRolesFromProvider');
  });

  it('authorizer: className/filter/testPrincipals always hidden; ldap/saml hide useRolesFromProvider', () => {
    for (const provider of ['google', 'ldap', 'saml', 'openmetadata']) {
      const names = renderedNames(provider, 'public', 'authorizerConfiguration');
      expect(names).not.toContain('className');
      expect(names).not.toContain('containerRequestFilter');
      expect(names).not.toContain('testPrincipals');
    }
    expect(
      renderedNames('ldap', 'public', 'authorizerConfiguration'),
    ).not.toContain('useRolesFromProvider');
    expect(
      renderedNames('google', 'public', 'authorizerConfiguration'),
    ).toContain('useRolesFromProvider');
    expect(
      renderedNames('google', 'public', 'authorizerConfiguration'),
    ).not.toContain('allowedEmailRegistrationDomains');
  });

  it('OIDC leaf visibility differs per provider table', () => {
    const standard = renderedOidcLeaves('auth0', 'confidential');
    expect(standard).not.toContain('type');
    expect(standard).not.toContain('clientAuthenticationMethod');
    expect(standard).not.toContain('tenant');
    expect(standard).not.toContain('tokenValidity');
    expect(standard).not.toContain('serverUrl');
    expect(standard).toContain('id');
    expect(renderedOidcLeaves('azure', 'confidential')).toContain('tenant');
    expect(renderedOidcLeaves('okta', 'confidential')).toContain(
      'clientAuthenticationMethod',
    );
    expect(renderedOidcLeaves('google', 'confidential')).not.toContain('tenant');
  });

  it('SAML nested visibility: idp authorityUrl, sp callback and security extras hidden', () => {
    const ui = resolve('saml', 'public');
    const hidden = (path: string[]) => isSsoUiHidden(getSsoUiEntry(ui, path));
    const base = ['authenticationConfiguration', 'samlConfiguration'];
    expect(hidden([...base, 'idp', 'authorityUrl'])).toBe(true);
    expect(hidden([...base, 'sp', 'callback'])).toBe(true);
    expect(hidden([...base, 'security', 'validateXml'])).toBe(true);
    expect(hidden([...base, 'security', 'keyStorePassword'])).toBe(true);
    expect(hidden([...base, 'idp', 'entityId'])).toBe(false);
    expect(hidden([...base, 'sp', 'spPrivateKey'])).toBe(false);
    expect(hidden([...base, 'security', 'tokenValidity'])).toBe(false);
  });

  it('LDAP nested visibility: usernameAttributeName hidden, truststoreFormat untitled', () => {
    const ui = resolve('ldap', 'public');
    const base = ['authenticationConfiguration', 'ldapConfiguration'];
    expect(isSsoUiHidden(getSsoUiEntry(ui, [...base, 'usernameAttributeName']))).toBe(
      true,
    );
    expect(getSsoUiEntry(ui, [...base, 'truststoreFormat'])).toBeUndefined();
    expect(
      getSsoUiEntry(ui, [...base, 'authRolesMapping'])?.['ui:widget'],
    ).toBe('LdapRoleMappingWidget');
    expect(
      getSsoUiEntry(ui, [...base, 'authReassignRoles'])?.['ui:field'],
    ).toBe('RolesSelectField');
  });
});

describe('grouping', () => {
  it('builds auth-root groups in template order with schema order inside', () => {
    const names = renderedNames('okta', 'confidential', 'authenticationConfiguration');
    const groups = buildSsoFieldGroups('root/authenticationConfiguration', names);
    expect(groups.map((g) => g.title)).toEqual([
      'Basic Configuration',
      'Client Configuration',
      'Authority Settings',
      undefined,
      'Identity Configuration',
      'Advanced Configuration',
    ]);
    // Provider object groups are untitled and sit between Security and Identity.
    expect(groups.map((g) => g.properties)).toContainEqual(['oidcConfiguration']);
    // Security group is empty (both fields hidden) and filtered out.
    expect(groups.map((g) => g.title)).not.toContain('Security Configuration');
    // Credentials group never appears (neither field is a schema property).
    expect(groups.map((g) => g.title)).not.toContain('Credentials');
    const advanced = groups.find((g) => g.title === 'Advanced Configuration')!;
    expect(advanced.properties).toEqual([
      'additionalTrustedRedirectUris',
      'sessionExpiry',
      'maxActiveSessionsPerUser',
      'enableAutoRedirect',
    ]);
  });

  it('builds authorizer groups with an untitled trailing group', () => {
    const names = renderedNames('google', 'public', 'authorizerConfiguration');
    const groups = buildSsoFieldGroups('root/authorizerConfiguration', names);
    expect(groups.map((g) => g.title)).toEqual([
      'Admin Management',
      'Domain Configuration',
      'Connection Settings',
      'Legacy Configuration (Deprecated)',
      undefined,
    ]);
    expect(groups.at(-1)!.properties).toEqual(['defaultOAuthRole']);
  });

  it('builds single groups for OIDC, LDAP and SAML objects', () => {
    expect(
      buildSsoFieldGroups('root/authenticationConfiguration/oidcConfiguration', [
        'id',
        'secret',
      ]),
    ).toEqual([
      { title: 'OIDC Configuration', properties: ['id', 'secret'] },
    ]);
    expect(
      buildSsoFieldGroups('root/authenticationConfiguration/ldapConfiguration', [
        'host',
        'port',
      ]),
    ).toEqual([{ properties: ['host', 'port'] }]);
  });

  it('builds a default single group for other objects and drops empty groups', () => {
    expect(
      buildSsoFieldGroups('root/authenticationConfiguration/samlConfiguration/idp', [
        'entityId',
      ]),
    ).toEqual([{ properties: ['entityId'] }]);
    expect(buildSsoFieldGroups('root/authenticationConfiguration', [])).toEqual([]);
  });

  it('splits advanced properties at every object level, in order', () => {
    const leaves = renderedOidcLeaves('auth0', 'confidential');
    const { advancedProperties, normalProperties } =
      splitSsoAdvancedProperties(leaves);
    expect(advancedProperties).toEqual([
      'useNonce',
      'disablePkce',
      'maxClockSkew',
      'maxAge',
    ]);
    expect(normalProperties).not.toContain('useNonce');
    expect(splitSsoAdvancedProperties(['strictMode', 'tokenValidity', 'debugMode']))
      .toEqual({
        advancedProperties: ['tokenValidity'],
        normalProperties: ['strictMode', 'debugMode'],
      });
  });
});

describe('labels, widgets, deprecated, object titles', () => {
  const schema = (overrides: Partial<SsoJsonSchema> = {}): SsoJsonSchema => ({
    type: 'string',
    ...overrides,
  });

  it('resolves labels ui:title > schema title > raw name', () => {
    const base = {
      propertyName: 'truststoreFormat',
      isArrayField: false,
      locale: 'en-US',
      brandName: 'iSmart',
    };
    expect(
      resolveSsoFieldLabel({
        ...base,
        entry: { 'ui:title': 'UI Title' },
        schema: schema({ title: 'Schema Title' }),
      }),
    ).toBe('UI Title');
    expect(
      resolveSsoFieldLabel({
        ...base,
        entry: undefined,
        schema: schema({ title: 'Schema Title' }),
      }),
    ).toBe('Schema Title');
    expect(
      resolveSsoFieldLabel({ ...base, entry: undefined, schema: schema({}) }),
    ).toBe('truststoreFormat');
  });

  it('renders array labels as startCase in English, title translation in Chinese', () => {
    const entry: SsoUiSchemaEntry = { 'ui:title': 'Public Key URLs' };
    expect(
      resolveSsoFieldLabel({
        entry,
        schema: schema({ type: 'array' }),
        propertyName: 'publicKeyUrls',
        isArrayField: true,
        locale: 'en-US',
        brandName: 'iSmart',
      }),
    ).toBe('Public Key Urls');
    expect(
      resolveSsoFieldLabel({
        entry,
        schema: schema({ type: 'array' }),
        propertyName: 'publicKeyUrls',
        isArrayField: true,
        locale: 'zh-CN',
        brandName: 'iSmart',
      }),
    ).toBe('公钥 URL');
    // No title anywhere: Chinese falls back to the English startCase label.
    expect(
      resolveSsoFieldLabel({
        entry: undefined,
        schema: schema({ type: 'array' }),
        propertyName: 'samlDisplayNameAttributes',
        isArrayField: true,
        locale: 'zh-CN',
        brandName: 'iSmart',
      }),
    ).toBe('Saml Display Name Attributes');
  });

  it('resolves widgets with ui overrides winning over schema shape', () => {
    expect(
      resolveSsoWidgetKind({ 'ui:widget': 'hidden' }, schema({})),
    ).toBe('hidden');
    expect(
      resolveSsoWidgetKind(
        { 'ui:title': 'OIDC Use Nonce' },
        schema({ type: 'string' }),
      ),
    ).toBe('text');
    expect(
      resolveSsoWidgetKind(
        { 'ui:widget': 'textarea' },
        schema({ type: 'string', format: 'password' }),
      ),
    ).toBe('textarea');
    expect(
      resolveSsoWidgetKind(
        { 'ui:widget': 'password' },
        schema({ type: 'string', format: 'password' }),
      ),
    ).toBe('password');
    expect(
      resolveSsoWidgetKind(
        { 'ui:widget': 'radio' },
        schema({ type: 'string', enum: ['public', 'confidential'] }),
      ),
    ).toBe('radio');
    expect(
      resolveSsoWidgetKind(undefined, schema({ enum: ['RS256', 'RS384'] })),
    ).toBe('select');
    expect(resolveSsoWidgetKind(undefined, schema({ format: 'password' }))).toBe(
      'password',
    );
    expect(
      resolveSsoWidgetKind(undefined, schema({ type: 'boolean' })),
    ).toBe('checkbox');
    expect(
      resolveSsoWidgetKind(undefined, schema({ type: 'integer' })),
    ).toBe('number');
    expect(
      resolveSsoWidgetKind({ 'ui:field': 'ArrayField' }, schema({})),
    ).toBe('array');
    expect(
      resolveSsoWidgetKind({ 'ui:field': 'RolesSelectField' }, schema({})),
    ).toBe('roles-select');
    expect(
      resolveSsoWidgetKind(
        { 'ui:widget': 'LdapRoleMappingWidget' },
        schema({}),
      ),
    ).toBe('ldap-role-mapping');
    expect(
      resolveSsoWidgetKind(undefined, schema({ type: 'object' })),
    ).toBe('object');
  });

  it('flags deprecated fields by schema flag or table membership', () => {
    expect(isSsoDeprecatedProperty(schema({}), 'jwtPrincipalClaims')).toBe(true);
    expect(isSsoDeprecatedProperty(schema({}), 'authorityUrl')).toBe(true);
    expect(
      isSsoDeprecatedProperty(schema({ deprecated: true }), 'other'),
    ).toBe(true);
    expect(isSsoDeprecatedProperty(schema({}), 'clientId')).toBe(false);
  });

  it('resolves object titles and suppresses blank titles', () => {
    expect(
      resolveSsoObjectTitle({ 'ui:title': ' ' }, schema({ title: 'X' })),
    ).toBeUndefined();
    expect(
      resolveSsoObjectTitle(undefined, schema({ title: 'Oidc Configuration' })),
    ).toBe('Oidc Configuration');
    expect(resolveSsoObjectTitle(undefined, schema({}))).toBeUndefined();
  });

  it('covers every UI-schema title, placeholder and help with a Chinese entry', () => {
    const strings = new Set<string>();
    const walk = (entry: SsoUiSchemaEntry): void => {
      if (entry['ui:title']) strings.add(entry['ui:title']);
      if (entry['ui:placeholder']) strings.add(entry['ui:placeholder']);
      if (entry['ui:help']) strings.add(entry['ui:help']);
      for (const child of Object.values(entry.children ?? {})) walk(child);
    };
    for (const providerSchema of Object.values(SSO_PROVIDER_UI_SCHEMAS)) {
      for (const entry of Object.values(providerSchema)) walk(entry);
    }
    for (const entry of Object.values({
      ...SSO_COMMON_FIELD_TITLES,
      ...SSO_AUTHORIZER_FIELD_TITLES,
    })) {
      walk(entry);
    }
    // Overlay-forced strings (public branch) are covered too.
    strings.add('Callback URL');
    strings.add('Authority');
    strings.add('Public Key URLs');
    expect(strings.size).toBeGreaterThan(80);
    const missing = [...strings].filter((text) => !(text in SSO_FIELD_TEXT_ZH));
    expect(missing).toEqual([]);
  });
});
