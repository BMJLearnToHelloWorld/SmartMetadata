/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * SSO provider tables and pure helpers, ported from the pin reference tree
 * (`openmetadata-ui/.../utils/SSOUtils.ts`, `constants/SSO.constant.ts`,
 * `constants/ServiceType.constant.ts`, `constants/Services.constant.ts`,
 * `utils/CSV/CSVPureUtils.ts`). Every table here is data plus one generic
 * evaluator; no provider-name branching lives in components. Pin defects are
 * reproduced verbatim where noted — never "fixed" during migration.
 */

/** The ten `AuthProvider` enum values (pin `generated/settings/settings.ts`). */
export const SSO_PROVIDER_VALUES = [
  'auth0',
  'aws-cognito',
  'azure',
  'basic',
  'custom-oidc',
  'google',
  'ldap',
  'okta',
  'openmetadata',
  'saml',
] as const;

export type SsoProvider = (typeof SSO_PROVIDER_VALUES)[number];

/** Client type values (pin `generated/configuration/securityConfiguration`). */
export const SSO_CLIENT_TYPES = ['public', 'confidential'] as const;

export type SsoClientType = (typeof SSO_CLIENT_TYPES)[number];

/**
 * Explicit display-name branches (pin `SSOUtils.ts:getProviderDisplayName`).
 * Providers absent here fall back to capitalizing the first letter only, so
 * `ldap` renders `Ldap` and `openmetadata` renders `Openmetadata` — never
 * corrected to `LDAP`/`OPENMETADATA`.
 */
export const SSO_PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  azure: 'Azure AD',
  google: 'Google',
  okta: 'Okta',
  auth0: 'Auth0',
  'aws-cognito': 'AWS Cognito',
  saml: 'SAML',
  'custom-oidc': 'Custom OIDC',
  basic: 'Basic Authentication',
};

export function getSsoProviderDisplayName(provider: string): string {
  const explicit = SSO_PROVIDER_DISPLAY_NAMES[provider];
  if (explicit !== undefined) {
    return explicit;
  }
  if (!provider) {
    return '';
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Provider icons. Pin returns an icon for the eight selector providers and
 * null for `basic`/`openmetadata`/unknown (`SSOUtils.ts:getProviderIcon`).
 * The product tree holds none of the pin assets yet, so every provider
 * resolves to null today and icon containers render empty — the pin
 * null-behaviour. When the assets land (see report residual R-ICON), only
 * this resolver changes; `SsoProviderIcon` already implements the pin
 * shape (function component, image path string, or null).
 *
 * Pin asset paths, for the upload: `assets/img/icon-azure.png`,
 * `icon-google.png`, `icon-okta.png`, `icon-aws-cognito.png`,
 * `assets/svg/ic-saml.svg`, `ic-custom-oidc.svg`; Auth0/LDAP are core
 * icon components (`Auth0`, `Ldap` from ui-core-components/icons).
 */
export function getSsoProviderIcon(_provider: string): null {
  return null;
}

/**
 * Selector cards in fixed order (pin `SSOUtils.ts:PROVIDER_OPTIONS`).
 * Card labels use hyphens (`AWS-Cognito`, `Custom-OIDC`) and differ from
 * display names (`AWS Cognito`, `Custom OIDC`); `LDAP` differs from the
 * display-name fallback `Ldap`. The two string sets must never be unified.
 * `basic`/`openmetadata` have no card.
 */
export const SSO_PROVIDER_OPTIONS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
}> = [
  { key: 'google', label: 'Google' },
  { key: 'azure', label: 'Azure AD' },
  { key: 'okta', label: 'Okta' },
  { key: 'saml', label: 'SAML' },
  { key: 'aws-cognito', label: 'AWS-Cognito' },
  { key: 'custom-oidc', label: 'Custom-OIDC' },
  { key: 'ldap', label: 'LDAP' },
  { key: 'auth0', label: 'Auth0' },
];

/** Known-good JWT claims per provider, order significant (pin `SSOUtils.ts`). */
export const SSO_PROVIDER_JWT_PRINCIPAL_CLAIMS: Readonly<
  Record<string, readonly string[]>
> = {
  google: ['email', 'preferred_username', 'sub'],
  azure: ['preferred_username', 'email', 'upn', 'sub'],
  okta: ['email', 'preferred_username', 'sub'],
  auth0: ['email', 'name', 'sub'],
  'aws-cognito': ['email', 'cognito:username', 'sub'],
  'custom-oidc': ['email', 'preferred_username', 'sub'],
  ldap: ['email', 'preferred_username', 'sub'],
  saml: ['email', 'preferred_username', 'sub'],
};

const SSO_DEFAULT_JWT_PRINCIPAL_CLAIMS: readonly string[] = [
  'email',
  'preferred_username',
  'sub',
];

export function getSsoProviderJwtClaims(provider: string): readonly string[] {
  return SSO_PROVIDER_JWT_PRINCIPAL_CLAIMS[provider] ?? SSO_DEFAULT_JWT_PRINCIPAL_CLAIMS;
}

/** SAML/LDAP are always public; every other provider defaults to confidential. */
export function getSsoDefaultClientType(provider: string): SsoClientType {
  return provider === 'saml' || provider === 'ldap' ? 'public' : 'confidential';
}

/** Root fields removed at schema level for SAML/LDAP (pin `SSO.constant.ts`). */
export const SSO_OIDC_SPECIFIC_FIELDS: readonly string[] = [
  'callbackUrl',
  'clientId',
  'authority',
  'publicKeyUrls',
];

/** Fields removed at schema level for custom-oidc (pin `SSO.constant.ts`). */
export const SSO_NON_OIDC_SPECIFIC_FIELDS: readonly string[] = [
  'ldapConfiguration',
  'samlConfiguration',
  'clientType',
];

/**
 * Cleanup field lists per provider (pin `SSO.constant.ts:PROVIDER_FIELD_MAPPINGS`).
 * VERBATIM DEFECT: the key is `customoidc`, not the enum value `custom-oidc`,
 * so custom-oidc misses the table and cleanup falls back to the all-three-blocks
 * list. Do not correct the key.
 */
export const SSO_PROVIDER_FIELD_MAPPINGS: Readonly<Record<string, readonly string[]>> = {
  ldap: ['samlConfiguration', 'oidcConfiguration'],
  saml: ['ldapConfiguration', 'oidcConfiguration', 'tokenValidationAlgorithm'],
  customoidc: ['ldapConfiguration', 'samlConfiguration'],
  google: ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
  auth0: ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
  azure: ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
  okta: ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
  basic: ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
  'aws-cognito': ['ldapConfiguration', 'samlConfiguration', 'oidcConfiguration'],
};

/** Fallback cleanup list when the provider misses the mapping table. */
export const SSO_FALLBACK_FIELD_MAPPINGS: readonly string[] = [
  'ldapConfiguration',
  'samlConfiguration',
  'oidcConfiguration',
];

/** Providers whose authorizer cleanup deletes `botPrincipals` (pin, 9 keys). */
export const SSO_PROVIDERS_WITHOUT_BOT_PRINCIPALS: readonly string[] = [
  'google',
  'auth0',
  'basic',
  'aws-cognito',
  'azure',
  'okta',
  'ldap',
  'saml',
  'custom-oidc',
];

/**
 * Field names that always carry the Deprecated badge, matched on the leaf
 * name (pin `Services.constant.ts:DEPRECATED_SSO_PROPERTIES`).
 */
export const SSO_DEPRECATED_PROPERTIES: readonly string[] = [
  'adminPrincipals',
  'principalDomain',
  'enforcePrincipalDomain',
  'allowedDomains',
  'botPrincipals',
  'jwtPrincipalClaims',
  'jwtPrincipalClaimsMapping',
  'authorityUrl',
];

/**
 * Field names routed into the Advanced accordion at every object level
 * (pin `ServiceType.constant.ts:ADVANCED_PROPERTIES`, 29 entries). Only
 * `useNonce`, `disablePkce`, `maxClockSkew`, `tokenValidity`, `maxAge` occur
 * in the SSO schemas; the full list is carried so the rule stays the pin rule.
 */
export const SSO_ADVANCED_PROPERTIES: readonly string[] = [
  'connectionArguments',
  'connectionOptions',
  'useAccessHistory',
  'accessHistoryChunkSize',
  'systemMetricsBatchSize',
  'scheme',
  'computeTableMetrics',
  'computeColumnMetrics',
  'includeViews',
  'useStatistics',
  'enableAutoPartitionDetection',
  'confidence',
  'profileSampleConfig',
  'randomizedSample',
  'sampleDataCount',
  'threadCount',
  'timeoutSeconds',
  'metrics',
  'sslConfig',
  'sslMode',
  'schemaRegistrySSL',
  'consumerConfigSSL',
  'verify',
  'useNonce',
  'disablePkce',
  'maxClockSkew',
  'tokenValidity',
  'maxAge',
];

/** URL validity for array URL fields (pin `SSOUtils.ts:isValidUrl`, verbatim). */
const SSO_URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function isSsoValidUrl(urlString: string): boolean {
  return SSO_URL_REGEX.test(urlString.trim());
}

const SSO_ESCAPED_QUOTE_PLACEHOLDER = '__ESCAPED_QUOTE__';

/**
 * Parses the first non-empty CSV row with papaparse's field rules: a field
 * is quoted only when `"` is its first character, `""` inside a quoted field
 * is a literal quote, commas and line breaks inside quotes do not split, and
 * an unterminated quote consumes the rest of the input. Truly empty lines
 * are skipped (`skipEmptyLines: true`); anything after the first row is
 * ignored. This is a dependency-free port of the papaparse configuration
 * pin `splitCSV` uses — papaparse is not a product dependency.
 */
function parseFirstSsoCsvRow(normalizedInput: string): string[] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let fieldStart = true;
  let inQuotes = false;
  let rowHasContent = false;
  let i = 0;

  const endField = () => {
    fields.push(field);
    field = '';
    fieldStart = true;
  };
  const endRow = () => {
    endField();
    if (rowHasContent) {
      rows.push(fields);
    }
    fields = [];
    rowHasContent = false;
  };

  while (i < normalizedInput.length) {
    const ch = normalizedInput[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalizedInput[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && fieldStart && field === '') {
      inQuotes = true;
      fieldStart = false;
      rowHasContent = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      rowHasContent = true;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && normalizedInput[i + 1] === '\n') {
        i += 1;
      }
      endRow();
      if (rows.length > 0) {
        return rows[0];
      }
      i += 1;
      continue;
    }
    field += ch;
    fieldStart = false;
    rowHasContent = true;
    i += 1;
  }
  endRow();
  return rows[0] ?? [];
}

/**
 * Splits one line of comma-separated values (pin `CSVPureUtils.ts:splitCSV`):
 * `\\"` sequences are round-tripped through a placeholder so an escaped
 * quote survives parsing, each parsed value is trimmed and stripped of one
 * surrounding quote pair, and only the first row is returned.
 */
export function splitSsoCsv(input: string): string[] {
  const normalizedInput = input.replaceAll(/\\"/g, SSO_ESCAPED_QUOTE_PLACEHOLDER);
  return parseFirstSsoCsvRow(normalizedInput).map((csvValue) => {
    const trimmed = csvValue.trim();
    const unquoted =
      trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1).trim()
        : trimmed;
    return unquoted.replaceAll(SSO_ESCAPED_QUOTE_PLACEHOLDER, '"').trim();
  });
}
