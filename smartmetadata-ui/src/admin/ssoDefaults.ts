/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  normalizeSsoFormData,
  type SsoFormData,
  type SsoJsonSchema,
  type SsoSectionData,
} from './ssoSchemas';
import {
  getSsoDefaultClientType,
  getSsoProviderJwtClaims,
  SSO_FALLBACK_FIELD_MAPPINGS,
  SSO_PROVIDER_FIELD_MAPPINGS,
  SSO_PROVIDERS_WITHOUT_BOT_PRINCIPALS,
  type SsoClientType,
} from './ssoProviders';

/**
 * Provider defaults, URL defaults, cleanup pipeline and client-type switches,
 * ported from pin `utils/SSOUtils.ts`, `utils/SSOURLUtils.ts`,
 * `utils/EnvironmentUtils.ts` and `constants/SSO.constant.ts`.
 *
 * Cleanup mutates the nested objects of the data it is given (pin copies only
 * the top level). `comparableSsoFormData` is safe because normalize builds a
 * fresh tree; `buildPayload`-style callers pass the live form state on
 * purpose, matching pin's observable post-save state.
 */

const SSO_DEVELOPMENT: boolean = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.MODE === 'development';
  }
  return !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
})();

export function isSsoDev(): boolean {
  return SSO_DEVELOPMENT;
}

/** Pure URL cores, so both branches are test-lockable without a dev server. */
export function ssoCallbackUrl(isDev: boolean, origin: string): string {
  return isDev ? 'http://localhost:8585/callback' : `${origin}/callback`;
}

export function ssoServerUrl(isDev: boolean, origin: string): string {
  return isDev ? 'http://localhost:8585' : origin;
}

export function ssoAuthorityUrl(isDev: boolean, origin: string): string {
  return isDev
    ? 'http://localhost:8585/api/v1/auth/login'
    : `${origin}/api/v1/auth/login`;
}

export function getSsoCallbackUrl(): string {
  return ssoCallbackUrl(isSsoDev(), globalThis.location.origin);
}

export function getSsoServerUrl(): string {
  return ssoServerUrl(isSsoDev(), globalThis.location.origin);
}

export function getSsoAuthorityUrl(): string {
  return ssoAuthorityUrl(isSsoDev(), globalThis.location.origin);
}

export const SSO_OIDC_DEFAULTS = {
  tokenValidity: 3600,
  sessionExpiry: 604800,
  preferredJwsAlgorithm: 'RS256',
  responseType: 'code',
  tokenValidationAlgorithm: 'RS256',
} as const;

export const SSO_GOOGLE_DEFAULTS = {
  authority: 'https://accounts.google.com',
  publicKeyUrls: ['https://www.googleapis.com/oauth2/v3/certs'],
  discoveryUri: 'https://accounts.google.com/.well-known/openid-configuration',
} as const;

export const SSO_DEFAULT_AUTHORIZER_CLASS_NAME =
  'org.openmetadata.service.security.DefaultAuthorizer';
export const SSO_DEFAULT_CONTAINER_REQUEST_FILTER =
  'org.openmetadata.service.security.JwtFilter';

/** The SAML 1.1 URN fresh forms use — deliberately not the schema 2.0 default. */
export const SSO_SAML_FRESH_NAME_ID =
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';

/**
 * Fresh two-section defaults for one provider (pin `getDefaultsForProvider`).
 * Key construction order mirrors pin: object key order feeds the Test Login
 * key (`JSON.stringify`) and patch ordering, so it is part of the contract.
 * LDAP builds no `ldapConfiguration` block. URL defaults resolve per call
 * (pin resolves them at module load; the origin cannot change mid-session).
 */
export function getSsoDefaultsForProvider(
  provider: string,
  clientType: SsoClientType,
): SsoFormData {
  const isGoogle = provider === 'google';
  const isSaml = provider === 'saml';

  const { discoveryUri = '', authority = '', publicKeyUrls = [] } = isGoogle
    ? {
        discoveryUri: SSO_GOOGLE_DEFAULTS.discoveryUri,
        authority: SSO_GOOGLE_DEFAULTS.authority,
        publicKeyUrls: [...SSO_GOOGLE_DEFAULTS.publicKeyUrls],
      }
    : {};

  const authConfig: SsoSectionData = {
    provider,
    providerName: provider,
    enableSelfSignup: true,
    clientType,
    authority: '',
    clientId: '',
    callbackUrl: '',
    publicKeyUrls: [],
    tokenValidationAlgorithm: 'RS256',
    jwtPrincipalClaims: [...getSsoProviderJwtClaims(provider)],
    jwtPrincipalClaimsMapping: [],
    ...(isGoogle ? { authority, publicKeyUrls } : {}),
    ...(isSaml
      ? {
          authority: getSsoAuthorityUrl(),
          publicKeyUrls: [],
          clientId: '',
          tokenValidationAlgorithm: 'RS256',
          samlConfiguration: {
            debugMode: false,
            idp: {
              entityId: '',
              ssoLoginUrl: '',
              authorityUrl: '',
              idpX509Certificate: '',
              nameId: SSO_SAML_FRESH_NAME_ID,
            },
            sp: {
              entityId: getSsoServerUrl(),
              acs: getSsoCallbackUrl(),
              callback: getSsoCallbackUrl(),
              spX509Certificate: '',
              spPrivateKey: '',
            },
            security: {
              strictMode: false,
              tokenValidity: 3600,
              wantAssertionsSigned: false,
              wantMessagesSigned: false,
              sendSignedAuthRequest: false,
            },
          },
        }
      : {}),
  };

  if (!isSaml && clientType === 'confidential') {
    authConfig.oidcConfiguration = {
      type: provider,
      id: '',
      secret: '',
      scope: 'openid email profile',
      discoveryUri,
      useNonce: false,
      preferredJwsAlgorithm: 'RS256',
      responseType: 'code',
      disablePkce: false,
      maxClockSkew: 0,
      clientAuthenticationMethod: 'client_secret_post',
      tokenValidity: SSO_OIDC_DEFAULTS.tokenValidity,
      customParams: {},
      tenant: '',
      serverUrl: getSsoServerUrl(),
      callbackUrl: getSsoCallbackUrl(),
      maxAge: '',
      prompt: '',
      sessionExpiry: SSO_OIDC_DEFAULTS.sessionExpiry,
      endSessionWithProvider: false,
    };
  } else if (!isSaml) {
    authConfig.authority = authority;
    authConfig.clientId = '';
    authConfig.callbackUrl = getSsoCallbackUrl();
    authConfig.publicKeyUrls = publicKeyUrls;
  }

  return {
    authenticationConfiguration: authConfig,
    authorizerConfiguration: {
      className: SSO_DEFAULT_AUTHORIZER_CLASS_NAME,
      containerRequestFilter: SSO_DEFAULT_CONTAINER_REQUEST_FILTER,
      enforcePrincipalDomain: false,
      enableSecureSocketConnection: false,
      adminPrincipals: [],
      principalDomain: '',
    },
  };
}

/** Fresh form data for a newly selected provider (pin `createFreshFormData`). */
export function createSsoFreshFormData(provider: string): SsoFormData {
  return getSsoDefaultsForProvider(provider, getSsoDefaultClientType(provider));
}

function cleanupSsoOidcConfiguration(
  authConfig: SsoSectionData,
  oidcConfig: SsoSectionData,
): void {
  if (typeof oidcConfig.id === 'string') {
    authConfig.clientId = oidcConfig.id;
  }
  if (typeof oidcConfig.callbackUrl === 'string') {
    authConfig.callbackUrl = oidcConfig.callbackUrl;
  }
  if (typeof oidcConfig.serverUrl === 'string') {
    oidcConfig.serverUrl = oidcConfig.serverUrl.replace(/\/callback\/?$/, '');
  }
}

function cleanupSsoAuthenticationConfig(
  authConfig: SsoSectionData,
  provider: string,
): void {
  if (provider === 'saml' || provider === 'ldap') {
    authConfig.clientType = 'public';
  }

  const fieldsToRemove =
    SSO_PROVIDER_FIELD_MAPPINGS[provider] ?? SSO_FALLBACK_FIELD_MAPPINGS;

  const isPublicClient = authConfig.clientType === 'public';
  if (isPublicClient) {
    for (const field of fieldsToRemove) {
      delete authConfig[field];
    }
    delete authConfig.secret;
  } else {
    for (const field of fieldsToRemove.filter(
      (field) => field !== 'oidcConfiguration',
    )) {
      delete authConfig[field];
    }
  }

  if (!isPublicClient && authConfig.oidcConfiguration) {
    cleanupSsoOidcConfiguration(
      authConfig,
      authConfig.oidcConfiguration as SsoSectionData,
    );
  }
}

function cleanupSsoAuthorizerConfig(
  authorizerConfig: SsoSectionData,
  provider: string,
): void {
  if (SSO_PROVIDERS_WITHOUT_BOT_PRINCIPALS.includes(provider)) {
    delete authorizerConfig.botPrincipals;
  }

  authorizerConfig.enforcePrincipalDomain ??= false;
  authorizerConfig.enableSecureSocketConnection ??= false;
  authorizerConfig.className = SSO_DEFAULT_AUTHORIZER_CLASS_NAME;
  authorizerConfig.containerRequestFilter = SSO_DEFAULT_CONTAINER_REQUEST_FILTER;
}

const SSO_TRUST_STORE_CONFIG_MAP: Readonly<Record<string, string>> = {
  CustomTrustStore: 'customTrustManagerConfig',
  HostName: 'hostNameConfig',
  JVMDefault: 'jvmDefaultConfig',
  TrustAll: 'trustAllConfig',
};

function extractSsoTrustStoreConfig(
  trustStoreConfig: SsoSectionData,
  truststoreFormat: string,
): SsoSectionData {
  const configKey = SSO_TRUST_STORE_CONFIG_MAP[truststoreFormat];
  if (configKey && trustStoreConfig[configKey]) {
    return { [configKey]: trustStoreConfig[configKey] };
  }
  return {};
}

/**
 * LDAP cleanup. VERBATIM DEFECT: the extraction key is `truststoreFormat`
 * (the format value, e.g. `JKS`), while the UI type field is
 * `truststoreConfigType` — so a format value always misses the map and the
 * whole `trustStoreConfig` is replaced by `{}`. Do not "fix" the key.
 */
function cleanupSsoLdapConfig(ldapConfig: SsoSectionData): void {
  ldapConfig.isFullDn ??= false;
  ldapConfig.sslEnabled ??= false;

  if (ldapConfig.trustStoreConfig && ldapConfig.truststoreFormat) {
    ldapConfig.trustStoreConfig = extractSsoTrustStoreConfig(
      ldapConfig.trustStoreConfig as SsoSectionData,
      ldapConfig.truststoreFormat as string,
    );
  }
}

const SSO_LITERAL_NEWLINE = String.raw`\n`;

function cleanupSsoSamlIdp(
  idpConfig: SsoSectionData,
  authConfig: SsoSectionData,
): void {
  if (typeof idpConfig.authorityUrl === 'string') {
    authConfig.authority = idpConfig.authorityUrl;
  }
  if (typeof idpConfig.idpX509Certificate === 'string') {
    idpConfig.idpX509Certificate = idpConfig.idpX509Certificate.replaceAll(
      SSO_LITERAL_NEWLINE,
      '\n',
    );
  }
}

function cleanupSsoSamlSp(
  spConfig: SsoSectionData,
  authConfig: SsoSectionData,
): void {
  if (typeof spConfig.callback === 'string') {
    authConfig.callbackUrl = spConfig.callback;
    spConfig.acs = spConfig.callback;
  }
  if (typeof spConfig.spX509Certificate === 'string') {
    spConfig.spX509Certificate = spConfig.spX509Certificate.replaceAll(
      SSO_LITERAL_NEWLINE,
      '\n',
    );
  }
  if (typeof spConfig.spPrivateKey === 'string') {
    spConfig.spPrivateKey = spConfig.spPrivateKey.replaceAll(
      SSO_LITERAL_NEWLINE,
      '\n',
    );
  }
}

function cleanupSsoSamlSecurity(securityConfig: SsoSectionData): void {
  securityConfig.strictMode ??= false;
  securityConfig.wantAssertionsSigned ??= false;
  securityConfig.wantMessagesSigned ??= false;
  securityConfig.sendSignedAuthRequest ??= false;
}

function cleanupSsoSamlConfig(
  samlConfig: SsoSectionData,
  authConfig: SsoSectionData,
): void {
  samlConfig.debugMode ??= false;

  if (samlConfig.idp && typeof samlConfig.idp === 'object') {
    cleanupSsoSamlIdp(samlConfig.idp as SsoSectionData, authConfig);
  }

  if (samlConfig.sp && typeof samlConfig.sp === 'object') {
    cleanupSsoSamlSp(samlConfig.sp as SsoSectionData, authConfig);
  }

  if (samlConfig.security) {
    cleanupSsoSamlSecurity(samlConfig.security as SsoSectionData);
  }
}

/**
 * Provider cleanup before submit/compare (pin `cleanupProviderSpecificFields`).
 * Returns `undefined` for falsy input; otherwise a shallow top-level copy
 * whose nested objects are the input's own, mutated in place.
 */
export function cleanupSsoProviderFields(
  data: SsoFormData | undefined,
  provider: string,
): SsoFormData | undefined {
  if (!data) {
    return undefined;
  }

  const cleanedData = { ...data };

  if (cleanedData.authenticationConfiguration) {
    cleanupSsoAuthenticationConfig(cleanedData.authenticationConfiguration, provider);
  }

  if (cleanedData.authorizerConfiguration) {
    cleanupSsoAuthorizerConfig(cleanedData.authorizerConfiguration, provider);
  }

  if (cleanedData.authenticationConfiguration?.ldapConfiguration) {
    cleanupSsoLdapConfig(
      cleanedData.authenticationConfiguration.ldapConfiguration as SsoSectionData,
    );
  }

  if (cleanedData.authenticationConfiguration?.samlConfiguration) {
    cleanupSsoSamlConfig(
      cleanedData.authenticationConfiguration.samlConfiguration as SsoSectionData,
      cleanedData.authenticationConfiguration,
    );
  }

  return cleanedData;
}

/**
 * Normalize-then-cleanup, in that fixed order (pin `comparableFormData`).
 * The provider is read from the raw input, not the normalized tree.
 * `undefined` input yields `undefined` (the gate substitutes it explicitly).
 */
export function comparableSsoFormData(
  schema: SsoJsonSchema,
  data: SsoFormData | undefined,
): SsoFormData | undefined {
  if (!data) {
    return undefined;
  }
  const provider = data.authenticationConfiguration?.provider as string;
  return cleanupSsoProviderFields(
    normalizeSsoFormData(schema, data) as SsoFormData,
    provider,
  );
}

/** Load-time reverse fill of the SAML idp authority (pin `populateSamlIdpAuthority`). */
export function populateSsoSamlIdpAuthority(authConfig: SsoSectionData): void {
  const saml = authConfig.samlConfiguration as SsoSectionData | undefined;
  if (!saml?.idp) {
    return;
  }
  const idp = saml.idp as SsoSectionData;
  if (authConfig.authority) {
    idp.authorityUrl = authConfig.authority;
  } else if (!idp.authorityUrl) {
    idp.authorityUrl = '';
  }
}

/** Load-time reverse fill of the SAML sp callback/acs (pin `populateSamlSpCallback`). */
export function populateSsoSamlSpCallback(authConfig: SsoSectionData): void {
  const saml = authConfig.samlConfiguration as SsoSectionData | undefined;
  if (!authConfig.callbackUrl || !saml?.sp) {
    return;
  }
  const sp = saml.sp as SsoSectionData;
  if (!sp.callback) {
    sp.callback = authConfig.callbackUrl;
  }
  if (!sp.acs) {
    sp.acs = authConfig.callbackUrl;
  }
}

/** Load-time SAML reverse fill (pin `applySamlConfiguration`). Mutates in place. */
export function applySsoSamlConfiguration(data: SsoFormData): void {
  const authConfig = data.authenticationConfiguration;
  if (!authConfig?.samlConfiguration) {
    return;
  }
  populateSsoSamlIdpAuthority(authConfig);
  populateSsoSamlSpCallback(authConfig);
}

function handleSsoConfidentialToPublicSwitch(authConfig: SsoSectionData): void {
  const oidcConfig = authConfig.oidcConfiguration as SsoSectionData | undefined;
  authConfig.callbackUrl ??=
    (oidcConfig?.callbackUrl as string | undefined) ?? getSsoCallbackUrl();

  if (authConfig.provider === 'google') {
    authConfig.authority = SSO_GOOGLE_DEFAULTS.authority;
    authConfig.publicKeyUrls = [...SSO_GOOGLE_DEFAULTS.publicKeyUrls];
  }
}

function handleSsoPublicToConfidentialSwitch(authConfig: SsoSectionData): void {
  authConfig.oidcConfiguration ??= {};
  const oidcConfig = authConfig.oidcConfiguration as SsoSectionData;

  oidcConfig.callbackUrl ??=
    (authConfig.callbackUrl as string | undefined) ?? getSsoCallbackUrl();

  if (authConfig.provider === 'google') {
    oidcConfig.type = 'google';
    oidcConfig.discoveryUri = SSO_GOOGLE_DEFAULTS.discoveryUri;
    oidcConfig.tokenValidity = SSO_OIDC_DEFAULTS.tokenValidity;
    oidcConfig.sessionExpiry = SSO_OIDC_DEFAULTS.sessionExpiry;
    oidcConfig.serverUrl = getSsoServerUrl();
    oidcConfig.scope = oidcConfig.scope || 'openid email profile';
    oidcConfig.useNonce = oidcConfig.useNonce ?? false;
    oidcConfig.preferredJwsAlgorithm = oidcConfig.preferredJwsAlgorithm || 'RS256';
    oidcConfig.responseType = oidcConfig.responseType || 'code';
    oidcConfig.disablePkce = oidcConfig.disablePkce ?? false;
    oidcConfig.maxClockSkew = oidcConfig.maxClockSkew ?? 0;
    oidcConfig.clientAuthenticationMethod =
      oidcConfig.clientAuthenticationMethod || 'client_secret_post';
  }
}

/**
 * Migrates values on an actual client-type transition (pin `handleClientTypeChange`).
 * Fires only on confidential↔public transitions; a missing or unchanged type
 * is a no-op. Mutates `authConfig` in place.
 */
export function handleSsoClientTypeChange(
  authConfig: SsoSectionData | undefined,
  previousClientType: SsoClientType | undefined,
  newClientType: SsoClientType | undefined,
): void {
  if (!authConfig || !newClientType || previousClientType === newClientType) {
    return;
  }

  if (newClientType === 'public' && previousClientType === 'confidential') {
    handleSsoConfidentialToPublicSwitch(authConfig);
  } else if (newClientType === 'confidential' && previousClientType === 'public') {
    handleSsoPublicToConfidentialSwitch(authConfig);
  }
}
