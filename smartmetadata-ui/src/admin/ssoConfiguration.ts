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
  SecurityFieldError,
} from '@/api/system';

/**
 * The SSO form fields a validation error path can name. Only paths with a
 * control on the form map here; every other path goes to the problems
 * list, so no error is ever dropped for want of a control.
 */
export const FIELD_ERROR_PATH_MAP: Readonly<Record<string, string>> = {
  'authenticationConfiguration.provider': 'provider',
  'authenticationConfiguration.providerName': 'providerName',
  'authenticationConfiguration.clientType': 'clientType',
  'authenticationConfiguration.authority': 'authority',
  'authenticationConfiguration.clientId': 'clientId',
  'authenticationConfiguration.callbackUrl': 'callbackUrl',
  'authenticationConfiguration.enableSelfSignup': 'enableSelfSignup',
};

/** Form controls in DOM order, for scrolling to the first error. */
export const FORM_FIELD_ORDER: readonly string[] = [
  'provider',
  'providerName',
  'clientType',
  'authority',
  'clientId',
  'clientSecret',
  'callbackUrl',
  'enableSelfSignup',
];

/**
 * Split validation errors into per-field errors and the problems list.
 * A later error for the same field overwrites the earlier one, matching
 * the pin's parseValidationErrors; problems are never deduplicated, so
 * the list shows exactly what the server reported.
 * ADR:2026-11-18-sso-unmapped-validation-errors-stay-visible.
 */
export function applySecurityFieldErrors(errors: SecurityFieldError[]): {
  fieldErrors: Record<string, string>;
  problems: string[];
} {
  const fieldErrors: Record<string, string> = {};
  const problems: string[] = [];
  for (const { field, error } of errors) {
    const key = FIELD_ERROR_PATH_MAP[field];
    if (key) {
      fieldErrors[key] = error;
    } else {
      problems.push(field ? `${field}: ${error}` : error);
    }
  }
  return { fieldErrors, problems };
}

/** Drop one field's error, as when the admin edits that field. */
export function clearFieldErrorForKey(
  fieldErrors: Record<string, string>,
  key: string,
): void {
  delete fieldErrors[key];
}

/**
 * The first control to scroll to: the earliest field in form order that
 * carries an error, or 'problems' when only the problems list has
 * entries. The problems list is an input because the fallback depends on
 * whether it is non-empty, which the field errors alone cannot say.
 */
export function firstErrorControlKey(
  fieldErrors: Record<string, string>,
  problems: readonly string[],
  formOrder: readonly string[],
): string | undefined {
  for (const key of formOrder) {
    if (fieldErrors[key]) {
      return key;
    }
  }
  return problems.length > 0 ? 'problems' : undefined;
}

/** The SSO form values the candidate builder overlays onto the stored document. */
export interface SsoFormValues {
  provider?: string;
  providerName?: string;
  clientType?: string;
  authority?: string;
  clientId?: string;
  callbackUrl?: string;
  enableSelfSignup?: boolean;
}

/** Deployment-ownership info for the authenticationConfiguration setting. */
export interface ManagedInfo {
  authenticationEditable: boolean;
  authenticationManagedPaths: string[];
}

function cloneJsonDocument(
  document: SecurityConfigurationDocument,
): SecurityConfigurationDocument {
  // JSON round trip, never structuredClone: the stored document lives in
  // a reactive ref, and structuredClone rejects reactive proxies.
  return JSON.parse(JSON.stringify(document)) as SecurityConfigurationDocument;
}

function cloneJsonValue(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function pointerSegments(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function valueAtPath(root: unknown, segments: string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function setValueAtPath(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let current: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const next = current[segments[i]];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      current[segments[i]] = {};
    }
    current = current[segments[i]] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

function deleteValueAtPath(root: Record<string, unknown>, segments: string[]): void {
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (current === null || typeof current !== 'object') {
      return;
    }
    current = (current as Record<string, unknown>)[segments[i]];
  }
  if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
    delete (current as Record<string, unknown>)[segments[segments.length - 1]];
  }
}

/**
 * Pin one deployment-owned field of the candidate back to its stored
 * value, following the section-relative JSON pointer: a managed field
 * the form cannot edit must reach the server exactly as stored, or the
 * write is refused. A pointer naming nothing stored removes the field,
 * so a diff against the stored document never touches it.
 */
function pinManagedPath(
  candidateAuth: Record<string, unknown>,
  rawAuth: Record<string, unknown>,
  pointer: string,
): void {
  const segments = pointerSegments(pointer);
  if (segments.length === 0) {
    const pinned = cloneJsonValue(rawAuth) as Record<string, unknown>;
    for (const key of Object.keys(candidateAuth)) {
      delete candidateAuth[key];
    }
    Object.assign(candidateAuth, pinned);
    return;
  }
  const savedValue = valueAtPath(rawAuth, segments);
  if (savedValue === undefined) {
    deleteValueAtPath(candidateAuth, segments);
  } else {
    setValueAtPath(candidateAuth, segments, cloneJsonValue(savedValue));
  }
}

/**
 * The providers that never carry an OIDC secret, by the pin's routing
 * exclusion: every other provider value counts as OIDC on the effective
 * side. The same four values gate the browser test-login route in
 * ssoTestLogin.ts; the two lists state one pin definition and must move
 * together.
 */
const NON_OIDC_PROVIDERS: readonly string[] = ['basic', 'ldap', 'openmetadata', 'saml'];

/**
 * Whether a typed secret belongs in the candidate for this provider and
 * client type: the effective side of the secret ruling. Only these two
 * dimensions are judged here; an empty secret and a managed secret are
 * the call sites' to handle, and the stored side is
 * storedAcceptsOidcSecret's. The candidate builder and the save gate
 * share this one function so they can never disagree about what
 * carries. ADR:2026-11-18-sso-candidate-secret-mapping.
 */
export function carriesOidcSecret(provider: unknown, clientType: unknown): boolean {
  return (
    typeof provider === 'string' &&
    provider !== '' &&
    !NON_OIDC_PROVIDERS.includes(provider) &&
    clientType === 'confidential'
  );
}

/**
 * The providers the server counts as OIDC, mirroring
 * SystemRepository.isOidcProvider (pin a3012259ca,
 * SystemRepository.java:1967-1976): the lowercased provider contains
 * "oidc", or equals one of these, case-insensitively. custom-oidc is
 * redundant — it contains "oidc" — and is listed because the server
 * lists it. This positive definition is deliberately not the UI's
 * reverse exclusion table: an unknown stored value must fail closed
 * here, because the server's patch filter judges by the stored provider
 * and silently drops the secret op otherwise.
 */
const OIDC_PROVIDERS: readonly string[] = [
  'google',
  'azure',
  'okta',
  'auth0',
  'aws-cognito',
  'custom-oidc',
];

function isStoredOidcProvider(provider: unknown): boolean {
  if (typeof provider !== 'string') {
    return false;
  }
  const normalized = provider.toLowerCase();
  return normalized.includes('oidc') || OIDC_PROVIDERS.includes(normalized);
}

/**
 * Whether the stored document can accept the leaf secret op: the stored
 * provider is OIDC by the server's definition, and the stored document
 * already carries an oidcConfiguration block for the op to land in —
 * the block must be an object, because a JSON Patch leaf add requires
 * an existing parent object and fails without one. Only the save side
 * evaluates this; the candidate builder never takes the stored
 * conditions. ADR:2026-11-18-sso-candidate-secret-mapping.
 */
export function storedAcceptsOidcSecret(raw: SecurityConfigurationDocument): boolean {
  const auth = raw.authenticationConfiguration;
  const block = auth.oidcConfiguration;
  return (
    isStoredOidcProvider(auth.provider) &&
    block !== null &&
    typeof block === 'object' &&
    !Array.isArray(block)
  );
}

/**
 * Map the typed secret onto the candidate's oidcConfiguration.secret.
 * An empty secret leaves the candidate alone, so the stored value rides
 * along untouched; a secret only lands for an OIDC provider with a
 * confidential client, and a missing block is created holding nothing
 * but the typed secret — never synthesized siblings. A managed secret
 * is pinned back to the stored value by the step after this one, so
 * this function never sees deployment ownership.
 * ADR:2026-11-18-sso-candidate-secret-mapping.
 */
function applyEnteredSecret(
  candidate: SecurityConfigurationDocument,
  secret: string,
): SecurityConfigurationDocument {
  if (!secret) {
    return candidate;
  }
  const auth = candidate.authenticationConfiguration;
  if (!carriesOidcSecret(auth.provider, auth.clientType)) {
    return candidate;
  }
  const block = auth.oidcConfiguration;
  if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
    (block as Record<string, unknown>).secret = secret;
  } else {
    auth.oidcConfiguration = { secret };
  }
  return candidate;
}

const OVERLAY_KEYS: readonly (keyof SsoFormValues)[] = [
  'provider',
  'clientType',
  'authority',
  'clientId',
  'callbackUrl',
  'enableSelfSignup',
];

/**
 * The one candidate builder shared by validate, Test Login, and the save
 * gate: the stored document, deep-copied, with the form's fields overlaid
 * and deployment-owned fields pinned back. Fields the form never shows
 * ride along untouched, because the server checks and the secret
 * restore both read the whole document. The stored document is never
 * mutated. No provider-specific cleanup and no schema defaults are
 * applied here; those belong to the field-group batch that owns the
 * controls. ADR:2026-11-18-sso-candidate-preserves-full-security-document.
 */
export function buildCandidateConfiguration(
  raw: SecurityConfigurationDocument,
  form: SsoFormValues,
  managed: ManagedInfo,
  secret: string,
): SecurityConfigurationDocument {
  if (!managed.authenticationEditable) {
    return cloneJsonDocument(raw);
  }
  const candidate = cloneJsonDocument(raw);
  const auth = candidate.authenticationConfiguration;
  for (const key of OVERLAY_KEYS) {
    const value = form[key];
    if (value === undefined || value === '') {
      delete auth[key];
    } else {
      auth[key] = value;
    }
  }
  // providerName only exists for custom OIDC; for every other provider
  // the stored value rides along untouched.
  if (form.provider === 'custom-oidc') {
    if (form.providerName === undefined || form.providerName === '') {
      delete auth.providerName;
    } else {
      auth.providerName = form.providerName;
    }
  }
  const withSecret = applyEnteredSecret(candidate, secret);
  for (const pointer of managed.authenticationManagedPaths) {
    pinManagedPath(
      withSecret.authenticationConfiguration,
      raw.authenticationConfiguration,
      pointer,
    );
  }
  return withSecret;
}
