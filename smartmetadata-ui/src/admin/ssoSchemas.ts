/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import authSchemaJson from './sso/authenticationConfiguration.schema.json';
import authorizerSchemaJson from './sso/authorizerConfiguration.schema.json';
import { SSO_NON_OIDC_SPECIFIC_FIELDS, SSO_OIDC_SPECIFIC_FIELDS } from './ssoProviders';

/**
 * The two pin JSON schemas, copied verbatim, plus the provider surgery and
 * the `getDefaultFormState` port pin `normalizeFormData` relies on.
 *
 * The normalize boundary is ported from the exact dependency pin uses,
 * `@rjsf/utils@5.24.13` (`getDefaultFormState.ts`, `mergeDefaultsWithFormData.ts`,
 * per the pin `yarn.lock`), not from memory:
 * - `allOf` is ignored for defaults (only honored under an experimental flag
 *   pin never sets), so conditional `required` never fills anything.
 * - A missing object is created when its computed defaults are non-empty, or
 *   when its key is in the parent's (raw) `required` list — even when empty.
 * - A missing array becomes `[]`, even when its schema default is `null`.
 * - A missing leaf takes the schema `default`, verbatim, whatever its type
 *   (`useNonce` fills boolean `true` although its schema type is `string`).
 * - `null` passes through everywhere; only `undefined`/absent triggers filling.
 * - A present scalar outside its schema `enum` is replaced by the schema
 *   default when one exists, and kept otherwise.
 * - Keys outside the schema pass through at every level (V-SSO-1).
 * - Required-ness never creates a missing leaf.
 */

export interface SsoJsonSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, SsoJsonSchema>;
  items?: SsoJsonSchema;
  required?: string[];
  additionalProperties?: boolean | SsoJsonSchema;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  deprecated?: boolean;
  allOf?: SsoJsonSchema[];
  [key: string]: unknown;
}

export type SsoSectionData = Record<string, unknown>;

export interface SsoFormData {
  authenticationConfiguration: SsoSectionData;
  authorizerConfiguration: SsoSectionData;
  [key: string]: unknown;
}

export const SSO_AUTH_SCHEMA = authSchemaJson as unknown as SsoJsonSchema;
export const SSO_AUTHORIZER_SCHEMA = authorizerSchemaJson as unknown as SsoJsonSchema;

/** Removes named fields from a schema's `properties` (pin `removeSchemaFields`). */
export function removeSsoSchemaFields(
  schema: SsoJsonSchema,
  fieldsToRemove: readonly string[],
): void {
  if (!schema.properties || typeof schema.properties !== 'object') {
    return;
  }
  for (const field of fieldsToRemove) {
    if (schema.properties[field]) {
      delete schema.properties[field];
    }
  }
}

/** Removes named fields from a schema's `required` array (pin `removeRequiredFields`). */
export function removeSsoRequiredFields(
  schema: SsoJsonSchema,
  fieldsToRemove: readonly string[],
): void {
  if (!schema.required || !Array.isArray(schema.required)) {
    return;
  }
  schema.required = schema.required.filter((field) => !fieldsToRemove.includes(field));
}

/**
 * The combined two-section schema for one provider (pin `getProviderSpecificSchema`).
 * The auth schema is deep-cloned before surgery; the authorizer schema is used
 * as-is. With no provider the original auth schema is returned untouched.
 */
export function getSsoProviderSchema(
  provider: string | undefined,
  isConfigured = false,
): SsoJsonSchema {
  const wrap = (authSchema: SsoJsonSchema): SsoJsonSchema => ({
    properties: {
      authenticationConfiguration: authSchema,
      authorizerConfiguration: SSO_AUTHORIZER_SCHEMA,
    },
  });

  if (!provider) {
    return wrap(SSO_AUTH_SCHEMA);
  }

  const authSchema = structuredClone(SSO_AUTH_SCHEMA);

  if (isConfigured) {
    removeSsoRequiredFields(authSchema, ['providerName']);
  }

  if (provider === 'saml' || provider === 'ldap') {
    removeSsoSchemaFields(authSchema, SSO_OIDC_SPECIFIC_FIELDS);
    removeSsoRequiredFields(authSchema, SSO_OIDC_SPECIFIC_FIELDS);
  } else if (provider === 'custom-oidc') {
    removeSsoSchemaFields(authSchema, SSO_NON_OIDC_SPECIFIC_FIELDS);
    removeSsoRequiredFields(authSchema, SSO_NON_OIDC_SPECIFIC_FIELDS);
  }

  return wrap(authSchema);
}

function cloneDefault(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ssoSchemaType(schema: SsoJsonSchema): string | undefined {
  if (schema.type) {
    return schema.type;
  }
  if (schema.properties) {
    return 'object';
  }
  if (schema.items) {
    return 'array';
  }
  return undefined;
}

/**
 * Whether a computed default for `key` is stored in its parent object (pin
 * `maybeAddDefaultToObject` under the default behavior): objects only when
 * non-empty or required, anything else whenever defined.
 */
function shouldStoreDefault(
  computed: unknown,
  key: string,
  required: readonly string[] | undefined,
): boolean {
  if (computed === undefined) {
    return false;
  }
  if (isPlainObject(computed)) {
    return Object.keys(computed).length > 0 || (required ?? []).includes(key);
  }
  return true;
}

/** Computes the default subtree for a node whose value is missing entirely. */
function fillMissingSsoValue(schema: SsoJsonSchema): unknown {
  if (schema.default !== undefined && ssoSchemaType(schema) !== 'array') {
    return cloneDefault(schema.default);
  }
  if (ssoSchemaType(schema) === 'array') {
    // A non-empty array default is kept (items pass through unchanged for
    // SSO's string items); an empty or null default yields `[]`.
    if (Array.isArray(schema.default) && schema.default.length > 0) {
      return cloneDefault(schema.default);
    }
    return [];
  }
  if (ssoSchemaType(schema) === 'object') {
    const filled: Record<string, unknown> = {};
    const required = schema.required;
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      const child = fillMissingSsoValue(propertySchema);
      if (shouldStoreDefault(child, key, required)) {
        filled[key] = child;
      }
    }
    return filled;
  }
  return schema.default !== undefined ? cloneDefault(schema.default) : undefined;
}

/**
 * Normalizes one present value against its schema: objects merge filled
 * defaults under present keys (schema order first, extra keys pass through),
 * arrays recurse per item, leaves apply the enum rule.
 */
function normalizePresentSsoValue(schema: SsoJsonSchema, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const type = ssoSchemaType(schema);
  if (type === 'object') {
    if (!isPlainObject(value)) {
      return value;
    }
    const normalized: Record<string, unknown> = {};
    const required = schema.required;
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      const childValue = value[key];
      if (childValue === undefined) {
        const filled = fillMissingSsoValue(propertySchema);
        if (shouldStoreDefault(filled, key, required)) {
          normalized[key] = filled;
        }
      } else {
        normalized[key] = normalizePresentSsoValue(propertySchema, childValue);
      }
    }
    for (const [key, childValue] of Object.entries(value)) {
      if (!(key in (schema.properties ?? {}))) {
        normalized[key] = childValue;
      }
    }
    return normalized;
  }
  if (type === 'array') {
    if (!Array.isArray(value)) {
      return value;
    }
    const itemSchema = schema.items;
    if (!itemSchema) {
      return [...value];
    }
    return value.map((item) => normalizePresentSsoValue(itemSchema, item));
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((option) => option === value)
  ) {
    return schema.default !== undefined ? cloneDefault(schema.default) : value;
  }
  return value;
}

/**
 * Fills schema defaults into `data` without mutating it (pin `normalizeFormData`
 * = RJSF `getDefaultFormState`). `undefined` input yields the full default
 * tree, exactly as the RJSF call does.
 */
export function normalizeSsoFormData(
  schema: SsoJsonSchema,
  data: unknown,
): unknown {
  if (data === undefined) {
    return fillMissingSsoValue(schema);
  }
  return normalizePresentSsoValue(schema, data);
}
