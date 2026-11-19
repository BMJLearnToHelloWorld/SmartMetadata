/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  SecurityConfigurationDocument,
  TestLoginResult,
  TestLoginStage,
  TestLoginStageStatus,
} from '@/api/system';

/**
 * Edits that cannot change who signs in, or whether they can. Saving an
 * edit that touches only these skips the Test Login gate; any other
 * change requires a passing test first. Verbatim from the pin's
 * SsoTestLogin.utils SAFE_EDIT_PATHS.
 */
export const SAFE_EDIT_PATHS: readonly string[] = [
  'authenticationConfiguration.enableSelfSignup',
  'authenticationConfiguration.sessionExpiry',
  'authenticationConfiguration.maxActiveSessionsPerUser',
  'authenticationConfiguration.forceSecureSessionCookie',
  'authenticationConfiguration.displayNameClaim',
  'authenticationConfiguration.jwtTeamClaimMapping',
  'authenticationConfiguration.oidcConfiguration.tokenValidity',
  'authenticationConfiguration.oidcConfiguration.sessionExpiry',
  'authenticationConfiguration.oidcConfiguration.maxClockSkew',
  'authenticationConfiguration.samlConfiguration.security.tokenValidity',
  'authorizerConfiguration.botPrincipals',
  'authorizerConfiguration.testPrincipals',
  'authorizerConfiguration.defaultOAuthRole',
  'authorizerConfiguration.allowedEmailRegistrationDomains',
];

/**
 * Providers that never sign in through OIDC (the complement of the
 * server's OIDC set, mirroring SystemRepository.isOidcProvider: pin
 * a3012259ca, SystemRepository.java:1916-1925). Only isBrowserTestLogin
 * below reads this list; the twin in ssoConfiguration.ts
 * (carriesOidcSecret) states the same four values for the secret rules,
 * and the two lists must move together.
 */
const NON_OIDC_PROVIDERS: readonly string[] = ['basic', 'ldap', 'openmetadata', 'saml'];

/**
 * The providers whose live logins run through vendor SDKs that always use
 * the authorization code flow with PKCE. The test popup must do the
 * same, or it would fail (or pass) for a different reason than the real
 * login would.
 */
export const CODE_FLOW_PROVIDERS: readonly string[] = ['okta', 'auth0', 'azure'];

/** The scope the live login requests, reused verbatim by the test popup. */
export const TEST_LOGIN_OIDC_SCOPE = 'openid email profile';

export const TEST_LOGIN_POPUP_NAME = 'omSsoTestLogin';
export const TEST_LOGIN_POPUP_FEATURES = 'width=520,height=680';

/** Poll interval and overall deadline for a server-driven Test Login round-trip. */
export const TEST_LOGIN_POLL_MS = 2000;
export const TEST_LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export type ConnectionStepState = 'queued' | 'running' | 'passed' | 'failed' | 'skipped';

const STEP_STATE_BY_STAGE_STATUS: Record<TestLoginStageStatus, ConnectionStepState> = {
  pending: 'queued',
  running: 'running',
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
};

export const STAGE_LABEL_KEYS: Record<TestLoginStage, string> = {
  STARTED: 'sso.testLogin.stages.started',
  REDIRECTED: 'sso.testLogin.stages.redirected',
  TOKEN_RECEIVED: 'sso.testLogin.stages.tokenReceived',
  TOKEN_VALIDATED: 'sso.testLogin.stages.tokenValidated',
  TOKEN_REFRESHED: 'sso.testLogin.stages.tokenRefreshed',
  CREDENTIALS_VERIFIED: 'sso.testLogin.stages.credentialsVerified',
  CLAIMS_EXTRACTED: 'sso.testLogin.stages.claimsExtracted',
  IDENTITY_RESOLVED: 'sso.testLogin.stages.identityResolved',
  ROLES_MAPPED: 'sso.testLogin.stages.rolesMapped',
  DOMAIN_CHECKED: 'sso.testLogin.stages.domainChecked',
};

/** The candidate the public-client popup signs in with, matching what the live login requests. */
export interface TestLoginPopupCandidate {
  authority?: string;
  clientId?: string;
  callbackUrl?: string;
  responseType?: string;
  scope?: string;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function popupCandidateFor(candidate: SecurityConfigurationDocument): TestLoginPopupCandidate {
  const auth = candidate.authenticationConfiguration;
  const provider = stringOrUndefined(auth.provider);
  const responseType = CODE_FLOW_PROVIDERS.includes(provider ?? '')
    ? 'code'
    : (stringOrUndefined(auth.responseType) ?? 'id_token');
  return {
    authority: stringOrUndefined(auth.authority),
    clientId: stringOrUndefined(auth.clientId),
    callbackUrl: stringOrUndefined(auth.callbackUrl),
    responseType,
    scope: TEST_LOGIN_OIDC_SCOPE,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The form writes cleared fields as '', [] or null where the saved config has none at all. */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Recursive deep equality: object keys unordered, array order
 * significant. JSON.stringify comparison would read a key-order change
 * as an edit and gate a save that changed nothing.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) {
      return false;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}

/**
 * Every leaf path whose value differs between two configurations,
 * including the leaves of objects that were added or removed outright.
 */
export function getChangedPaths(before: unknown, after: unknown, path = ''): string[] {
  if (isRecord(before) || isRecord(after)) {
    const beforeFields = isRecord(before) ? before : {};
    const afterFields = isRecord(after) ? after : {};
    const keys = [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])];
    return keys.flatMap((key) =>
      getChangedPaths(beforeFields[key], afterFields[key], path ? `${path}.${key}` : key),
    );
  }
  const isUnchanged = (isBlank(before) && isBlank(after)) || deepEqual(before, after);
  return isUnchanged ? [] : [path];
}

export function isSafeEditPath(path: string): boolean {
  return SAFE_EDIT_PATHS.some((safePath) => path === safePath || path.startsWith(`${safePath}.`));
}

/**
 * Whether saving the candidate must first be proven by a passing Test
 * Login. A new configuration always must. An edit must unless every
 * field it changes is known to be safe — deliberately failing closed,
 * so a field nobody thought to classify is still tested rather than
 * waved through.
 */
export function requiresTestLogin(saved: unknown, candidate: unknown): boolean {
  return !saved || getChangedPaths(saved, candidate).some((path) => !isSafeEditPath(path));
}

/**
 * Public-client OIDC signs in in the browser, so its test does too.
 * Every other provider signs in on the server, so the server drives its
 * test. An empty clientType reads as missing, which routes to the
 * browser like the pin's undefined.
 */
export function isBrowserTestLogin(provider?: string, clientType?: string): boolean {
  const normalizedClientType = clientType === '' ? undefined : clientType;
  return (
    !!provider && !NON_OIDC_PROVIDERS.includes(provider) && normalizedClientType !== 'confidential'
  );
}

/**
 * Maps a stage outcome onto the connection step states, so both
 * timelines render alike. Once a test has settled, a stage it never
 * reached did not run — showing it as queued would suggest the test is
 * still waiting on it.
 */
export function toConnectionStepState(
  status: TestLoginStageStatus,
  isSettled: boolean,
): ConnectionStepState {
  return isSettled && status === 'pending' ? 'skipped' : STEP_STATE_BY_STAGE_STATUS[status];
}

export function isTestLoginSettled(result?: TestLoginResult): boolean {
  return !!result && result.status !== 'pending';
}
