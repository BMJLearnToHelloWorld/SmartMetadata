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
 * The OIDC client-secret rules (Q1(a) revised, ADR
 * `2026-11-18-sso-candidate-secret-mapping.md`).
 *
 * This module holds only the secret decision layer: whether a typed secret
 * may be carried, whether the stored document can accept a secret op, what
 * an empty secret means, and when a save must be refused visibly instead of
 * sending a patch the server would silently drop. It deliberately does NOT
 * build candidates: candidate construction is the pin-ported `buildPayload`
 * + `cleanupSsoProviderFields` pipeline in `useSsoConfiguration`, and a
 * second candidate builder here would let the two disagree about what was
 * tested versus what was saved. The sections batch deleted the former
 * `ssoConfiguration.ts` wholesale and this layer with it; this file restores
 * the secret predicates, adapted to the new shape (the secret now lives in
 * the form data at `oidcConfiguration.secret`, not in a separate form field).
 *
 * The pin has no counterpart to any of this: pin `saveExistingConfiguration`
 * (`useSsoConfiguration.ts:801-829`) diffs and patches unconditionally, and
 * pin `SystemRepository.filterInvalidPatchOperations` silently drops the
 * secret op when the stored provider is not OIDC. The guard below exists
 * precisely because that drop is silent.
 */

/**
 * The minimal document shape the secret rules read: the authentication
 * section's provider, client type, and OIDC block. Both `SsoFormData` and
 * `SecurityConfigurationDocument` satisfy it.
 */
export interface SsoSecretDocument {
  authenticationConfiguration?: {
    provider?: unknown;
    clientType?: unknown;
    oidcConfiguration?: unknown;
    [key: string]: unknown;
  };
}

function readAuthenticationConfiguration(
  document: SsoSecretDocument | undefined,
): SsoSecretDocument['authenticationConfiguration'] {
  return document?.authenticationConfiguration;
}

function readOidcConfiguration(
  document: SsoSecretDocument | undefined,
): Record<string, unknown> | undefined {
  const block = readAuthenticationConfiguration(document)?.oidcConfiguration;
  if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
    return block as Record<string, unknown>;
  }
  return undefined;
}

function readOidcSecret(document: SsoSecretDocument | undefined): unknown {
  return readOidcConfiguration(document)?.secret;
}

/**
 * The providers that never carry an OIDC secret, by the pin's routing
 * exclusion: every other provider value counts as OIDC on the effective
 * side. The same four values gate the browser test-login route in
 * `ssoTestLogin.ts`; the two lists state one pin definition and must move
 * together.
 */
const NON_OIDC_PROVIDERS: readonly string[] = ['basic', 'ldap', 'openmetadata', 'saml'];

/**
 * Whether a typed secret belongs in the candidate for this provider and
 * client type: the effective side of the secret ruling. Only these two
 * dimensions are judged here; an empty secret and a managed secret are
 * the call sites' to handle, and the stored side is
 * storedAcceptsOidcSecret's. The save guard and the op gate share this one
 * function so they can never disagree about what carries.
 * ADR:2026-11-18-sso-candidate-secret-mapping.
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
 * SystemRepository.java:1916-1925): the lowercased provider contains
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
export function storedAcceptsOidcSecret(saved: SsoSecretDocument): boolean {
  const auth = readAuthenticationConfiguration(saved);
  const block = auth?.oidcConfiguration;
  return (
    isStoredOidcProvider(auth?.provider) &&
    block !== null &&
    typeof block === 'object' &&
    !Array.isArray(block)
  );
}

/**
 * Map an emptied secret back onto "keep the stored value" in the PATCH
 * candidate (Q1(a) rule (a), "empty sends no op", in the new
 * diff-then-patch shape). An empty secret is never a value to store: the
 * server only restores masked secrets, so sending `''` would clear the
 * stored secret (`api/system.ts`, `patchSecurityConfiguration` note).
 *
 * - Stored secret is a non-empty string (the usual masked value): pin the
 *   candidate back to it, so `compare` emits no secret op.
 * - Stored secret is exactly `''`: leave the candidate alone — there is
 *   no diff to preserve.
 * - Stored document has no secret key: drop the key from the candidate
 *   block, so `compare` emits no `add .../secret ''` op.
 * - Any other candidate state (no block, non-empty secret): untouched.
 *
 * Returns a new candidate object when it changes anything; otherwise the
 * input candidate, unmodified. Never mutates either input. Only the PATCH
 * path calls this; the PUT path for a new configuration keeps pin's fresh
 * `secret: ''` default untouched.
 * ADR:2026-11-18-sso-candidate-secret-mapping.
 */
export function restoreEmptyOidcSecret<T extends SsoSecretDocument>(
  candidate: T,
  saved: SsoSecretDocument,
): T {
  const auth = readAuthenticationConfiguration(candidate);
  const block = readOidcConfiguration(candidate);
  if (!auth || !block || block.secret !== '') {
    return candidate;
  }
  const savedSecret = readOidcSecret(saved);
  if (typeof savedSecret === 'string' && savedSecret !== '') {
    return {
      ...candidate,
      authenticationConfiguration: {
        ...auth,
        oidcConfiguration: { ...block, secret: savedSecret },
      },
    };
  }
  if (savedSecret === '') {
    return candidate;
  }
  if (savedSecret === undefined) {
    const { secret: _dropped, ...blockWithoutSecret } = block;
    return {
      ...candidate,
      authenticationConfiguration: {
        ...auth,
        oidcConfiguration: blockWithoutSecret,
      },
    };
  }
  return candidate;
}

/**
 * The save guard (d): a typed secret the PATCH cannot carry must never
 * save silently under the stored secret while Test Login proved the new
 * one. "Typed" means the form's secret is a non-empty string different
 * from the stored secret (an untouched field still holds the stored
 * masked value; a cleared field is empty, not typed). Evaluated on the
 * cleaned form data — before managed pinning, as DESIGN Q1(a)(d) defines
 * the guard on the form secret — so a managed secret that is typed while
 * the stored conditions fail is refused exactly as the old guard refused
 * it. When this returns true the caller must not send the PATCH and must
 * show `t('sso.secretSaveBlocked')` visibly; clearing the secret saves
 * the other changes.
 * ADR:2026-11-18-sso-candidate-secret-mapping.
 */
export function isOidcSecretSaveBlocked(
  candidate: SsoSecretDocument,
  saved: SsoSecretDocument,
): boolean {
  const secret = readOidcSecret(candidate);
  if (typeof secret !== 'string' || secret === '') {
    return false;
  }
  if (secret === readOidcSecret(saved)) {
    return false;
  }
  const auth = readAuthenticationConfiguration(candidate);
  return (
    carriesOidcSecret(auth?.provider, auth?.clientType) &&
    !storedAcceptsOidcSecret(saved)
  );
}
