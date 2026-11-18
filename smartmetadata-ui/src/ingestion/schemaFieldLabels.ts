/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FieldFocusMeta } from '@/ingestion/fieldFocus';
import { startCase, type RjsfSchema } from '@/ingestion/ingestionSchemas';

/**
 * Label/description key resolution for the schema-driven sourceConfig
 * form. Product-only: official has no such key mechanism (its form
 * renders schema titles verbatim), so this lives outside the
 * official-port module `ingestionSchemas.ts`.
 *
 * Every export is a pure function; callers inject `t`/`te` (the same
 * injection pattern as `getFilterSectionLabels`). A key prefix of
 * `undefined` means "no keys for this schema" and every resolver falls
 * back to the schema text, so non-metadata schemas render exactly as
 * before.
 */

/** The `t` subset the resolvers need: a key lookup with optional named values. */
export type Translate = (key: string, named?: Record<string, string | number>) => string;
/** The `te` subset the resolvers need: a key-existence check. */
export type Exists = (key: string) => boolean;

export type MetadataSchemaSlug =
  | 'database'
  | 'dashboard'
  | 'api'
  | 'messaging'
  | 'mlmodel'
  | 'pipeline'
  | 'storage'
  | 'search'
  | 'drive';

/** Root-schema `title` → slug. Titles outside this table have no slug. */
export const SCHEMA_SLUG_BY_ROOT_TITLE: Record<string, MetadataSchemaSlug> = {
  DatabaseServiceMetadataPipeline: 'database',
  DashboardServiceMetadataPipeline: 'dashboard',
  ApiServiceMetadataPipeline: 'api',
  MessagingServiceMetadataPipeline: 'messaging',
  MlModelServiceMetadataPipeline: 'mlmodel',
  PipelineServiceMetadataPipeline: 'pipeline',
  StorageServiceMetadataPipeline: 'storage',
  SearchServiceMetadataPipeline: 'search',
  DriveServiceMetadataPipeline: 'drive',
};

export function schemaSlugFor(rootSchema: RjsfSchema): MetadataSchemaSlug | undefined {
  const title = rootSchema.title;
  return title === undefined ? undefined : SCHEMA_SLUG_BY_ROOT_TITLE[title];
}

const SCHEMA_FIELDS_ROOT = 'forms.schemaFields';

/** Key prefix for a top-level field: `forms.schemaFields.<slug>.<fieldName>`. */
export function fieldLabelPrefix(slug: MetadataSchemaSlug, fieldName: string): string {
  return `${SCHEMA_FIELDS_ROOT}.${slug}.${fieldName}`;
}

/** Key prefix for a child field; `undefined` in, `undefined` out. */
export function childLabelPrefix(
  prefix: string | undefined,
  fieldKey: string,
): string | undefined {
  return prefix === undefined ? undefined : `${prefix}.${fieldKey}`;
}

/** Key prefix for the content of branch `i`: `${prefix}.b${i}`. */
export function branchChildPrefix(
  prefix: string | undefined,
  branchIndex: number,
): string | undefined {
  return prefix === undefined ? undefined : `${prefix}.b${branchIndex}`;
}

/** Focus-meta prefix for branch `i`: `${prefix}.branches.b${i}`. */
export function branchFocusKeyPrefix(
  prefix: string | undefined,
  branchIndex: number,
): string | undefined {
  return prefix === undefined ? undefined : `${prefix}.branches.b${branchIndex}`;
}

const ENUM_OPTION_VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Option-display-name key for an enum value; unsafe values yield `undefined`. */
export function enumOptionKey(
  prefix: string | undefined,
  value: string,
): string | undefined {
  if (prefix === undefined || !ENUM_OPTION_VALUE_PATTERN.test(value)) {
    return undefined;
  }
  return `${prefix}.options.${value}`;
}

const BRANCH_TYPE_KEYS: Readonly<Record<string, string>> = {
  string: `${SCHEMA_FIELDS_ROOT}.branchTypes.string`,
  object: `${SCHEMA_FIELDS_ROOT}.branchTypes.object`,
  integer: `${SCHEMA_FIELDS_ROOT}.branchTypes.integer`,
  number: `${SCHEMA_FIELDS_ROOT}.branchTypes.number`,
  boolean: `${SCHEMA_FIELDS_ROOT}.branchTypes.boolean`,
  array: `${SCHEMA_FIELDS_ROOT}.branchTypes.array`,
};

/** The `branchTypes` key for a JSON Schema type, or `undefined` when unkeyed. */
export function branchTypeKey(type: string): string | undefined {
  return BRANCH_TYPE_KEYS[type];
}

// --- official label formatting -------------------------------------------
// Hand-written equivalent of official `getFormDisplayLabel`
// (`formBuilderV1LabelUtils.ts`): lodash `startCase`, letter-number token
// merge, acronym restoration, OAuth spelling collapse. No lodash
// dependency: the product must not add one for this.

const FORM_LABEL_ACRONYMS: Readonly<Record<string, string>> = {
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

/**
 * Split an ASCII label into lodash-`startCase` words: non-alphanumeric
 * separators, camelCase boundaries (including an acronym run before a
 * capitalized word, `XMLHttp` → `XML Http`), and letter/digit
 * boundaries (`S3` → `S 3`). Empty tokens never surface.
 */
function tokenizeLabel(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) {
      tokens.push(current);
      current = '';
    }
  };
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (!/[A-Za-z0-9]/.test(ch)) {
      flush();
      continue;
    }
    if (current) {
      const prev = current[current.length - 1]!;
      const next = value[i + 1];
      const prevIsLower = /[a-z]/.test(prev);
      const prevIsUpper = /[A-Z]/.test(prev);
      const prevIsDigit = /[0-9]/.test(prev);
      const chIsUpper = /[A-Z]/.test(ch);
      const chIsDigit = /[0-9]/.test(ch);
      const boundary =
        (prevIsLower && chIsUpper) ||
        (prevIsUpper && chIsUpper && next !== undefined && /[a-z]/.test(next)) ||
        (prevIsDigit && !chIsDigit) ||
        (!prevIsDigit && chIsDigit);
      if (boundary) {
        flush();
      }
    }
    current += ch;
  }
  flush();
  return tokens;
}

/** Official `getFormDisplayLabel`, reimplemented without lodash. */
export function formDisplayLabel(value: string): string {
  const tokens = tokenizeLabel(value).map(
    (token) => token.charAt(0).toUpperCase() + token.slice(1),
  );
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

// --- resolvers -------------------------------------------------------------

function isArrayRowNode(path: string[]): boolean {
  return /^\d+$/.test(path[path.length - 1] ?? '');
}

export function resolveFieldLabel(args: {
  labelKeyPrefix: string | undefined;
  path: string[];
  title: string | undefined;
  key: string;
  t: Translate;
  te: Exists;
}): string {
  const fallback = args.title ?? startCase(args.key);
  if (args.labelKeyPrefix === undefined || isArrayRowNode(args.path)) {
    return fallback;
  }
  const labelKey = `${args.labelKeyPrefix}.label`;
  return args.te(labelKey) ? args.t(labelKey) : fallback;
}

export function resolveFieldDescription(args: {
  labelKeyPrefix: string | undefined;
  path: string[];
  description: string | undefined;
  t: Translate;
  te: Exists;
}): string | undefined {
  if (args.labelKeyPrefix === undefined || isArrayRowNode(args.path)) {
    return args.description;
  }
  const descriptionKey = `${args.labelKeyPrefix}.description`;
  return args.te(descriptionKey) ? args.t(descriptionKey) : args.description;
}

export function resolveFieldFocusMeta(args: {
  labelKeyPrefix: string | undefined;
  path: string[];
  title: string | undefined;
  description: string | undefined;
  t: Translate;
  te: Exists;
}): FieldFocusMeta {
  if (args.labelKeyPrefix === undefined || isArrayRowNode(args.path)) {
    return { title: args.title, description: args.description };
  }
  // No startCase fill here: an absent title stays undefined so the doc
  // panel keeps its own fallback, exactly as before.
  const labelKey = `${args.labelKeyPrefix}.label`;
  const descriptionKey = `${args.labelKeyPrefix}.description`;
  return {
    title: args.te(labelKey) ? args.t(labelKey) : args.title,
    description: args.te(descriptionKey) ? args.t(descriptionKey) : args.description,
  };
}

export function resolveBranchFocusMeta(args: {
  branchFocusPrefix: string | undefined;
  title: string | undefined;
  description: string | undefined;
  t: Translate;
  te: Exists;
}): FieldFocusMeta {
  if (args.branchFocusPrefix === undefined) {
    return { title: args.title, description: args.description };
  }
  // A title-less branch keeps an undefined title (the panel's fallback
  // applies); the branch type label must never fill it.
  const labelKey = `${args.branchFocusPrefix}.label`;
  const descriptionKey = `${args.branchFocusPrefix}.description`;
  return {
    title:
      args.title === undefined ? undefined : args.te(labelKey) ? args.t(labelKey) : args.title,
    description:
      args.description === undefined
        ? undefined
        : args.te(descriptionKey)
          ? args.t(descriptionKey)
          : args.description,
  };
}

/**
 * Branch option title: branch label key → formatted title → formatted
 * type (via its key when one exists) → `Option N`. Mirrors official
 * `CoreOneOfField`'s `title → type → Option N` chain, with the key
 * lookup layered on top. The caller derefs the branch first; a
 * dangling `$ref` throws before this is ever called.
 */
export function resolveBranchTitle(args: {
  labelKeyPrefix: string | undefined;
  branchIndex: number;
  branch: RjsfSchema;
  t: Translate;
  te: Exists;
}): string {
  if (args.labelKeyPrefix !== undefined) {
    const branchLabelKey = `${args.labelKeyPrefix}.branches.b${args.branchIndex}.label`;
    if (args.te(branchLabelKey)) {
      return args.t(branchLabelKey);
    }
  }
  if (args.branch.title !== undefined) {
    return formDisplayLabel(args.branch.title);
  }
  if (typeof args.branch.type === 'string') {
    const typeKey = branchTypeKey(args.branch.type);
    if (typeKey !== undefined && args.te(typeKey)) {
      return args.t(typeKey);
    }
    return formDisplayLabel(args.branch.type);
  }
  return args.t('forms.schemaFields.branchOption', { n: args.branchIndex + 1 });
}

/**
 * The selected branch's description row: only when the field has more
 * than one branch and the branch carries a string description, matching
 * official `computeSelectedBranchRender`.
 */
export function resolveBranchDescription(args: {
  labelKeyPrefix: string | undefined;
  branchIndex: number;
  branchCount: number;
  branch: RjsfSchema;
  t: Translate;
  te: Exists;
}): string | undefined {
  if (args.branchCount <= 1 || typeof args.branch.description !== 'string') {
    return undefined;
  }
  if (args.labelKeyPrefix !== undefined) {
    const branchDescriptionKey = `${args.labelKeyPrefix}.branches.b${args.branchIndex}.description`;
    if (args.te(branchDescriptionKey)) {
      return args.t(branchDescriptionKey);
    }
  }
  return args.branch.description;
}

export function resolveEnumOptionLabel(args: {
  labelKeyPrefix: string | undefined;
  value: string;
  key: string;
  t: Translate;
  te: Exists;
}): string {
  const optionKey = enumOptionKey(args.labelKeyPrefix, args.value);
  if (optionKey !== undefined && args.te(optionKey)) {
    return args.t(optionKey);
  }
  if (args.key === 'classificationLanguage') {
    return args.value.charAt(0).toUpperCase() + args.value.slice(1);
  }
  return args.value;
}
