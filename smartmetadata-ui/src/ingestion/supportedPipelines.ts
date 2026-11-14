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
  CatalogService,
  PipelineType,
  ServiceConnectionConfig,
  ServiceKind,
} from '@/types/ingestion';

/**
 * The single source of addable agent kinds, ported from official
 * utils/IngestionConfigUtils.ts `getSupportedPipelineTypes` /
 * `getIngestionTypes` (openmetadata-ui, pin a3012259ca). The kinds
 * come from the service connection's `supports*` flags — never from a
 * per-service-type table (ADR:2026-11-14-autopilot-agents-ui-parity).
 * TestSuite, application, policyAgent and reverseMetadata are never
 * offered from a service surface; the TestSuite-flow entry lives on
 * the TestSuite page instead.
 */

/**
 * Official flag → pipeline-type mapping, in the pin's iteration order
 * (the object literal's insertion order IS the menu order; `uniq`
 * keeps the first occurrence). `supportsProfiler` yields profiler +
 * autoClassification, except on storage/messaging services, where it
 * yields autoClassification alone.
 */
const PIPELINE_TYPES_BY_SUPPORT_FLAG: Record<string, readonly PipelineType[]> = {
  supportsMetadataExtraction: ['metadata'],
  supportsUsageExtraction: ['usage'],
  supportsLineageExtraction: ['lineage'],
  supportsViewLineageExtraction: ['lineage'],
  supportsProfiler: ['profiler', 'autoClassification'],
  supportsDBTExtraction: ['dbt'],
  supportsDataInsightExtraction: ['dataInsight'],
  supportsElasticSearchReindexingExtraction: ['elasticSearchReindex'],
};

export function getSupportedPipelineTypes(
  service: CatalogService | null | undefined,
  kind?: ServiceKind,
): PipelineType[] {
  const config: ServiceConnectionConfig | undefined = service?.connection?.config;

  // Official PipelineServiceType.Spark: Spark services offer no agents.
  if (service?.serviceType === 'Spark') {
    return [];
  }

  if (config === undefined) {
    return ['metadata'];
  }

  const effectiveKind = kind ?? service?.kind;
  const pipelineTypes: PipelineType[] = [];
  for (const flag of Object.keys(PIPELINE_TYPES_BY_SUPPORT_FLAG)) {
    if (config[flag]) {
      let types = PIPELINE_TYPES_BY_SUPPORT_FLAG[flag];
      if (
        flag === 'supportsProfiler' &&
        (effectiveKind === 'storage' || effectiveKind === 'messaging')
      ) {
        types = ['autoClassification'];
      }
      pipelineTypes.push(...types);
    }
  }
  // Official `uniq`: first occurrence wins, so a lineage offered by two
  // flags keeps the earlier position.
  return [...new Set(pipelineTypes)];
}

/**
 * Official `getIngestionTypes`: an explicit `pipelineType` restricts
 * the list to that one type; otherwise at most ONE usage pipeline is
 * offered — the usage kind is removed once one exists.
 */
export function getIngestionTypes(
  supportedPipelineTypes: readonly PipelineType[],
  ingestionList: readonly { pipelineType?: string }[],
  pipelineType?: PipelineType,
): PipelineType[] {
  const pipelineTypeArray = pipelineType === undefined ? supportedPipelineTypes : [pipelineType];
  return pipelineTypeArray.filter(
    (current) =>
      // Prevent adding multiple usage pipeline
      !(
        current === 'usage' &&
        ingestionList.some((item) => item.pipelineType === current)
      ),
  );
}

export interface AgentMenuItem {
  key: PipelineType;
  disabled: boolean;
  testId: string;
}

/**
 * Official utils/IngestionUtils.ts `getMenuItems`, minus the labels:
 * the component localizes each item ("Add X Agent") from the fork's
 * pipeline-type labels. A dataInsight item is disabled once one
 * exists; every other kind stays enabled.
 */
export function getAgentMenuItems(
  types: readonly PipelineType[],
  isDataInsightIngestionExists: boolean,
): AgentMenuItem[] {
  return types.map((type) => ({
    key: type,
    disabled: type === 'dataInsight' ? isDataInsightIngestionExists : false,
    testId: `agent-item-${type}`,
  }));
}
