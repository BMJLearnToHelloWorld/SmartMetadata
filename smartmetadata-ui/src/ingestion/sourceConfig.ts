/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PipelineSourceConfig, PipelineType, ServiceKind } from '@/types/ingestion';
import {
  ELASTIC_SEARCH_OMITTED_FIELDS,
  cleanWorkFlowData,
  formatAdditionalProperties,
} from './ingestionSchemas';

export function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** OM metadataIngestion sourceConfig.config.type for a pipelineType + service kind. */
export function sourceConfigTypeForPipeline(
  pipelineType: string,
  kind: ServiceKind,
): string {
  if (pipelineType === 'lineage') {
    return 'DatabaseLineage';
  }
  if (pipelineType === 'usage') {
    return 'DatabaseUsage';
  }
  if (pipelineType === 'profiler') {
    return 'Profiler';
  }
  if (pipelineType === 'TestSuite') {
    return 'TestSuite';
  }
  if (pipelineType === 'dbt') {
    return 'DBT';
  }
  if (pipelineType === 'autoClassification') {
    return 'AutoClassification';
  }
  if (pipelineType === 'dataInsight') {
    return 'dataInsight';
  }
  if (pipelineType === 'elasticSearchReindex') {
    return 'MetadataToElasticSearch';
  }
  // metadata (default) — kind-specific OM metadata pipeline config types
  return sourceConfigTypeForKind(kind);
}

/**
 * Build the `sourceConfig` for a create or edit from the schema-driven
 * form data (P-08(d)). The form data is the `sourceConfig.config` object
 * itself: the schema defaults are already seeded into it, so the old
 * per-kind hand-written branches (which only knew 7 fields, includes
 * without excludes, and the wrong `type` for some kinds) are gone.
 *
 * The form data starts from the saved config on edit (so keys the form
 * does not model survive — the P-07 guarantee — and a field the user
 * clears is genuinely removed), and from the filter-pattern prefill on
 * create. The `type` always comes from the (pipelineType, kind) mapping
 * (P-08(a)). Submission follows official's `IngestionWorkflowForm`
 * submit: `formatAdditionalProperties` drops unfilled `newKey*` map
 * rows, then `cleanWorkFlowData` drops filter-pattern objects with
 * empty includes AND excludes. ElasticSearchReindex pipelines
 * additionally omit the six connection fields official strips on
 * submit.
 */
export function buildSourceConfig({
  pipelineType,
  serviceKind,
  sourceConfigData,
}: {
  pipelineType: PipelineType;
  serviceKind: ServiceKind;
  sourceConfigData: Record<string, unknown>;
}): PipelineSourceConfig {
  // Official clones before formatting (`formatAdditionalProperties(
  // cloneDeep(formData))`): the formatter mutates nested objects, and
  // the form's data must not lose its unfilled rows on submit. The clone
  // is a JSON round-trip, not `structuredClone`: the form data is a Vue
  // reactive object, and `structuredClone` throws DataCloneError on
  // reactive proxies (nested values stay reactive even after `toRaw`,
  // which only unwraps the top level). The data is JSON-shaped by
  // construction (schema defaults + user input), so the round-trip is
  // lossless here and additionally drops undefined-valued keys, which
  // the server must not receive as present keys.
  const data = cleanWorkFlowData(
    formatAdditionalProperties(JSON.parse(JSON.stringify(sourceConfigData)) as Record<string, unknown>),
  );
  if (pipelineType === 'elasticSearchReindex') {
    for (const field of ELASTIC_SEARCH_OMITTED_FIELDS) {
      delete data[field];
    }
  }
  return {
    config: {
      ...data,
      type: sourceConfigTypeForPipeline(pipelineType, serviceKind),
    },
  };
}

export function sourceConfigTypeForKind(kind: ServiceKind): string {
  if (kind === 'messaging') {
    return 'MessagingMetadata';
  }
  if (kind === 'dashboard') {
    return 'DashboardMetadata';
  }
  if (kind === 'storage') {
    return 'StorageMetadata';
  }
  if (kind === 'api') {
    return 'ApiMetadata';
  }
  if (kind === 'mlmodel') {
    return 'MlModelMetadata';
  }
  if (kind === 'search') {
    return 'SearchMetadata';
  }
  if (kind === 'drive') {
    return 'DriveMetadata';
  }
  // M-Next B2: pipeline services (Prefect/Dagster) take PipelineMetadata —
  // official pipelineServiceMetadataPipeline.json's pipelineMetadataConfigType
  // enum is ["PipelineMetadata"] only. The fallthrough used to hard-code
  // 'database' in buildSourceConfig, so every pipeline-service metadata
  // pipeline was built as DatabaseMetadata.
  if (kind === 'pipeline') {
    return 'PipelineMetadata';
  }
  return 'DatabaseMetadata';
}
