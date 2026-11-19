/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getSearchEntityTypes } from '@/api/search';
import { SEARCH_INDEXING_APPLICATION_NAME } from '@/api/apps';

/**
 * Minimal JSON Schema shape the bundled application schemas use (the 10
 * files under src/jsons/applicationSchemas). No $ref/oneOf/anyOf appears
 * in them; the renderer covers object/string/integer/number/boolean/array
 * plus enum, format, and the treeSelect uiFieldType.
 */
export interface JsonSchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
  format?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
  uiFieldType?: string;
  definitions?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

/**
 * Official ApplicationsClassBase.getJSONUISchema() hide paths: the form
 * never renders these fields (pin sets 'ui:widget': 'hidden' for each).
 * Expressed as dot paths because the Vue schema form has no RJSF uiSchema.
 */
export const HIDDEN_SCHEMA_PATHS: ReadonlySet<string> = new Set([
  'moduleConfiguration.dataAssets.serviceFilter',
  'entityLink',
  'type',
]);

export function isHiddenSchemaPath(dotPath: string): boolean {
  return HIDDEN_SCHEMA_PATHS.has(dotPath);
}

const schemaModules = import.meta.glob('../../jsons/applicationSchemas/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, JsonSchema>;

const logoModules = import.meta.glob('../../assets/svg/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const screenshotModules = import.meta.glob('../../assets/appScreenshots/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

const schemasByName = new Map<string, JsonSchema>();
for (const [path, schema] of Object.entries(schemaModules)) {
  schemasByName.set(basename(path).replace(/\.json$/, ''), schema);
}

const logosByName = new Map<string, string>();
for (const [path, url] of Object.entries(logoModules)) {
  logosByName.set(basename(path).replace(/\.svg$/, ''), url);
}

const screenshotsByName = new Map<string, string>();
for (const [path, url] of Object.entries(screenshotModules)) {
  screenshotsByName.set(basename(path).replace(/\.png$/, ''), url);
}

/** The sentinel the backend expands to every registered index (pin ALL_ENTITY_TYPES). */
export const ALL_ENTITY_TYPES = 'all';

/**
 * Official withSearchEntityTypes (ApplicationsClassBase.ts): the
 * SearchIndexing schema's `entities` enum is server-driven. On fetch
 * failure the schema is returned unconstrained (never narrowed to just
 * ['all'], which would fail validation of stored selections) and the
 * caller-supplied error handler runs (pin shows an error toast).
 */
export async function withSearchEntityTypes(
  schema: JsonSchema,
  options: {
    fetchEntityTypes?: () => Promise<string[]>;
    onEntityTypesError?: (error: unknown) => void;
  } = {},
): Promise<JsonSchema> {
  const fetchEntityTypes = options.fetchEntityTypes ?? getSearchEntityTypes;
  let entityTypes: string[];
  try {
    entityTypes = await fetchEntityTypes();
  } catch (error) {
    options.onEntityTypesError?.(error);
    return schema;
  }
  const entities = schema.properties?.entities;
  return {
    ...schema,
    properties: {
      ...schema.properties,
      entities: {
        ...entities,
        items: { type: 'string', enum: [ALL_ENTITY_TYPES, ...entityTypes] },
      },
    },
  };
}

/**
 * Official ApplicationsClassBase.importSchema: throws when the schema is
 * missing — callers rely on the rejection to toast + fall back, so never
 * silently return an empty object. SearchIndexing schemas get the
 * server-driven entity-types injection.
 */
export async function importSchema(
  fqn: string,
  options: {
    fetchEntityTypes?: () => Promise<string[]>;
    onEntityTypesError?: (error: unknown) => void;
  } = {},
): Promise<JsonSchema> {
  const schema = schemasByName.get(fqn);
  if (!schema) {
    throw new Error(`Application schema not found: ${fqn}`);
  }
  return fqn === SEARCH_INDEXING_APPLICATION_NAME
    ? withSearchEntityTypes(schema, options)
    : schema;
}

/**
 * Official ApplicationsClassBase.importAppLogo: a missing (or unloadable)
 * logo falls back to the default application logo. Returns the asset URL
 * for an <img> (the product renders SVGs as URLs, not components).
 */
export function importAppLogo(appName: string): string {
  return (
    logosByName.get(appName) ??
    logosByName.get('application-colored') ??
    ''
  );
}

/**
 * Official ApplicationsClassBase.importAppScreenshot: throws when the
 * screenshot is missing — callers try/catch around this to drop missing
 * screenshots instead of rendering an <img> with no src. The PNG assets
 * are not in the tree (residual: awaiting web upload); until they land,
 * every lookup throws and every screenshot is dropped, exactly as pin's
 * catch path behaves for a missing file.
 */
export function importAppScreenshot(screenshotName: string): string {
  const url = screenshotsByName.get(screenshotName);
  if (!url) {
    throw new Error(`App screenshot not found: ${screenshotName}`);
  }
  return url;
}
