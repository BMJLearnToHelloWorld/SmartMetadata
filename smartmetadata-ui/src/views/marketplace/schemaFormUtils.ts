/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonSchema } from './appAssets';

/**
 * Pure logic for the scoped schema form (AppSchemaForm). The reachable
 * surface is bounded by the 10 bundled application schemas, verified
 * 2026-11-18: no $ref/oneOf/anyOf/allOf/const anywhere; arrays hold
 * strings only; every enum array is a treeSelect; exactly one
 * schema-valued additionalProperties (DataRetention `extensions`).
 * AnyOf/OneOf/LayoutGrid fields are therefore unreachable and are not
 * rendered; the boundary is reported, not silently shrunk.
 */

/** Lodash `startCase` approximation for ASCII schema field names. */
export function startCase(value: string): string {
  const words = value.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) ?? [];
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const FORM_LABEL_ACRONYMS: Record<string, string> = {
  api: 'API',
  arn: 'ARN',
  aws: 'AWS',
  dbt: 'dbt',
  gcp: 'GCP',
  gcs: 'GCS',
  iam: 'IAM',
  id: 'ID',
  jdbc: 'JDBC',
  jwt: 'JWT',
  odbc: 'ODBC',
  oidc: 'OIDC',
  s3: 'S3',
  saml: 'SAML',
  sql: 'SQL',
  ssh: 'SSH',
  ssl: 'SSL',
  uri: 'URI',
  url: 'URL',
};

/** Official getFormDisplayLabel (formBuilderV1LabelUtils.ts). */
export function getFormDisplayLabel(value: string): string {
  const tokens = startCase(value).split(' ');
  const merged = tokens.reduce<string[]>((acc, token) => {
    const previous = acc[acc.length - 1];
    if (previous && /^[0-9]+$/.test(token) && /^[A-Z]{1,3}$/.test(previous)) {
      acc[acc.length - 1] = `${previous}${token}`;
      return acc;
    }
    acc.push(token);
    return acc;
  }, []);
  return merged
    .map((token) => FORM_LABEL_ACRONYMS[token.toLowerCase()] ?? token)
    .join(' ')
    .replace(/\bO Auth\b/g, 'OAuth')
    .replace(/\bOauth\b/g, 'OAuth');
}

export const ALL_VALUE = 'all';

/**
 * Official getNextEnumSelection (CoreEnumMultiSelectField.tsx): "All"
 * and specific values are mutually exclusive.
 */
export function getNextEnumSelection(current: string[], inserted: string): string[] {
  return inserted === ALL_VALUE
    ? [ALL_VALUE]
    : [...current.filter((value) => value !== ALL_VALUE), inserted];
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Seeds schema `default` values for keys missing from the data,
 * recursing into objects present in the data. RJSF seeds defaults the
 * same way when computing form state; without this, untouched fields
 * would submit without their schema defaults.
 */
export function seedSchemaDefaults(
  schema: JsonSchema,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const seeded: Record<string, unknown> = { ...data };
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    const current = seeded[key];
    if (current === undefined) {
      if (propSchema.default !== undefined) {
        seeded[key] = cloneValue(propSchema.default);
      }
      continue;
    }
    if (
      propSchema.type === 'object' &&
      propSchema.properties &&
      typeof current === 'object' &&
      current !== null &&
      !Array.isArray(current)
    ) {
      seeded[key] = seedSchemaDefaults(propSchema, current as Record<string, unknown>);
    }
  }
  return seeded;
}

/**
 * RJSF `omitExtraData`: drops keys the schema does not declare, except
 * keys under a schema-valued `additionalProperties` (a free-form map
 * such as DataRetention `extensions`), which are kept.
 */
export function omitExtraData(
  schema: JsonSchema,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const properties = schema.properties ?? {};
  const additional = schema.additionalProperties;
  for (const [key, value] of Object.entries(data)) {
    const propSchema = properties[key];
    if (propSchema) {
      kept[key] =
        propSchema.type === 'object' &&
        propSchema.properties &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
          ? omitExtraData(propSchema, value as Record<string, unknown>)
          : value;
    } else if (additional && typeof additional === 'object') {
      kept[key] = value;
    }
  }
  return kept;
}

export interface SchemaFormError {
  /** Dot path of the field the error attaches to. */
  path: string;
  name: 'required' | 'minimum' | 'maximum';
  /** Missing property name (required) or the limit (minimum/maximum). */
  param: string | number;
}

/**
 * The validation subset pin actually surfaces. `transformErrors`
 * (formPureUtils.ts) rewrites only required/minimum/maximum errors and
 * drops every other kind (enum, pattern, type, minItems, ...), so a
 * fuller validator would show errors pin never shows. Hidden paths
 * never error: their elements are not in the DOM, and pin drops
 * errors whose element is absent.
 */
export function validateSchemaForm(
  schema: JsonSchema,
  data: Record<string, unknown>,
  hiddenPaths: ReadonlySet<string> = new Set(),
  basePath = '',
): SchemaFormError[] {
  const errors: SchemaFormError[] = [];
  const properties = schema.properties ?? {};
  for (const requiredKey of schema.required ?? []) {
    const dotPath = basePath ? `${basePath}.${requiredKey}` : requiredKey;
    if (hiddenPaths.has(dotPath)) {
      continue;
    }
    if (data[requiredKey] === undefined) {
      errors.push({ path: dotPath, name: 'required', param: requiredKey });
    }
  }
  for (const [key, propSchema] of Object.entries(properties)) {
    const dotPath = basePath ? `${basePath}.${key}` : key;
    if (hiddenPaths.has(dotPath)) {
      continue;
    }
    const value = data[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'number') {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push({ path: dotPath, name: 'minimum', param: propSchema.minimum });
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push({ path: dotPath, name: 'maximum', param: propSchema.maximum });
      }
    }
    if (
      propSchema.type === 'object' &&
      propSchema.properties &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      errors.push(
        ...validateSchemaForm(propSchema, value as Record<string, unknown>, hiddenPaths, dotPath),
      );
    }
  }
  return errors;
}

/** RJSF field id with `idSeparator="/"` (FormBuilderV1). */
export function fieldIdForPath(path: string[]): string {
  return `root/${path.join('/')}`;
}

export function dotPathForPath(path: string[]): string {
  return path.join('.');
}

/** Display label for a field: schema title, else the display label of its name. */
export function fieldLabel(schema: JsonSchema, fieldName: string): string {
  return schema.title ?? getFormDisplayLabel(fieldName);
}
