/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FilterPatternConfig } from '@/ingestion/filterPatterns';
import type { ServiceKind } from '@/types/ingestion';

/**
 * Wizard step-3 ("What to ingest") fields: exactly the `*FilterPattern`
 * properties declared in the selected service type's connection schema.
 *
 * Pin's `FiltersConfigForm` derives these per (category, type) from the
 * connection schema via `isFilterSchemaProperty` /
 * `getOrderedFilterEntries` (pin a3012259ca,
 * `FiltersConfigForm.utils.ts`) and merges the entered objects into
 * `connection.config`. The fork UI carries no connection schemas — the
 * connection form is lean-forms, not schema-driven — so the mechanism's
 * output is materialized here as a table, verified per schema file
 * against pin source: every connection schema for every type the wizard
 * lists is byte-identical to pin, and each entry below is exactly that
 * file's declared `*FilterPattern` properties, in `getOrderedFilterEntries`
 * order (the known-field enum order, unlisted `*FilterPattern` fields
 * last in schema-declaration order). A field is shown only when the
 * selected type's schema declares it, so the wizard merge can never emit
 * an undeclared key — the strict server rejects those on encrypt.
 *
 * The lookup is keyed by (kind, type), as pin's `loadConnectionSchema`
 * is: `VertexAI` names both an ML-model and an LLM connection schema,
 * with different filter sets. A type with no connection schema file
 * (`WEBHOOK`) or none declared (`Ranger`) maps to no fields, and the
 * wizard shows pin's empty state — the same outcome pin's
 * `EMPTY_CONNECTION_SCHEMA` fallback produces.
 *
 * The flat keys the old wizard merged (`includeSchemas`,
 * `includeViews`, `generateSampleData`, kind-gated siblings) occur
 * nowhere in pin — `includeSchemas` is not a connection field, not a
 * pipeline field, not a UI string anywhere in the pin tree — and the
 * pipeline surface for schema scope is the `schemaFilterPattern`
 * object, never a bare string. The old comment claiming the flat keys
 * were "exactly the pipeline sourceConfig surface" described the
 * fork's internal runner aliases, not any pin surface; it was removed
 * with the keys.
 */
export type ServiceFilterPatternKey =
  | 'databaseFilterPattern'
  | 'schemaFilterPattern'
  | 'tableFilterPattern'
  | 'storedProcedureFilterPattern'
  | 'apiCollectionFilterPattern'
  | 'apiEndpointFilterPattern'
  | 'dashboardFilterPattern'
  | 'containerFilterPattern'
  | 'mlModelFilterPattern'
  | 'pipelineFilterPattern'
  | 'topicFilterPattern'
  | 'searchIndexFilterPattern'
  | 'chartFilterPattern'
  | 'dataModelFilterPattern'
  | 'projectFilterPattern'
  | 'directoryFilterPattern'
  | 'fileFilterPattern'
  | 'spreadsheetFilterPattern'
  | 'worksheetFilterPattern'
  | 'modelFilterPattern'
  | 'serverFilterPattern'
  | 'glossaryFilterPattern'
  | 'domainFilterPattern';

export type ServiceFilterValues = {
  [key in ServiceFilterPatternKey]?: FilterPatternConfig;
};

export interface ServiceFilterFieldDef {
  key: ServiceFilterPatternKey;
  labelKey: string;
  testId: string;
}

const DATABASE_FILTERS: readonly ServiceFilterPatternKey[] = [
  'databaseFilterPattern',
  'schemaFilterPattern',
  'tableFilterPattern',
  'storedProcedureFilterPattern',
];

const DATABASE_FILTERS_NO_PROCEDURES: readonly ServiceFilterPatternKey[] = [
  'databaseFilterPattern',
  'schemaFilterPattern',
  'tableFilterPattern',
];

/**
 * Declared `*FilterPattern` properties per (kind, service type), in pin
 * order. Every list was read off the type's connection schema file in
 * `openmetadata-spec/.../entity/services/connections/`; files declaring
 * no filter patterns map to an empty list, not an omitted entry.
 */
const SERVICE_FILTER_FIELDS_BY_KIND_AND_TYPE: Record<
  ServiceKind,
  Record<string, readonly ServiceFilterPatternKey[]>
> = {
  database: {
    Postgres: DATABASE_FILTERS,
    Mysql: DATABASE_FILTERS,
    Snowflake: DATABASE_FILTERS,
    Databricks: DATABASE_FILTERS_NO_PROCEDURES,
    UnityCatalog: DATABASE_FILTERS_NO_PROCEDURES,
    Doris: DATABASE_FILTERS_NO_PROCEDURES,
    Mssql: DATABASE_FILTERS,
    Redshift: DATABASE_FILTERS,
    MariaDB: DATABASE_FILTERS,
    Greenplum: DATABASE_FILTERS_NO_PROCEDURES,
    Timescale: DATABASE_FILTERS_NO_PROCEDURES,
  },
  messaging: {
    Kafka: ['topicFilterPattern'],
    Redpanda: ['topicFilterPattern'],
  },
  dashboard: {
    Superset: ['dashboardFilterPattern', 'chartFilterPattern', 'dataModelFilterPattern', 'projectFilterPattern'],
    Metabase: ['dashboardFilterPattern', 'chartFilterPattern', 'dataModelFilterPattern', 'projectFilterPattern'],
  },
  storage: {
    S3: ['containerFilterPattern'],
  },
  pipeline: {
    Prefect: ['pipelineFilterPattern'],
    Dagster: ['pipelineFilterPattern'],
  },
  api: {
    Rest: ['apiCollectionFilterPattern', 'apiEndpointFilterPattern'],
    WEBHOOK: [],
  },
  mlmodel: {
    CustomMlModel: ['mlModelFilterPattern'],
    Mlflow: ['mlModelFilterPattern'],
    SageMaker: ['mlModelFilterPattern'],
    Sklearn: ['mlModelFilterPattern'],
    VertexAI: ['mlModelFilterPattern'],
  },
  metadata: {
    Alation: DATABASE_FILTERS_NO_PROCEDURES,
    AlationSink: DATABASE_FILTERS_NO_PROCEDURES,
    Amundsen: DATABASE_FILTERS_NO_PROCEDURES,
    Atlas: DATABASE_FILTERS_NO_PROCEDURES,
    Collibra: ['glossaryFilterPattern', 'domainFilterPattern'],
    MetadataES: DATABASE_FILTERS_NO_PROCEDURES,
    OpenMetadata: DATABASE_FILTERS_NO_PROCEDURES,
  },
  drive: {
    CustomDrive: ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
    GoogleDrive: ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
    Sftp: ['directoryFilterPattern', 'fileFilterPattern'],
    SharePoint: ['directoryFilterPattern', 'fileFilterPattern', 'spreadsheetFilterPattern', 'worksheetFilterPattern'],
  },
  search: {
    CustomSearch: ['searchIndexFilterPattern'],
    ElasticSearch: ['searchIndexFilterPattern'],
    OpenSearch: ['searchIndexFilterPattern'],
  },
  llm: {
    Anthropic: ['modelFilterPattern'],
    AzureOpenAI: ['modelFilterPattern'],
    Bedrock: ['modelFilterPattern'],
    CustomLLM: ['modelFilterPattern'],
    HuggingFace: ['modelFilterPattern'],
    Ollama: ['modelFilterPattern'],
    OpenAI: ['modelFilterPattern'],
    VertexAI: ['modelFilterPattern'],
  },
  mcp: {
    Mcp: ['serverFilterPattern'],
  },
  security: {
    Ranger: [],
  },
};

function fieldDef(key: ServiceFilterPatternKey): ServiceFilterFieldDef {
  return {
    key,
    labelKey: `ingestion.pipelines.filterPatterns.${key}`,
    testId: `filter-${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`,
  };
}

/**
 * The filter fields for one service type: exactly its connection
 * schema's declared `*FilterPattern` properties. An unlisted type maps
 * to no fields — showing a field the schema does not declare would let
 * the wizard merge an undeclared key.
 */
export function serviceFilterFieldsForType(
  kind: ServiceKind,
  serviceType: string,
): readonly ServiceFilterFieldDef[] {
  const keys = SERVICE_FILTER_FIELDS_BY_KIND_AND_TYPE[kind]?.[serviceType] ?? [];
  return keys.map(fieldDef);
}
