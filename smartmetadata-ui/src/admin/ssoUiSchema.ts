/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { startCase } from '@/utils/text';
import { SSO_FIELD_TEXT_ZH, resolveSsoFieldText } from './ssoFieldText';
import type { SsoJsonSchema } from './ssoSchemas';

/**
 * UI-schema tables, merge + overlay resolution, grouping and widget/label
 * resolution, ported from pin `constants/SSO.constant.ts`,
 * `hooks/useSsoConfiguration.ts` (`providerUiSchema`),
 * `components/settings/SSO/SSOGroupedFieldTemplate.tsx`,
 * `components/settings/SSO/SSOFieldTemplate.tsx` and
 * `constants/Services.constant.ts` (`DEPRECATED_SSO_PROPERTIES`,
 * `ADVANCED_PROPERTIES`).
 *
 * Entries keep pin's `ui:*` key names so the transcription stays auditable
 * against the source; nested property entries live under `children`
 * (pin nests them as sibling keys, which is ambiguous in TypeScript).
 *
 * VERBATIM DEFECTS preserved here:
 * - `PROVIDER_UI_SCHEMAS` / cleanup / visibility tables key the OIDC table
 *   as `customoidc` (no hyphen), so `custom-oidc` resolves to `{}`.
 * - Group titles exist in the data but are NEVER rendered (pin uses them
 *   only as React keys and className conditions).
 * - Schema descriptions are never rendered (pin's DescriptionFieldTemplate
 *   returns null), so no description handling exists in the renderer.
 */

export type SsoUiWidget =
  | 'hidden'
  | 'password'
  | 'textarea'
  | 'radio'
  | 'LdapRoleMappingWidget';
export type SsoUiFieldKind = 'ArrayField' | 'RolesSelectField';

export interface SsoUiSchemaEntry {
  'ui:title'?: string;
  'ui:widget'?: SsoUiWidget;
  'ui:placeholder'?: string;
  'ui:help'?: string;
  'ui:readonly'?: boolean;
  'ui:hideError'?: boolean;
  'ui:field'?: SsoUiFieldKind;
  'ui:options'?: Readonly<Record<string, unknown>>;
  'ui:classNames'?: string;
  children?: Readonly<Record<string, SsoUiSchemaEntry>>;
}

export const SSO_HIDDEN_ENTRY: Readonly<SsoUiSchemaEntry> = Object.freeze({
  'ui:widget': 'hidden',
  'ui:hideError': true,
});

const SSO_OIDC_CALLBACK_URL_TITLE = 'OIDC Callback URL';
const SSO_AUTHORITY_URL_PLACEHOLDER = 'e.g. https://accounts.google.com';
const SSO_ENABLE_SELF_SIGNUP_TITLE = 'Enable Self Signup';
const SSO_AUTO_GENERATED_CALLBACK_URL_HELP =
  'Auto-generated callback URL. Copy this and register it as Redirect URI in your OIDC provider configuration.';
const SSO_GOOGLE_AUTHORITY = 'https://accounts.google.com';
const SSO_GOOGLE_DISCOVERY_URI =
  'https://accounts.google.com/.well-known/openid-configuration';

export const SSO_COMMON_UI_FIELDS = {
  clientId: {
    'ui:title': 'Client ID',
    'ui:placeholder': 'e.g. 123456890-abcdef.apps.googleusercontent.com',
  },
  clientSecret: {
    'ui:title': 'Client Secret',
    'ui:widget': 'password',
    'ui:placeholder': 'Enter your client secret',
  },
  oidcClientId: {
    'ui:title': 'OIDC Client ID',
    'ui:placeholder': 'e.g. 123456890-abcdef.apps.googleusercontent.com',
  },
  oidcClientSecret: {
    'ui:title': 'OIDC Client Secret',
    'ui:widget': 'password',
    'ui:placeholder': 'Enter your OIDC client secret',
  },
  oidcScope: {
    'ui:title': 'OIDC Request Scopes',
    'ui:placeholder': 'Enter scope (e.g. openid, email, profile) and press ENTER',
    'ui:field': 'ArrayField',
  },
  oidcDiscoveryUri: {
    'ui:title': 'OIDC Discovery URI',
    'ui:placeholder':
      'e.g. https://accounts.google.com/.well-known/openid_configuration',
  },
  oidcCallbackUrl: {
    'ui:title': SSO_OIDC_CALLBACK_URL_TITLE,
    'ui:placeholder': 'e.g. https://myapp.com/callback',
  },
  oidcServerUrl: {
    'ui:title': 'OIDC Server URL',
    'ui:placeholder': 'e.g. https://your-domain.auth0.com',
  },
  oidcTenant: {
    'ui:title': 'OIDC Tenant',
    'ui:placeholder': 'e.g. your-tenant-id',
  },
  oidcConfiguration: { 'ui:title': 'OIDC Configuration' },
  oidcIdpType: { 'ui:title': 'OIDC IDP Type' },
  oidcUseNonce: { 'ui:title': 'OIDC Use Nonce' },
  oidcPreferredJwsAlgorithm: { 'ui:title': 'OIDC Preferred JWS Algorithm' },
  oidcResponseType: { 'ui:title': 'OIDC Response Type' },
  oidcDisablePkce: { 'ui:title': 'OIDC Disable PKCE' },
  oidcMaxClockSkew: { 'ui:title': 'OIDC Max Clock Skew' },
  oidcClientAuthenticationMethod: {
    'ui:title': 'OIDC Client Authentication Method',
  },
  oidcTokenValidity: { 'ui:widget': 'hidden', 'ui:hideError': true },
  oidcCustomParameters: { 'ui:title': 'OIDC Custom Parameters' },
  oidcMaxAge: { 'ui:title': 'OIDC Max Age' },
  oidcPrompt: { 'ui:title': 'OIDC Prompt' },
  oidcSessionExpiry: { 'ui:title': 'OIDC Session Expiry' },
  oidcEndSessionWithProvider: { 'ui:widget': 'hidden', 'ui:hideError': true },
  authority: {
    'ui:title': 'Authority',
    'ui:placeholder': SSO_AUTHORITY_URL_PLACEHOLDER,
  },
  callbackUrl: {
    'ui:title': 'Callback URL',
    'ui:placeholder': 'e.g. https://myapp.com/callback',
  },
  publicKeyUrls: {
    'ui:title': 'Public Key URLs',
    'ui:placeholder':
      'Enter value (e.g. https://www.googleapis.com/oauth2/v3/certs) and press ENTER',
  },
} as const satisfies Record<string, SsoUiSchemaEntry>;

const SSO_COMMON_HIDDEN_FIELDS: Record<string, SsoUiSchemaEntry> = {
  responseType: SSO_HIDDEN_ENTRY,
  forceSecureSessionCookie: SSO_HIDDEN_ENTRY,
};

const SSO_AUTHORIZER_HIDDEN_FIELDS: Record<string, SsoUiSchemaEntry> = {
  testPrincipals: SSO_HIDDEN_ENTRY,
};

const SSO_LDAP_UI_SCHEMA: Record<string, SsoUiSchemaEntry> = {
  ldapConfiguration: {
    'ui:title': 'LDAP Configuration',
    children: {
      host: { 'ui:title': 'LDAP Host', 'ui:placeholder': 'e.g. ldap.example.com' },
      port: { 'ui:title': 'LDAP Port', 'ui:placeholder': 'e.g. 389 or 636' },
      dnAdminPrincipal: {
        'ui:title': 'Admin Principal DN',
        'ui:placeholder': 'e.g. cn=admin,dc=example,dc=com',
      },
      dnAdminPassword: {
        'ui:title': 'Admin Password',
        'ui:widget': 'password',
        'ui:placeholder': 'Enter LDAP admin password',
      },
      userBaseDN: {
        'ui:title': 'User Base DN',
        'ui:placeholder': 'e.g. ou=users,dc=example,dc=com',
      },
      groupBaseDN: {
        'ui:title': 'Group Base DN',
        'ui:placeholder': 'e.g. ou=groups,dc=example,dc=com',
      },
      sslEnabled: { 'ui:title': 'Enable SSL' },
      maxPoolSize: { 'ui:title': 'Max Pool Size' },
      isFullDn: { 'ui:title': 'Full DN Required' },
      roleAdminName: { 'ui:title': 'Admin Role Name' },
      allAttributeName: { 'ui:title': 'All Attribute Name' },
      mailAttributeName: { 'ui:title': 'Mail Attribute Name' },
      usernameAttributeName: SSO_HIDDEN_ENTRY,
      groupAttributeName: { 'ui:title': 'Group Attribute Name' },
      groupAttributeValue: { 'ui:title': 'Group Attribute Value' },
      groupMemberAttributeName: { 'ui:title': 'Group Member Attribute Name' },
      recursiveGroupMembership: {
        'ui:title': 'Recursive Group Membership',
        'ui:help':
          'Enable this for Active Directory nested groups. OpenMetadata will use AD transitive membership matching when checking role mappings.',
      },
      authRolesMapping: {
        'ui:title': 'Auth Roles Mapping',
        'ui:widget': 'LdapRoleMappingWidget',
        'ui:help':
          'Map LDAP groups to {brandName} roles. Users in mapped LDAP groups will automatically be assigned the corresponding roles.',
      },
      authReassignRoles: {
        'ui:title': 'Auth Reassign Roles',
        'ui:field': 'RolesSelectField',
        'ui:placeholder': 'Select roles to reassign to users on every login',
      },
      truststoreConfigType: { 'ui:title': 'Trust Store Config Type' },
      trustStoreConfig: {
        'ui:title': 'Trust Store Configuration',
        children: {
          customTrustManagerConfig: {
            'ui:title':
              'Custom Trust Store Settings (Use when Trust Store Config Type = CustomTrustStore)',
            children: {
              trustStoreFilePath: {
                'ui:title': 'Trust Store File Path',
                'ui:placeholder': '/opt/openmetadata/certs/ldap-truststore.jks',
              },
              trustStoreFilePassword: {
                'ui:title': 'Trust Store Password',
                'ui:widget': 'password',
              },
              trustStoreFileFormat: {
                'ui:title': 'Trust Store Format',
                'ui:placeholder': 'JKS',
              },
              verifyHostname: { 'ui:title': 'Verify Hostname' },
              examineValidityDates: { 'ui:title': 'Check Certificate Validity' },
            },
          },
          hostNameConfig: {
            'ui:title':
              'Hostname Settings (Use when Trust Store Config Type = HostName)',
            children: {
              allowWildCards: { 'ui:title': 'Allow Wildcards' },
              acceptableHostNames: {
                'ui:title': 'Acceptable Host Names',
                'ui:options': { addable: true },
              },
            },
          },
          trustAllConfig: {
            'ui:title':
              'Trust All Settings (Use when Trust Store Config Type = TrustAll)',
            children: {
              examineValidityDates: { 'ui:title': 'Check Certificate Validity' },
            },
          },
          jvmDefaultConfig: {
            'ui:title':
              'JVM Default Settings (Use when Trust Store Config Type = JVMDefault)',
            children: {
              verifyHostname: { 'ui:title': 'Verify Hostname' },
            },
          },
        },
      },
    },
  },
  samlConfiguration: SSO_HIDDEN_ENTRY,
  oidcConfiguration: SSO_HIDDEN_ENTRY,
  enableSelfSignup: { 'ui:title': SSO_ENABLE_SELF_SIGNUP_TITLE },
  clientType: SSO_HIDDEN_ENTRY,
  jwtPrincipalClaims: SSO_HIDDEN_ENTRY,
  jwtPrincipalClaimsMapping: SSO_HIDDEN_ENTRY,
  jwtTeamClaimMapping: SSO_HIDDEN_ENTRY,
  publicKeyUrls: SSO_HIDDEN_ENTRY,
  tokenValidationAlgorithm: SSO_HIDDEN_ENTRY,
};

const SSO_SAML_UI_SCHEMA: Record<string, SsoUiSchemaEntry> = {
  samlConfiguration: {
    'ui:title': 'SAML Configuration',
    children: {
      debugMode: { 'ui:title': 'Debug Mode' },
      idp: {
        'ui:title': 'Identity Provider (IdP)',
        children: {
          entityId: { 'ui:title': 'IdP Entity ID' },
          ssoLoginUrl: { 'ui:title': 'IdP SSO Login URL' },
          authorityUrl: SSO_HIDDEN_ENTRY,
          idpX509Certificate: {
            'ui:title': 'IdP X.509 Certificate',
            'ui:widget': 'textarea',
          },
          nameId: { 'ui:title': 'Name ID Format' },
        },
      },
      sp: {
        'ui:title': 'Service Provider (SP)',
        children: {
          entityId: {
            'ui:title': 'SP Entity ID',
            'ui:readonly': true,
            'ui:help':
              'Auto-generated Service Provider Entity ID. Copy this value and paste it as Entity ID in your SAML Identity Provider configuration.',
          },
          acs: {
            'ui:title': 'Assertion Consumer Service URL',
            'ui:readonly': true,
            'ui:help':
              'Auto-generated Assertion Consumer Service URL. Copy this value and paste it as ACS URL (or Reply URL) in your SAML Identity Provider configuration.',
          },
          callback: SSO_HIDDEN_ENTRY,
          spX509Certificate: {
            'ui:title': 'SP X.509 Certificate',
            'ui:widget': 'textarea',
          },
          spPrivateKey: { 'ui:title': 'SP Private Key', 'ui:widget': 'textarea' },
        },
      },
      security: {
        'ui:title': 'Security Configuration',
        children: {
          strictMode: { 'ui:title': 'Strict Mode' },
          tokenValidity: {
            'ui:title': 'Token Validity (seconds)',
            'ui:options': { inputType: 'number' },
          },
          wantAssertionsSigned: { 'ui:title': 'Want Assertions Signed' },
          wantMessagesSigned: { 'ui:title': 'Want Messages Signed' },
          sendSignedAuthRequest: { 'ui:title': 'Send Signed Auth Request' },
          validateXml: SSO_HIDDEN_ENTRY,
          sendEncryptedNameId: SSO_HIDDEN_ENTRY,
          signSpMetadata: SSO_HIDDEN_ENTRY,
          wantAssertionEncrypted: SSO_HIDDEN_ENTRY,
          keyStoreFilePath: SSO_HIDDEN_ENTRY,
          keyStoreAlias: SSO_HIDDEN_ENTRY,
          keyStorePassword: SSO_HIDDEN_ENTRY,
        },
      },
    },
  },
  ldapConfiguration: SSO_HIDDEN_ENTRY,
  oidcConfiguration: SSO_HIDDEN_ENTRY,
  tokenValidationAlgorithm: SSO_HIDDEN_ENTRY,
  jwtPrincipalClaims: SSO_HIDDEN_ENTRY,
  jwtPrincipalClaimsMapping: SSO_HIDDEN_ENTRY,
  jwtTeamClaimMapping: SSO_HIDDEN_ENTRY,
  enableSelfSignup: { 'ui:title': SSO_ENABLE_SELF_SIGNUP_TITLE },
  clientType: SSO_HIDDEN_ENTRY,
  authority: SSO_HIDDEN_ENTRY,
  clientId: SSO_COMMON_UI_FIELDS.clientId,
  callbackUrl: SSO_HIDDEN_ENTRY,
  publicKeyUrls: SSO_HIDDEN_ENTRY,
};

function ssoOidcObjectChildren(
  overrides: Record<string, SsoUiSchemaEntry>,
): Record<string, SsoUiSchemaEntry> {
  const f = SSO_COMMON_UI_FIELDS;
  return {
    type: f.oidcIdpType,
    id: f.oidcClientId,
    secret: f.oidcClientSecret,
    scope: f.oidcScope,
    discoveryUri: f.oidcDiscoveryUri,
    useNonce: f.oidcUseNonce,
    preferredJwsAlgorithm: SSO_HIDDEN_ENTRY,
    responseType: SSO_HIDDEN_ENTRY,
    disablePkce: f.oidcDisablePkce,
    maxClockSkew: f.oidcMaxClockSkew,
    clientAuthenticationMethod: f.oidcClientAuthenticationMethod,
    tokenValidity: f.oidcTokenValidity,
    customParams: f.oidcCustomParameters,
    tenant: f.oidcTenant,
    serverUrl: SSO_HIDDEN_ENTRY,
    callbackUrl: {
      'ui:title': SSO_OIDC_CALLBACK_URL_TITLE,
      'ui:readonly': true,
      'ui:help': SSO_AUTO_GENERATED_CALLBACK_URL_HELP,
    },
    maxAge: f.oidcMaxAge,
    prompt: f.oidcPrompt,
    sessionExpiry: f.oidcSessionExpiry,
    endSessionWithProvider: f.oidcEndSessionWithProvider,
    ...overrides,
  };
}

/** Dead table: keyed `customoidc` in PROVIDER_UI_SCHEMAS, never selected. */
const SSO_OIDC_UI_SCHEMA: Record<string, SsoUiSchemaEntry> = {
  oidcConfiguration: {
    ...SSO_COMMON_UI_FIELDS.oidcConfiguration,
    children: ssoOidcObjectChildren({}),
  },
  ldapConfiguration: SSO_HIDDEN_ENTRY,
  samlConfiguration: SSO_HIDDEN_ENTRY,
  tokenValidationAlgorithm: SSO_HIDDEN_ENTRY,
  publicKeyUrls: SSO_HIDDEN_ENTRY,
};

function ssoStandardOAuthSchema(
  oidcOverrides: Record<string, SsoUiSchemaEntry>,
): Record<string, SsoUiSchemaEntry> {
  return {
    ldapConfiguration: SSO_HIDDEN_ENTRY,
    samlConfiguration: SSO_HIDDEN_ENTRY,
    oidcConfiguration: {
      ...SSO_COMMON_UI_FIELDS.oidcConfiguration,
      children: ssoOidcObjectChildren({
        type: SSO_HIDDEN_ENTRY,
        clientAuthenticationMethod: SSO_HIDDEN_ENTRY,
        tenant: SSO_HIDDEN_ENTRY,
        ...oidcOverrides,
      }),
    },
    tokenValidationAlgorithm: SSO_HIDDEN_ENTRY,
    enableSelfSignup: { 'ui:title': SSO_ENABLE_SELF_SIGNUP_TITLE },
    publicKeyUrls: SSO_HIDDEN_ENTRY,
  };
}

const SSO_STANDARD_OAUTH_UI_SCHEMA = ssoStandardOAuthSchema({});
const SSO_AZURE_OAUTH_UI_SCHEMA = ssoStandardOAuthSchema({
  tenant: SSO_COMMON_UI_FIELDS.oidcTenant,
});
const SSO_OKTA_OAUTH_UI_SCHEMA = ssoStandardOAuthSchema({
  clientAuthenticationMethod: SSO_COMMON_UI_FIELDS.oidcClientAuthenticationMethod,
});
const SSO_GOOGLE_OAUTH_UI_SCHEMA: Record<string, SsoUiSchemaEntry> = {
  ...ssoStandardOAuthSchema({
    discoveryUri: {
      'ui:title': 'OIDC Discovery URI',
      'ui:placeholder': SSO_GOOGLE_DISCOVERY_URI,
    },
    sessionExpiry: {
      'ui:title': 'OIDC Session Expiry',
      'ui:placeholder': 'Default: 604800',
    },
  }),
  authority: {
    'ui:title': 'Authority',
    'ui:placeholder': SSO_GOOGLE_AUTHORITY,
  },
};

export const SSO_COMMON_FIELD_TITLES: Record<string, SsoUiSchemaEntry> = {
  provider: {
    'ui:title': 'Provider',
    'ui:options': { 'data-testid': 'sso-provider-field' },
  },
  providerName: {
    'ui:title': 'Provider Name',
    'ui:placeholder': 'e.g. My Company SSO',
  },
  authority: SSO_COMMON_UI_FIELDS.authority,
  clientId: SSO_COMMON_UI_FIELDS.clientId,
  callbackUrl: SSO_COMMON_UI_FIELDS.callbackUrl,
  publicKeyUrls: SSO_COMMON_UI_FIELDS.publicKeyUrls,
  tokenValidationAlgorithm: { 'ui:title': 'Token Validation Algorithm' },
  jwtPrincipalClaims: {
    'ui:title': 'JWT Principal Claims',
    'ui:placeholder': 'Enter value (e.g. email, sub, name) and press ENTER',
    'ui:help':
      '⚠️ CRITICAL: Incorrect claims will lock out ALL users including admins! ' +
      'Order matters - first matching claim is used. ' +
      'These claims must exist in JWT tokens from your provider. ' +
      'Default values work for most configurations.',
  },
  jwtPrincipalClaimsMapping: {
    'ui:title': 'JWT Principal Claims Mapping',
    'ui:placeholder':
      'Enter mappings (e.g. username:preferred_username, email:email). Both username and email are required.',
  },
  enableSelfSignup: { 'ui:title': SSO_ENABLE_SELF_SIGNUP_TITLE },
  enableAutoRedirect: { 'ui:title': 'Enable Auto Redirect' },
  emailClaim: {
    'ui:title': 'Email Claim',
    'ui:placeholder': 'e.g. email',
    'ui:help':
      "JWT/SAML/LDAP attribute containing the user's email. " +
      'When configured, enables email-first identity resolution. ' +
      'Replaces jwtPrincipalClaims for simpler configuration.',
  },
  displayNameClaim: {
    'ui:title': 'Display Name Claim',
    'ui:placeholder': 'e.g. name',
    'ui:help':
      "JWT/SAML/LDAP attribute containing the user's display name. " +
      'Only used when Email Claim is configured.',
  },
  clientType: {
    'ui:title': 'Client Type',
    'ui:widget': 'radio',
    'ui:options': { inline: true },
  },
  // Dead entry: no root `secret` property exists in the auth schema.
  secret: SSO_COMMON_UI_FIELDS.clientSecret,
};

export const SSO_AUTHORIZER_FIELD_TITLES: Record<string, SsoUiSchemaEntry> = {
  className: SSO_HIDDEN_ENTRY,
  containerRequestFilter: SSO_HIDDEN_ENTRY,
  adminPrincipals: {
    'ui:title': 'Admin Principals',
    'ui:placeholder':
      'Enter value (e.g. admin@example.com, security@example.com) and press ENTER',
  },
  botPrincipals: {
    'ui:title': 'Bot Principals',
    'ui:placeholder':
      'Enter value (e.g. ingestion-bot@example.com) and press ENTER',
  },
  principalDomain: {
    'ui:title': 'Principal Domain',
    'ui:placeholder': SSO_AUTHORITY_URL_PLACEHOLDER,
  },
  enforcePrincipalDomain: { 'ui:title': 'Enforce Principal Domain' },
  enableSecureSocketConnection: {
    'ui:title': 'Enable Secure Socket Connection',
  },
  useRolesFromProvider: { 'ui:title': 'Use Roles From Provider' },
  allowedEmailRegistrationDomains: {
    'ui:title': 'Allowed Email Registration Domains',
    'ui:placeholder':
      'Enter domain (e.g. example.com) and press ENTER. Use "all" to allow all domains.',
  },
  adminEmails: {
    'ui:title': 'Admin Emails',
    'ui:placeholder': 'Enter email (e.g. admin@company.com) and press ENTER',
    'ui:help':
      'Preferred over Admin Principals. Uses full email addresses for admin designation.',
  },
  allowedEmailDomains: {
    'ui:title': 'Allowed Email Domains',
    'ui:placeholder': 'Enter domain (e.g. company.com) and press ENTER',
    'ui:help':
      'Restrict authentication to users from these email domains. If empty, all domains are allowed.',
  },
  botDomain: {
    'ui:title': 'Bot Domain',
    'ui:placeholder': 'e.g. openmetadata.org',
    'ui:help':
      'Email domain for system-created bots (e.g. ingestion-bot@{botDomain}).',
  },
};

/** VERBATIM DEFECT: the OIDC table is keyed `customoidc`, never `custom-oidc`. */
export const SSO_PROVIDER_UI_SCHEMAS: Record<
  string,
  Record<string, SsoUiSchemaEntry>
> = {
  ldap: SSO_LDAP_UI_SCHEMA,
  saml: SSO_SAML_UI_SCHEMA,
  customoidc: SSO_OIDC_UI_SCHEMA,
  google: SSO_GOOGLE_OAUTH_UI_SCHEMA,
  auth0: SSO_STANDARD_OAUTH_UI_SCHEMA,
  azure: SSO_AZURE_OAUTH_UI_SCHEMA,
  okta: SSO_OKTA_OAUTH_UI_SCHEMA,
  basic: SSO_STANDARD_OAUTH_UI_SCHEMA,
  'aws-cognito': SSO_STANDARD_OAUTH_UI_SCHEMA,
};

const SSO_BOT_PRINCIPALS_VISIBILITY: Record<string, SsoUiSchemaEntry> = {
  google: SSO_HIDDEN_ENTRY,
  auth0: SSO_HIDDEN_ENTRY,
  basic: SSO_HIDDEN_ENTRY,
  'aws-cognito': SSO_HIDDEN_ENTRY,
  azure: SSO_HIDDEN_ENTRY,
  okta: SSO_HIDDEN_ENTRY,
  ldap: SSO_HIDDEN_ENTRY,
  saml: SSO_HIDDEN_ENTRY,
  'custom-oidc': SSO_HIDDEN_ENTRY,
};

const SSO_USE_ROLES_FROM_PROVIDER_VISIBILITY: Record<string, SsoUiSchemaEntry> = {
  ldap: SSO_HIDDEN_ENTRY,
  saml: SSO_HIDDEN_ENTRY,
};

/** VERBATIM DEFECT: `customoidc` key — custom-oidc keeps the field visible. */
const SSO_ALLOWED_EMAIL_REGISTRATION_DOMAINS_VISIBILITY: Record<
  string,
  SsoUiSchemaEntry
> = {
  ldap: SSO_HIDDEN_ENTRY,
  saml: SSO_HIDDEN_ENTRY,
  customoidc: SSO_HIDDEN_ENTRY,
  google: SSO_HIDDEN_ENTRY,
  auth0: SSO_HIDDEN_ENTRY,
  azure: SSO_HIDDEN_ENTRY,
  okta: SSO_HIDDEN_ENTRY,
  'aws-cognito': SSO_HIDDEN_ENTRY,
};

export interface SsoUiSchemaResolution {
  authenticationConfiguration: SsoUiSchemaEntry;
  authorizerConfiguration: SsoUiSchemaEntry;
}

/**
 * Resolves the effective two-section UI schema: pin `getSSOUISchema` merge
 * followed by the `providerUiSchema` overlay. Key-level replacement is
 * wholesale (pin spreads objects, never deep-merges). Returns `{}` for an
 * empty provider, exactly like the pin memo.
 */
export function resolveSsoUiSchema(args: {
  provider: string;
  hasExistingConfig: boolean;
  hasSavedData: boolean;
  clientType: string | undefined;
}): SsoUiSchemaResolution | Record<string, never> {
  const { provider, hasExistingConfig, hasSavedData, clientType } = args;
  if (!provider) {
    return {};
  }

  const providerSchema = SSO_PROVIDER_UI_SCHEMAS[provider] ?? {};
  const enableSelfSignupEntry: SsoUiSchemaEntry = hasExistingConfig
    ? SSO_HIDDEN_ENTRY
    : { 'ui:title': SSO_ENABLE_SELF_SIGNUP_TITLE };

  const authChildren: Record<string, SsoUiSchemaEntry> = {
    ...SSO_COMMON_HIDDEN_FIELDS,
    ...SSO_COMMON_FIELD_TITLES,
    ...providerSchema,
    enableSelfSignup: enableSelfSignupEntry,
  };

  // Overlay: provider is always hidden (separate selector screen).
  authChildren.provider = SSO_HIDDEN_ENTRY;

  if (
    (hasExistingConfig && hasSavedData) ||
    provider === 'saml' ||
    provider === 'ldap'
  ) {
    authChildren.clientType = SSO_HIDDEN_ENTRY;
  }

  if (clientType === 'public') {
    authChildren.oidcConfiguration = SSO_HIDDEN_ENTRY;
    authChildren.callbackUrl = {
      'ui:title': 'Callback URL',
      'ui:placeholder': 'e.g. https://myapp.com/callback',
    };
    authChildren.publicKeyUrls = {
      'ui:title': 'Public Key URLs',
      'ui:placeholder':
        'Enter value (e.g. https://www.googleapis.com/oauth2/v3/certs) and press ENTER',
    };
    authChildren.authority = {
      'ui:title': 'Authority',
      'ui:placeholder': 'e.g. https://accounts.google.com',
    };
  } else if (clientType === 'confidential') {
    authChildren.oidcConfiguration ??= { 'ui:title': 'OIDC Configuration' };
    authChildren.clientId = SSO_HIDDEN_ENTRY;
    authChildren.callbackUrl = SSO_HIDDEN_ENTRY;
    // NOTE: non-Google confidential authority is NOT hidden (pin never
    // touches it here); it stays visible with the common title.
    if (provider === 'google') {
      authChildren.authority = {
        'ui:title': 'Authority',
        'ui:placeholder': SSO_GOOGLE_AUTHORITY,
      };
    }
  }

  const authorizerChildren: Record<string, SsoUiSchemaEntry> = {
    ...SSO_AUTHORIZER_HIDDEN_FIELDS,
    ...SSO_AUTHORIZER_FIELD_TITLES,
    botPrincipals:
      SSO_BOT_PRINCIPALS_VISIBILITY[provider] ??
      SSO_AUTHORIZER_FIELD_TITLES.botPrincipals,
    useRolesFromProvider:
      SSO_USE_ROLES_FROM_PROVIDER_VISIBILITY[provider] ??
      SSO_AUTHORIZER_FIELD_TITLES.useRolesFromProvider,
    allowedEmailRegistrationDomains:
      SSO_ALLOWED_EMAIL_REGISTRATION_DOMAINS_VISIBILITY[provider] ??
      SSO_AUTHORIZER_FIELD_TITLES.allowedEmailRegistrationDomains,
  };

  return {
    authenticationConfiguration: {
      'ui:title': ' ',
      'ui:classNames': 'hide-section-title',
      children: authChildren,
    },
    authorizerConfiguration: {
      'ui:title': ' ',
      'ui:classNames': 'hide-section-title',
      children: authorizerChildren,
    },
  };
}

export function isSsoUiHidden(
  entry: SsoUiSchemaEntry | undefined,
): boolean {
  return entry?.['ui:widget'] === 'hidden';
}

/** Walks `children` along a path of property names. */
export function getSsoUiEntry(
  resolution: SsoUiSchemaResolution | Record<string, never>,
  path: string[],
): SsoUiSchemaEntry | undefined {
  let current: SsoUiSchemaEntry | undefined = (
    resolution as SsoUiSchemaResolution
  )[path[0] as 'authenticationConfiguration' | 'authorizerConfiguration'];
  for (const segment of path.slice(1)) {
    current = current?.children?.[segment];
  }
  return current;
}

export const SSO_AUTHENTICATION_FIELD_GROUPS = {
  basic: ['provider', 'providerName'],
  client: ['clientType', 'enableSelfSignup', 'clientId', 'callbackUrl'],
  authority: ['authority'],
  security: ['publicKeyUrls', 'tokenValidationAlgorithm'],
  credentials: ['secret', 'clientSecret'],
  providerConfigs: [
    'oidcConfiguration',
    'ldapConfiguration',
    'samlConfiguration',
  ],
  identity: [
    'emailClaim',
    'displayNameClaim',
    'jwtPrincipalClaims',
    'jwtPrincipalClaimsMapping',
    'jwtTeamClaimMapping',
  ],
} as const;

export const SSO_AUTHORIZER_FIELD_GROUPS = {
  admin: ['adminEmails'],
  domain: ['allowedEmailDomains', 'botDomain'],
  connection: [
    'enableSecureSocketConnection',
    'className',
    'containerRequestFilter',
    'useRolesFromProvider',
  ],
  deprecated: [
    'adminPrincipals',
    'principalDomain',
    'enforcePrincipalDomain',
    'allowedDomains',
    'botPrincipals',
  ],
} as const;

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

export interface SsoFieldGroup {
  /** Group titles are data only: pin never renders them (see module note). */
  title?: string;
  properties: string[];
}

function filterGroup(
  visibleNames: string[],
  members: readonly string[],
): string[] {
  return visibleNames.filter((name) => members.includes(name));
}

/**
 * Builds the field groups for one object, filtering the caller-provided
 * visible names (schema order) by group membership — pin
 * `SSOGroupedFieldTemplate.getFieldGroups`. Empty groups are dropped.
 */
export function buildSsoFieldGroups(
  objectId: string,
  visibleNames: string[],
): SsoFieldGroup[] {
  const groups: SsoFieldGroup[] = [];
  const auth = SSO_AUTHENTICATION_FIELD_GROUPS;
  const authorizer = SSO_AUTHORIZER_FIELD_GROUPS;

  if (objectId === 'root/authenticationConfiguration') {
    const basic = filterGroup(visibleNames, auth.basic);
    if (basic.length > 0) {
      groups.push({ title: 'Basic Configuration', properties: basic });
    }
    const client = filterGroup(visibleNames, auth.client);
    if (client.length > 0) {
      groups.push({ title: 'Client Configuration', properties: client });
    }
    const authority = filterGroup(visibleNames, auth.authority);
    if (authority.length > 0) {
      groups.push({ title: 'Authority Settings', properties: authority });
    }
    const security = filterGroup(visibleNames, auth.security);
    if (security.length > 0) {
      groups.push({ title: 'Security Configuration', properties: security });
    }
    const credentials = filterGroup(visibleNames, auth.credentials);
    if (credentials.length > 0) {
      groups.push({ title: 'Credentials', properties: credentials });
    }
    for (const field of filterGroup(visibleNames, auth.providerConfigs)) {
      groups.push({ properties: [field] });
    }
    const identity = filterGroup(visibleNames, auth.identity);
    if (identity.length > 0) {
      groups.push({ title: 'Identity Configuration', properties: identity });
    }
    const grouped = new Set(
      [...basic, ...client, ...authority, ...security, ...credentials,
        ...filterGroup(visibleNames, auth.providerConfigs), ...identity],
    );
    const remaining = visibleNames.filter((name) => !grouped.has(name));
    if (remaining.length > 0) {
      groups.push({ title: 'Advanced Configuration', properties: remaining });
    }
  } else if (objectId === 'root/authorizerConfiguration') {
    const admin = filterGroup(visibleNames, authorizer.admin);
    if (admin.length > 0) {
      groups.push({ title: 'Admin Management', properties: admin });
    }
    const domain = filterGroup(visibleNames, authorizer.domain);
    if (domain.length > 0) {
      groups.push({ title: 'Domain Configuration', properties: domain });
    }
    const connection = filterGroup(visibleNames, authorizer.connection);
    if (connection.length > 0) {
      groups.push({ title: 'Connection Settings', properties: connection });
    }
    const deprecated = filterGroup(visibleNames, authorizer.deprecated);
    if (deprecated.length > 0) {
      groups.push({
        title: 'Legacy Configuration (Deprecated)',
        properties: deprecated,
      });
    }
    const grouped = new Set([...admin, ...domain, ...connection, ...deprecated]);
    const remaining = visibleNames.filter((name) => !grouped.has(name));
    if (remaining.length > 0) {
      groups.push({ properties: remaining });
    }
  } else if (
    objectId === 'root/authenticationConfiguration/oidcConfiguration'
  ) {
    groups.push({ title: 'OIDC Configuration', properties: [...visibleNames] });
  } else if (
    objectId === 'root/authenticationConfiguration/ldapConfiguration' ||
    objectId === 'root/authenticationConfiguration/samlConfiguration'
  ) {
    groups.push({ properties: [...visibleNames] });
  } else {
    groups.push({ properties: [...visibleNames] });
  }

  return groups.filter((group) => group.properties.length > 0);
}

/** Splits one object's property names into advanced vs normal, in order. */
export function splitSsoAdvancedProperties(names: string[]): {
  advancedProperties: string[];
  normalProperties: string[];
} {
  const advancedProperties: string[] = [];
  const normalProperties: string[] = [];
  for (const name of names) {
    if (SSO_ADVANCED_PROPERTIES.includes(name)) {
      advancedProperties.push(name);
    } else {
      normalProperties.push(name);
    }
  }
  return { advancedProperties, normalProperties };
}

export function isSsoDeprecatedProperty(
  schema: SsoJsonSchema,
  propertyName: string,
): boolean {
  return (
    schema.deprecated === true || SSO_DEPRECATED_PROPERTIES.includes(propertyName)
  );
}

export type SsoWidgetKind =
  | 'hidden'
  | 'password'
  | 'textarea'
  | 'radio'
  | 'select'
  | 'checkbox'
  | 'number'
  | 'text'
  | 'array'
  | 'roles-select'
  | 'ldap-role-mapping'
  | 'object';

/**
 * Widget selection: `ui:widget`/`ui:field` win over schema shape, then schema
 * type/enum/format. `useNonce` (string type, title-only entry) resolves to
 * `text`, not a checkbox.
 */
export function resolveSsoWidgetKind(
  entry: SsoUiSchemaEntry | undefined,
  schema: SsoJsonSchema,
): SsoWidgetKind {
  if (entry?.['ui:widget'] === 'hidden') {
    return 'hidden';
  }
  if (entry?.['ui:field'] === 'ArrayField') {
    return 'array';
  }
  if (entry?.['ui:field'] === 'RolesSelectField') {
    return 'roles-select';
  }
  if (entry?.['ui:widget'] === 'LdapRoleMappingWidget') {
    return 'ldap-role-mapping';
  }
  if (entry?.['ui:widget'] === 'password') {
    return 'password';
  }
  if (entry?.['ui:widget'] === 'textarea') {
    return 'textarea';
  }
  if (entry?.['ui:widget'] === 'radio') {
    return 'radio';
  }
  if (schema.type === 'object') {
    return 'object';
  }
  if (schema.type === 'array') {
    return 'array';
  }
  if (schema.type === 'boolean') {
    return 'checkbox';
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  }
  if (schema.enum) {
    return 'select';
  }
  if (schema.format === 'password') {
    return 'password';
  }
  return 'text';
}

/**
 * Field label. Array fields ignore titles: the label is `startCase` of the
 * leaf name in English; in Chinese the field's title translation is used
 * when one exists, else the English startCase label. Other fields resolve
 * `ui:title` > schema `title` > raw property name.
 */
export function resolveSsoFieldLabel(args: {
  entry: SsoUiSchemaEntry | undefined;
  schema: SsoJsonSchema;
  propertyName: string;
  isArrayField: boolean;
  locale: string;
  brandName: string;
}): string {
  const { entry, schema, propertyName, isArrayField, locale, brandName } = args;
  const titleCandidate = entry?.['ui:title'] ?? schema.title;
  if (isArrayField) {
    if (
      locale === 'zh-CN' &&
      titleCandidate &&
      titleCandidate in SSO_FIELD_TEXT_ZH
    ) {
      return resolveSsoFieldText(titleCandidate, locale, brandName);
    }
    return startCase(propertyName);
  }
  const label = titleCandidate ?? propertyName;
  return resolveSsoFieldText(label, locale, brandName);
}

/**
 * Object title: `ui:title` > schema `title`; blank/whitespace titles render
 * nothing (the two section roots carry `' '` for exactly this reason).
 */
export function resolveSsoObjectTitle(
  entry: SsoUiSchemaEntry | undefined,
  schema: SsoJsonSchema,
): string | undefined {
  const title = entry?.['ui:title'] ?? schema.title;
  return title && title.trim() !== '' ? title : undefined;
}
