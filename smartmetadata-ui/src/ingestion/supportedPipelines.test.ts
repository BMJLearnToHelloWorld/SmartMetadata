/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  PIPELINE_TYPES,
  type CatalogService,
  type ServiceConnectionConfig,
  type ServiceKind,
} from '@/types/ingestion';
import {
  getAgentMenuItems,
  getIngestionTypes,
  getSupportedPipelineTypes,
} from './supportedPipelines';

function serviceWith(
  config: ServiceConnectionConfig | undefined,
  overrides: Partial<CatalogService> = {},
): CatalogService {
  return {
    id: 'svc-1',
    name: 'svc',
    kind: 'database',
    serviceType: 'Postgres',
    connection: config === undefined ? undefined : { config },
    ...overrides,
  };
}

describe('PIPELINE_TYPES', () => {
  it('exposes the OM PipelineType enum surface used by Agents UX', () => {
    expect(PIPELINE_TYPES).toEqual([
      'application',
      'autoClassification',
      'dataInsight',
      'dbt',
      'elasticSearchReindex',
      'lineage',
      'metadata',
      'policyAgent',
      'profiler',
      'reverseMetadata',
      'TestSuite',
      'usage',
    ]);
  });
});

describe('getSupportedPipelineTypes (official flag-driven mapping)', () => {
  it('returns nothing for Spark services', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith({ supportsMetadataExtraction: true }, { serviceType: 'Spark' }),
      ),
    ).toEqual([]);
  });

  it('offers metadata only when the connection config is undefined', () => {
    expect(getSupportedPipelineTypes(serviceWith(undefined))).toEqual(['metadata']);
    expect(getSupportedPipelineTypes(serviceWith(undefined, { connection: undefined }))).toEqual([
      'metadata',
    ]);
    expect(getSupportedPipelineTypes(null)).toEqual(['metadata']);
    expect(getSupportedPipelineTypes(undefined)).toEqual(['metadata']);
  });

  it('offers nothing for a defined-but-empty config', () => {
    expect(getSupportedPipelineTypes(serviceWith({}))).toEqual([]);
  });

  it('maps every flag to its kinds in the pin iteration order', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith({
          supportsMetadataExtraction: true,
          supportsUsageExtraction: true,
          supportsLineageExtraction: true,
          supportsViewLineageExtraction: true,
          supportsProfiler: true,
          supportsDBTExtraction: true,
          supportsDataInsightExtraction: true,
          supportsElasticSearchReindexingExtraction: true,
        }),
      ),
    ).toEqual([
      'metadata',
      'usage',
      'lineage',
      'profiler',
      'autoClassification',
      'dbt',
      'dataInsight',
      'elasticSearchReindex',
    ]);
  });

  it('dedupes lineage offered by both lineage flags, keeping the first position', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith({
          supportsLineageExtraction: true,
          supportsViewLineageExtraction: true,
        }),
      ),
    ).toEqual(['lineage']);
  });

  it('yields autoClassification alone for storage/messaging services with profiler support', () => {
    const config = { supportsMetadataExtraction: true, supportsProfiler: true };
    expect(getSupportedPipelineTypes(serviceWith(config, { kind: 'storage' }))).toEqual([
      'metadata',
      'autoClassification',
    ]);
    expect(
      getSupportedPipelineTypes(
        serviceWith(config, { kind: 'messaging', serviceType: 'Kafka' }),
      ),
    ).toEqual(['metadata', 'autoClassification']);
    expect(
      getSupportedPipelineTypes(serviceWith(config), 'storage' as ServiceKind),
    ).toEqual(['metadata', 'autoClassification']);
  });

  it('yields profiler plus autoClassification on database services with profiler support', () => {
    expect(
      getSupportedPipelineTypes(serviceWith({ supportsProfiler: true })),
    ).toEqual(['profiler', 'autoClassification']);
  });

  it('omits usage when the connection does not declare usage extraction', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith(
          {
            supportsMetadataExtraction: true,
            supportsLineageExtraction: true,
            supportsProfiler: true,
            supportsDBTExtraction: true,
          },
          { serviceType: 'Doris' },
        ),
      ),
    ).toEqual(['metadata', 'lineage', 'profiler', 'autoClassification', 'dbt']);
  });

  it('offers dataInsight and elasticSearchReindex only where the flags declare them', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith(
          {
            supportsMetadataExtraction: true,
            supportsDataInsightExtraction: true,
            supportsElasticSearchReindexingExtraction: true,
          },
          { serviceType: 'OpenMetadata', kind: 'metadata' },
        ),
      ),
    ).toEqual(['metadata', 'dataInsight', 'elasticSearchReindex']);
    expect(
      getSupportedPipelineTypes(serviceWith({ supportsMetadataExtraction: true })),
    ).not.toContain('dataInsight');
  });

  it('never offers TestSuite, application, policyAgent, or reverseMetadata', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith({
          supportsMetadataExtraction: true,
          supportsUsageExtraction: true,
          supportsLineageExtraction: true,
          supportsProfiler: true,
          supportsDBTExtraction: true,
          supportsDataInsightExtraction: true,
          supportsElasticSearchReindexingExtraction: true,
        }),
      ),
    ).toEqual(
      expect.not.arrayContaining(['TestSuite', 'application', 'policyAgent', 'reverseMetadata']),
    );
  });

  it('treats falsy flags as not offered', () => {
    expect(
      getSupportedPipelineTypes(
        serviceWith({
          supportsMetadataExtraction: false,
          supportsUsageExtraction: undefined,
        }),
      ),
    ).toEqual([]);
  });
});

describe('getIngestionTypes (one-Usage rule)', () => {
  it('keeps usage when no usage pipeline exists', () => {
    expect(getIngestionTypes(['metadata', 'usage'], [])).toEqual(['metadata', 'usage']);
    expect(getIngestionTypes(['metadata', 'usage'], [{ pipelineType: 'metadata' }])).toEqual([
      'metadata',
      'usage',
    ]);
  });

  it('removes usage once a usage pipeline exists', () => {
    expect(
      getIngestionTypes(['metadata', 'usage', 'lineage'], [{ pipelineType: 'usage' }]),
    ).toEqual(['metadata', 'lineage']);
  });

  it('restricts to one type when a pipelineType is given', () => {
    expect(getIngestionTypes(['metadata', 'usage'], [], 'usage')).toEqual(['usage']);
    expect(getIngestionTypes(['metadata', 'usage'], [{ pipelineType: 'usage' }], 'usage')).toEqual(
      [],
    );
  });
});

describe('getAgentMenuItems', () => {
  it('maps kinds to menu items with agent-item test ids', () => {
    expect(getAgentMenuItems(['metadata', 'usage'], false)).toEqual([
      { key: 'metadata', disabled: false, testId: 'agent-item-metadata' },
      { key: 'usage', disabled: false, testId: 'agent-item-usage' },
    ]);
  });

  it('disables dataInsight only once one exists', () => {
    expect(getAgentMenuItems(['dataInsight', 'metadata'], false)).toEqual([
      { key: 'dataInsight', disabled: false, testId: 'agent-item-dataInsight' },
      { key: 'metadata', disabled: false, testId: 'agent-item-metadata' },
    ]);
    expect(getAgentMenuItems(['dataInsight', 'metadata'], true)).toEqual([
      { key: 'dataInsight', disabled: true, testId: 'agent-item-dataInsight' },
      { key: 'metadata', disabled: false, testId: 'agent-item-metadata' },
    ]);
  });
});
