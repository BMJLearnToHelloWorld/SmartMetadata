/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PipelineType, ServiceKind } from '@/types/ingestion';

/**
 * Port of official `IngestionWorkflowUtils.ts` (pin `a3012259ca`) plus the
 * schema-driven helpers official spreads across `IngestionConfigUtils.ts`
 * (`getDefaultFilterPropertyValues`,
 * `getDefaultFilterPropertyFieldsFromSchema`) and
 * `JSONSchemaFormUtils.ts` (`formatAdditionalProperties`).
 *
 * The 19 pipeline schemas under `./schemas/` are byte-identical copies of
 * the pin's `jsons/ingestionSchemas/*.json`. They load by dynamic
 * `import()` so the UI bundle does not carry ~1.2 MB of JSON up front
 * (`testSuitePipeline.json` alone is 954 KB).
 *
 * ADR:2026-11-12-pipeline-schema-driven-source-config-form
 */

/** Minimal JSON Schema shape the renderer and the defaults walk need. */
export interface RjsfSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  properties?: Record<string, RjsfSchema>;
  required?: string[];
  items?: RjsfSchema;
  additionalProperties?: boolean | RjsfSchema;
  definitions?: Record<string, RjsfSchema>;
  $ref?: string;
  oneOf?: RjsfSchema[];
  anyOf?: RjsfSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  mask?: boolean;
  [key: string]: unknown;
}

/** Official `ServiceCategory` values (openmetadata-ui `enums/service.enum`). */
export type ServiceCategory =
  | 'DATABASE_SERVICES'
  | 'MESSAGING_SERVICES'
  | 'DASHBOARD_SERVICES'
  | 'STORAGE_SERVICES'
  | 'PIPELINE_SERVICES'
  | 'API_SERVICES'
  | 'ML_MODEL_SERVICES'
  | 'METADATA_SERVICES'
  | 'SEARCH_SERVICES'
  | 'DRIVE_SERVICES';

/** Product `ServiceKind` → official `ServiceCategory`. Kinds official has no
 * ingestion schema for (`llm`, `mcp`, `security`) map to `undefined` and the
 * resolver falls back to `{}` — the same fallback official's
 * `METADATA_SCHEMA_BY_SERVICE_CATEGORY` lookup has for a missing key. */
export const SERVICE_CATEGORY_BY_KIND: Record<ServiceKind, ServiceCategory | undefined> = {
  database: 'DATABASE_SERVICES',
  messaging: 'MESSAGING_SERVICES',
  dashboard: 'DASHBOARD_SERVICES',
  storage: 'STORAGE_SERVICES',
  pipeline: 'PIPELINE_SERVICES',
  api: 'API_SERVICES',
  mlmodel: 'ML_MODEL_SERVICES',
  metadata: 'METADATA_SERVICES',
  drive: 'DRIVE_SERVICES',
  search: 'SEARCH_SERVICES',
  llm: undefined,
  mcp: undefined,
  security: undefined,
};

/**
 * Official `ServiceConnectionFilterPatternFields`
 * (`enums/ServiceConnection.enum.ts`): every `*FilterPattern` key a
 * pipeline schema can carry. The form renders these first (official
 * `INGESTION_WORKFLOW_UI_SCHEMA` `ui:order`) and the create-time
 * prefill is limited to them.
 */
export const SERVICE_FILTER_PATTERN_FIELDS = [
  'databaseFilterPattern',
  'schemaFilterPattern',
  'tableFilterPattern',
  'storedProcedureFilterPattern',
  'apiCollectionFilterPattern',
  'dashboardFilterPattern',
  'containerFilterPattern',
  'mlModelFilterPattern',
  'pipelineFilterPattern',
  'topicFilterPattern',
  'searchIndexFilterPattern',
  'chartFilterPattern',
  'dataModelFilterPattern',
  'projectFilterPattern',
  'classificationFilterPattern',
  'directoryFilterPattern',
  'fileFilterPattern',
  'spreadsheetFilterPattern',
  'worksheetFilterPattern',
] as const;

/**
 * Official `INGESTION_ELASTIC_SEARCH_WORKFLOW_UI_SCHEMA` fields: hidden
 * in the form and omitted from the submitted data for
 * `elasticSearchReindex` pipelines (official omits them in the form's
 * `onChange` and `onSubmit`).
 */
export const ELASTIC_SEARCH_OMITTED_FIELDS = [
  'useSSL',
  'verifyCerts',
  'timeout',
  'caCerts',
  'useAwsCredentials',
  'regionName',
] as const;

type SchemaLoader = () => Promise<RjsfSchema>;

// Literal dynamic imports (no variable path): Vite code-splits each
// schema JSON into its own chunk, loaded only when its (pipelineType,
// serviceCategory) pair is selected.
const SCHEMA_LOADERS: Record<string, SchemaLoader> = {
  apiServiceMetadataPipeline: async () =>
    (await import('./schemas/apiServiceMetadataPipeline.json')).default as unknown as RjsfSchema,
  dashboardServiceMetadataPipeline: async () =>
    (await import('./schemas/dashboardServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  databaseServiceAutoClassificationPipeline: async () =>
    (await import('./schemas/databaseServiceAutoClassificationPipeline.json'))
      .default as unknown as RjsfSchema,
  databaseServiceMetadataPipeline: async () =>
    (await import('./schemas/databaseServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  databaseServiceProfilerPipeline: async () =>
    (await import('./schemas/databaseServiceProfilerPipeline.json'))
      .default as unknown as RjsfSchema,
  databaseServiceQueryLineagePipeline: async () =>
    (await import('./schemas/databaseServiceQueryLineagePipeline.json'))
      .default as unknown as RjsfSchema,
  databaseServiceQueryUsagePipeline: async () =>
    (await import('./schemas/databaseServiceQueryUsagePipeline.json'))
      .default as unknown as RjsfSchema,
  dataInsightPipeline: async () =>
    (await import('./schemas/dataInsightPipeline.json')).default as unknown as RjsfSchema,
  dbtPipeline: async () =>
    (await import('./schemas/dbtPipeline.json')).default as unknown as RjsfSchema,
  driveServiceMetadataPipeline: async () =>
    (await import('./schemas/driveServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  messagingServiceAutoClassificationPipeline: async () =>
    (await import('./schemas/messagingServiceAutoClassificationPipeline.json'))
      .default as unknown as RjsfSchema,
  messagingServiceMetadataPipeline: async () =>
    (await import('./schemas/messagingServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  metadataToElasticSearchPipeline: async () =>
    (await import('./schemas/metadataToElasticSearchPipeline.json'))
      .default as unknown as RjsfSchema,
  mlmodelServiceMetadataPipeline: async () =>
    (await import('./schemas/mlmodelServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  pipelineServiceMetadataPipeline: async () =>
    (await import('./schemas/pipelineServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  searchServiceMetadataPipeline: async () =>
    (await import('./schemas/searchServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  storageServiceAutoClassificationPipeline: async () =>
    (await import('./schemas/storageServiceAutoClassificationPipeline.json'))
      .default as unknown as RjsfSchema,
  storageServiceMetadataPipeline: async () =>
    (await import('./schemas/storageServiceMetadataPipeline.json'))
      .default as unknown as RjsfSchema,
  testSuitePipeline: async () =>
    (await import('./schemas/testSuitePipeline.json')).default as unknown as RjsfSchema,
};

/**
 * Port of official `getMetadataSchemaByServiceCategory`: the metadata
 * schema per service category. Missing keys fall back to `{}`.
 */
async function getMetadataSchemaByServiceCategory(
  serviceCategory: ServiceCategory | undefined,
): Promise<RjsfSchema> {
  switch (serviceCategory) {
    case 'METADATA_SERVICES':
    case 'DATABASE_SERVICES':
      return SCHEMA_LOADERS.databaseServiceMetadataPipeline();
    case 'API_SERVICES':
      return SCHEMA_LOADERS.apiServiceMetadataPipeline();
    case 'DASHBOARD_SERVICES':
      return SCHEMA_LOADERS.dashboardServiceMetadataPipeline();
    case 'MESSAGING_SERVICES':
      return SCHEMA_LOADERS.messagingServiceMetadataPipeline();
    case 'ML_MODEL_SERVICES':
      return SCHEMA_LOADERS.mlmodelServiceMetadataPipeline();
    case 'PIPELINE_SERVICES':
      return SCHEMA_LOADERS.pipelineServiceMetadataPipeline();
    case 'STORAGE_SERVICES':
      return SCHEMA_LOADERS.storageServiceMetadataPipeline();
    case 'SEARCH_SERVICES':
      return SCHEMA_LOADERS.searchServiceMetadataPipeline();
    case 'DRIVE_SERVICES':
      return SCHEMA_LOADERS.driveServiceMetadataPipeline();
    default:
      return {};
  }
}

/** Port of official `getAutoClassificationSchema`. */
async function getAutoClassificationSchema(
  serviceCategory: ServiceCategory | undefined,
): Promise<RjsfSchema> {
  if (serviceCategory === 'STORAGE_SERVICES') {
    return SCHEMA_LOADERS.storageServiceAutoClassificationPipeline();
  }
  if (serviceCategory === 'MESSAGING_SERVICES') {
    return SCHEMA_LOADERS.messagingServiceAutoClassificationPipeline();
  }
  return SCHEMA_LOADERS.databaseServiceAutoClassificationPipeline();
}

/**
 * Port of official `WORKFLOW_TYPE_SCHEMA_RESOLVERS`: each entry mirrors
 * one former case label. Types with no entry (`application`,
 * `policyAgent`, `reverseMetadata`) fall back to `{}`.
 */
async function resolveWorkflowSchema(
  pipelineType: PipelineType,
  serviceCategory: ServiceCategory | undefined,
): Promise<RjsfSchema> {
  switch (pipelineType) {
    case 'metadata':
      return getMetadataSchemaByServiceCategory(serviceCategory);
    case 'profiler':
      return SCHEMA_LOADERS.databaseServiceProfilerPipeline();
    case 'autoClassification':
      return getAutoClassificationSchema(serviceCategory);
    case 'usage':
      return SCHEMA_LOADERS.databaseServiceQueryUsagePipeline();
    case 'lineage':
      return SCHEMA_LOADERS.databaseServiceQueryLineagePipeline();
    case 'dbt':
      return SCHEMA_LOADERS.dbtPipeline();
    case 'TestSuite':
      return SCHEMA_LOADERS.testSuitePipeline();
    case 'elasticSearchReindex':
      return SCHEMA_LOADERS.metadataToElasticSearchPipeline();
    case 'dataInsight':
      return SCHEMA_LOADERS.dataInsightPipeline();
    default:
      return {};
  }
}

/**
 * Port of official `getSchemaByWorkflowType` (minus the custom
 * properties — see `getWorkflowCustomProperties`): the pipeline schema
 * for a `(pipelineType, serviceCategory)` pair, with official's
 * schema-level omissions applied. `shardedTables` is omitted unless
 * the service type is BigQuery (`IngestionWorkflowForm`); the six
 * ElasticSearch-connection fields are omitted for
 * `elasticSearchReindex` pipelines.
 */
export async function getSchemaByWorkflowType(
  pipelineType: PipelineType,
  serviceCategory: ServiceCategory | undefined,
  serviceType?: string,
): Promise<RjsfSchema> {
  const schema = await resolveWorkflowSchema(pipelineType, serviceCategory);
  if (!schema.properties) {
    return schema;
  }
  const properties = { ...schema.properties };
  if (serviceType !== 'BigQuery') {
    delete properties.shardedTables;
  }
  if (pipelineType === 'elasticSearchReindex') {
    for (const field of ELASTIC_SEARCH_OMITTED_FIELDS) {
      delete properties[field];
    }
  }
  return { ...schema, properties };
}

/**
 * The product's equivalent of official
 * `ProfilerConfigurationClassBase.getSparkAgentField()`: the field
 * component for the profiler's Processing Engine. The product has no
 * Spark agent integration, so this is `undefined` — exactly like the
 * OSS base at the pin (no override exists there either). It is the
 * extension point: a future Spark agent integration registers its
 * field here and `getWorkflowCustomProperties` starts emitting
 * `rootProcessingEngine`.
 */
export function getSparkAgentField(): undefined {
  return undefined;
}

/**
 * Port of official `getWorkflowCustomProperties`: the schema properties
 * the workflow form adds on top of the pipeline schema. `name`,
 * `displayName` and `enableDebugLog` are rendered by the surrounding
 * wizard in the product (P-13/P-14/P-15), so the schema form does not
 * merge them — but the `rootProcessingEngine` rule lives here, so a
 * future Spark agent field slots in without touching the resolver.
 */
export function getWorkflowCustomProperties(workflowType: PipelineType): RjsfSchema {
  const customProperties: RjsfSchema = {
    displayName: {
      description: 'Display Name of the workflow',
      type: 'string',
      title: 'Name',
    },
    name: {
      description: 'Name of the workflow',
      type: 'string',
    },
    enableDebugLog: {
      title: 'Enable Debug Log',
      type: 'boolean',
      default: false,
    },
  };

  if (workflowType === 'profiler' && getSparkAgentField() !== undefined) {
    customProperties.rootProcessingEngine = {
      type: 'object',
      $id: '/schemas/rootProcessingEngine',
      title: 'Processing Engine',
      description: 'Select the processing engine for the profiler workflow',
      properties: {
        type: {
          type: 'string',
          default: 'ingestionRunner',
        },
        id: {
          type: 'string',
        },
      },
      required: ['type', 'id'],
    };
  }

  return customProperties;
}

/** Resolve a `#/...` JSON-pointer `$ref` against the root schema. */
export function resolveRef(ref: string, rootSchema: RjsfSchema): RjsfSchema {
  const pointer = ref.replace(/^#\//, '');
  let current: unknown = rootSchema;
  for (const segment of pointer.split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current !== null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      throw new Error(`Could not find a definition for ${ref}.`);
    }
  }
  if (current === undefined || current === null || typeof current !== 'object') {
    throw new Error(`Could not find a definition for ${ref}.`);
  }
  return current as RjsfSchema;
}

/** Follow `$ref`s (including chains) to the concrete schema. */
export function deref(schema: RjsfSchema, rootSchema: RjsfSchema): RjsfSchema {
  let current = schema;
  const seen = new Set<string>();
  while (current.$ref) {
    if (seen.has(current.$ref)) {
      break;
    }
    seen.add(current.$ref);
    const target = resolveRef(current.$ref, rootSchema);
    // Sibling keys on the referencing schema win over the target's
    // (the `default` next to a `$ref` is the field's own default).
    const { $ref, ...siblings } = current;
    void $ref;
    current = { ...target, ...siblings };
  }
  return current;
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Pick the `oneOf`/`anyOf` branch a value belongs to: branches whose
 * `type` cannot hold the value are eliminated first (an object value
 * never selects a `string` branch — the ownerConfig maps are
 * `anyOf: [string, string[]]`-valued and `anyOf: [string, map]`-shaped),
 * then the first branch whose single-value-enum discriminators match
 * the value, else the first branch whose `required` fields are all
 * present, else the first surviving branch. Mirrors how RJSF's
 * `getDefaultFormState` resolves a `oneOf` for a given value.
 */
export function selectBranch(
  branches: RjsfSchema[],
  value: unknown,
  rootSchema: RjsfSchema,
): RjsfSchema {
  if (branches.length === 0) {
    return {};
  }
  const valueType =
    value === undefined || value === null
      ? undefined
      : Array.isArray(value)
        ? 'array'
        : typeof value;
  const typeCompatible = branches.filter((branch) => {
    if (valueType === undefined) {
      return true;
    }
    const type = deref(branch, rootSchema).type;
    if (type === undefined) {
      return true;
    }
    return Array.isArray(type) ? type.includes(valueType) : type === valueType;
  });
  const candidates = typeCompatible.length > 0 ? typeCompatible : branches;
  if (isRecord(value)) {
    for (const branch of candidates) {
      const resolved = deref(branch, rootSchema);
      const props = resolved.properties ?? {};
      const discriminatorMatches = Object.entries(props).some(([key, prop]) => {
        const propSchema = deref(prop, rootSchema);
        return (
          Array.isArray(propSchema.enum) &&
          propSchema.enum.length === 1 &&
          value[key] === propSchema.enum[0]
        );
      });
      if (discriminatorMatches) {
        return resolved;
      }
    }
    for (const branch of candidates) {
      const resolved = deref(branch, rootSchema);
      const required = resolved.required ?? [];
      if (required.length > 0 && required.every((key) => value[key] !== undefined)) {
        return resolved;
      }
    }
  }
  return deref(candidates[0]!, rootSchema);
}

/**
 * Replicates `@rjsf/utils@5.24.13` `getDefaultFormState` (the pin's
 * version, verified by running it against the vendored schemas):
 * explicit `default`s seed; objects seed from their inner defaults
 * when any exist; `oneOf` fields with no value take the first branch
 * and seed its defaults; arrays seed to `[]` unless a default exists;
 * provided values always win over defaults. `type` resolves through
 * its `$ref` to the single-value enum default.
 */
export function applySchemaDefaults(
  schema: RjsfSchema,
  data: Record<string, unknown>,
  rootSchema: RjsfSchema = schema,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  const properties = schema.properties ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const resolved = deref(propSchema, rootSchema);
    const present = out[key];
    if (present !== undefined) {
      out[key] = applyDefaultsForValue(resolved, present, rootSchema);
      continue;
    }
    const seeded = seedDefault(resolved, rootSchema);
    if (seeded !== undefined) {
      out[key] = seeded;
    }
  }
  return out;
}

function applyDefaultsForValue(
  schema: RjsfSchema,
  value: unknown,
  rootSchema: RjsfSchema,
): unknown {
  if (schema.oneOf || schema.anyOf) {
    const branches = schema.oneOf ?? schema.anyOf ?? [];
    const branch = selectBranch(branches, value, rootSchema);
    if (isRecord(value)) {
      return applySchemaDefaults(branch, value, rootSchema);
    }
    return value;
  }
  if (isRecord(value) && schema.properties) {
    return applySchemaDefaults(schema, value, rootSchema);
  }
  if (Array.isArray(value) && schema.items && isRecord(schema.items)) {
    return value.map((item) =>
      isRecord(item) ? applySchemaDefaults(deref(schema.items as RjsfSchema, rootSchema), item, rootSchema) : item,
    );
  }
  return value;
}

function seedDefault(schema: RjsfSchema, rootSchema: RjsfSchema): unknown {
  // A `null` default seeds nothing: RJSF ignores it and falls through to
  // the type-based rules (an array with `default: null` still seeds `[]`,
  // a nullable integer with `default: null` stays absent).
  if (schema.default !== undefined && schema.default !== null) {
    const value = clone(schema.default);
    if (schema.oneOf || schema.anyOf) {
      const branches = schema.oneOf ?? schema.anyOf ?? [];
      const branch = selectBranch(branches, value, rootSchema);
      if (isRecord(value)) {
        return applySchemaDefaults(branch, value, rootSchema);
      }
    }
    if (isRecord(value) && schema.properties) {
      return applySchemaDefaults(schema, value, rootSchema);
    }
    return value;
  }
  if (schema.oneOf || schema.anyOf) {
    const branches = schema.oneOf ?? schema.anyOf ?? [];
    if (branches.length === 0) {
      return undefined;
    }
    const branch = deref(branches[0]!, rootSchema);
    const seeded = seedDefault(branch, rootSchema);
    return seeded === undefined ? undefined : seeded;
  }
  if (schema.properties) {
    const seeded = applySchemaDefaults(schema, {}, rootSchema);
    return Object.keys(seeded).length > 0 ? seeded : undefined;
  }
  if (schema.type === 'array') {
    return [];
  }
  return undefined;
}

/**
 * Port of official `cleanWorkFlowData` (`IngestionWorkflowUtils.ts`):
 * drop a top-level key whose value is a filter-pattern object with
 * both `includes` and `excludes` empty. The schema form seeds empty
 * patterns (`{includes: [], excludes: []}`) for every pattern field,
 * so without this the submitted config would carry them all.
 */
export function cleanWorkFlowData<T extends Record<string, unknown>>(workFlowData: T): T {
  const cleaned = clone(workFlowData);
  for (const key of Object.keys(cleaned)) {
    const value = cleaned[key];
    const hasIncludesAndExcludes =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'excludes' in (value as Record<string, unknown>) &&
      'includes' in (value as Record<string, unknown>);
    if (hasIncludesAndExcludes) {
      const pattern = value as Record<string, unknown>;
      const empty = (list: unknown): boolean =>
        !Array.isArray(list) || list.length === 0;
      if (empty(pattern.excludes) && empty(pattern.includes)) {
        delete cleaned[key];
      }
    }
  }
  return cleaned;
}

/**
 * Port of official `formatAdditionalProperties`
 * (`JSONSchemaFormUtils.ts`): drop map rows the user added but never
 * filled in, recognised by RJSF's default key (`newKey*`) and an empty
 * value (`{}`, `[]`, or the string `'New Value'`).
 */
export function formatAdditionalProperties<T>(formData: T): T {
  const data = formData as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value !== null && typeof value === 'object') {
      const isEmptyStructure = Array.isArray(value)
        ? value.length === 0
        : Object.keys(value).length === 0;
      if (key.startsWith('newKey') && isEmptyStructure) {
        delete data[key];
        continue;
      }
      formatAdditionalProperties(value);
    } else if (key.startsWith('newKey') && value === 'New Value') {
      delete data[key];
    }
  }
  return formData;
}

const OWNER_CONFIG_MAP_FIELDS = ['database', 'databaseSchema', 'table'] as const;

/**
 * Port of official `validateOwnerConfigMaps`
 * (`IngestionWorkflowUtils.ts`): flags ownerConfig map rows that were
 * given a name but no owner. Returns the offending field paths —
 * `[['ownerConfig', 'database'], ['ownerConfig', 'database',
 * 'sales_db']]` — so the form can render the translated
 * `crud.fieldRequired` message on both the map and the row. Rows still
 * under RJSF's default `newKey*` name are skipped:
 * `formatAdditionalProperties` drops them on submit.
 */
export function validateOwnerConfigMaps(
  formData: Record<string, unknown> | undefined,
): string[][] {
  const paths: string[][] = [];
  const ownerConfig = formData?.ownerConfig;
  if (!isRecord(ownerConfig)) {
    return paths;
  }
  for (const field of OWNER_CONFIG_MAP_FIELDS) {
    const ownerMap = ownerConfig[field];
    if (!isRecord(ownerMap)) {
      continue;
    }
    const emptyRows = Object.entries(ownerMap).filter(
      ([name, owner]) =>
        !name.startsWith('newKey') &&
        owner !== null &&
        typeof owner === 'object' &&
        (Array.isArray(owner) ? owner.length === 0 : Object.keys(owner).length === 0),
    );
    if (emptyRows.length > 0) {
      paths.push(['ownerConfig', field]);
      for (const [name] of emptyRows) {
        paths.push(['ownerConfig', field, name]);
      }
    }
  }
  return paths;
}

/**
 * Port of official `getFilteredSchema`
 * (`ServiceConnectionUtils.ts`): keep only the filter-pattern fields
 * (`removeDefaultFilters = false`) or drop them
 * (`removeDefaultFilters = true`).
 */
export function getFilteredSchema(
  schema: Record<string, unknown> | undefined,
  removeDefaultFilters = true,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema ?? {}).filter(([key]) => {
      const isFiltersField = (SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).includes(key);
      return removeDefaultFilters ? !isFiltersField : isFiltersField;
    }),
  );
}

/** Port of official `getDefaultFilterPropertyFieldsFromSchema`: the
 * schema's property keys that are filter-pattern fields. */
export function getDefaultFilterPropertyFieldsFromSchema(schema: RjsfSchema): string[] {
  return Object.keys(schema.properties ?? {}).filter((key) =>
    (SERVICE_FILTER_PATTERN_FIELDS as readonly string[]).includes(key),
  );
}

/**
 * Port of official `getDefaultFilterPropertyValues`
 * (`IngestionConfigUtils.ts:245-284`), widened to the resolved schema
 * (P-08(d); the P-08(c) port used the hand-written field set). On edit
 * the saved config's filter-pattern values read back; on create the
 * service connection.config values are kept only for keys that are
 * filter-pattern fields of this pipeline's schema.
 */
export function getDefaultFilterPropertyValues({
  isEditMode,
  ingestionData,
  serviceData,
  schema,
}: {
  isEditMode: boolean;
  ingestionData?: { config?: Record<string, unknown> };
  serviceData?: { connection?: { config?: Record<string, unknown> } } | null;
  schema: RjsfSchema;
}): Record<string, unknown> {
  if (isEditMode) {
    return getFilteredSchema(ingestionData?.config, false);
  }
  const filterPropertiesInSchema = getDefaultFilterPropertyFieldsFromSchema(schema);
  const filterValues = getFilteredSchema(serviceData?.connection?.config, false);
  return Object.fromEntries(
    Object.entries(filterValues).filter(([key]) => filterPropertiesInSchema.includes(key)),
  );
}

/**
 * Resolve every `oneOf`/`anyOf` node in a schema to the branch the given
 * data selects — the AJV equivalent of the branch RJSF renders. Validation
 * then runs against the resolved schema, so errors come only from the
 * selected branch instead of from every branch plus a `oneOf` complaint
 * (RJSF surfaces the selected branch's errors the same way).
 *
 * Array items are resolved against the first row: no item schema in the
 * vendored set contains a `oneOf`/`anyOf`, so the choice cannot differ
 * per row.
 */
export function resolveBranches(schema: RjsfSchema, data: unknown, rootSchema: RjsfSchema): RjsfSchema {
  const resolved = deref(schema, rootSchema);
  const branches = resolved.oneOf ?? resolved.anyOf;
  if (branches) {
    return resolveBranches(selectBranch(branches, data, rootSchema), data, rootSchema);
  }
  const out: RjsfSchema = { ...resolved };
  if (resolved.properties) {
    const properties: Record<string, RjsfSchema> = {};
    const record = isRecord(data) ? data : {};
    for (const [key, subSchema] of Object.entries(resolved.properties)) {
      properties[key] = resolveBranches(subSchema, record[key], rootSchema);
    }
    out.properties = properties;
  }
  if (resolved.items && typeof resolved.items === 'object') {
    const rows = Array.isArray(data) ? data : [];
    out.items = resolveBranches(resolved.items, rows[0], rootSchema);
  }
  if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
    out.additionalProperties = resolveBranches(
      resolved.additionalProperties,
      undefined,
      rootSchema,
    );
  }
  return out;
}

/**
 * A stable key for the branch choices `resolveBranches` makes for a given
 * data object — the cache key for a validator compiled from the resolved
 * schema. Changes exactly when a branch selection changes.
 */
export function branchSignature(schema: RjsfSchema, data: unknown, rootSchema: RjsfSchema): string {
  const parts: string[] = [];
  function walk(node: RjsfSchema, value: unknown, path: string): void {
    const resolved = deref(node, rootSchema);
    const branches = resolved.oneOf ?? resolved.anyOf;
    if (branches) {
      const branch = selectBranch(branches, value, rootSchema);
      const index = branches.findIndex((candidate) => deref(candidate, rootSchema) === branch);
      parts.push(`${path}=${index}`);
      walk(branch, value, path);
      return;
    }
    if (resolved.properties && isRecord(value)) {
      for (const [key, subSchema] of Object.entries(resolved.properties)) {
        walk(subSchema, value[key], `${path}/${key}`);
      }
    }
    if (resolved.type === 'array' && Array.isArray(value) && resolved.items) {
      value.forEach((item, index) => {
        walk(resolved.items as RjsfSchema, item, `${path}/${index}`);
      });
    }
  }
  walk(schema, data, '');
  return parts.join(';');
}

/** `startCase` for schema keys that carry no `title` (official's RJSF does the same). */
export function startCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
