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
import { reactive } from 'vue';
import {
  buildSourceConfig,
  sourceConfigTypeForKind,
  sourceConfigTypeForPipeline,
} from './sourceConfig';

// The per-kind hand-written branches (includeViews / includeSchemas /
// includeTopics / ...) are superseded by the schema-driven form
// (P-08(d)): buildSourceConfig now takes the form data — the
// sourceConfig.config object itself — and only the type mapping, the
// empty-filter-pattern cleanup, the unfilled-map-row cleanup, and the
// ElasticSearch submit-time omit remain. The prefill
// (getDefaultFilterPropertyValues) lives in ingestionSchemas.ts and is
// tested there.
describe('pipeline sourceConfig', () => {
  it('maps database pipelines to DatabaseMetadata', () => {
    expect(
      buildSourceConfig({ pipelineType: 'metadata', serviceKind: 'database', sourceConfigData: {} }),
    ).toEqual({ config: { type: 'DatabaseMetadata' } });
  });

  it('maps lineage/usage/profiler/TestSuite/dbt pipelineTypes to OM config types', () => {
    const cases: Array<[string, string, string]> = [
      ['lineage', 'database', 'DatabaseLineage'],
      ['usage', 'database', 'DatabaseUsage'],
      ['profiler', 'database', 'Profiler'],
      ['TestSuite', 'database', 'TestSuite'],
      ['dbt', 'database', 'DBT'],
      ['autoClassification', 'database', 'AutoClassification'],
      ['dataInsight', 'database', 'dataInsight'],
      ['elasticSearchReindex', 'database', 'MetadataToElasticSearch'],
    ];
    for (const [pipelineType, kind, type] of cases) {
      expect(
        buildSourceConfig({
          pipelineType: pipelineType as 'metadata',
          serviceKind: kind as 'database',
          sourceConfigData: {},
        }),
      ).toEqual({ config: { type } });
    }
  });

  it('maps api/mlmodel/search/drive/pipeline kinds to their own metadata config types (P-08a)', () => {
    expect(sourceConfigTypeForKind('api')).toBe('ApiMetadata');
    expect(sourceConfigTypeForKind('mlmodel')).toBe('MlModelMetadata');
    expect(sourceConfigTypeForKind('search')).toBe('SearchMetadata');
    expect(sourceConfigTypeForKind('drive')).toBe('DriveMetadata');
    expect(sourceConfigTypeForKind('pipeline')).toBe('PipelineMetadata');
    expect(sourceConfigTypeForPipeline('metadata', 'api')).toBe('ApiMetadata');
  });

  it('passes the whole form data through — every schema field, not just the old seven', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'metadata',
        serviceKind: 'database',
        sourceConfigData: {
          includeViews: false,
          includeTables: true,
          threads: 4,
          schemaFilterPattern: { includes: ['public'], excludes: ['^tmp_.*$'] },
          tableFilterPattern: { includes: ['^fact_.*$'], excludes: [] },
          queryLogDuration: 7,
        },
      }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        includeViews: false,
        includeTables: true,
        threads: 4,
        schemaFilterPattern: { includes: ['public'], excludes: ['^tmp_.*$'] },
        tableFilterPattern: { includes: ['^fact_.*$'], excludes: [] },
        queryLogDuration: 7,
      },
    });
  });

  it('drops filter-pattern objects with empty includes AND excludes (cleanWorkFlowData)', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'metadata',
        serviceKind: 'database',
        sourceConfigData: {
          includeViews: true,
          schemaFilterPattern: { includes: [], excludes: [] },
          tableFilterPattern: { includes: ['^fact_.*$'], excludes: [] },
        },
      }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        includeViews: true,
        tableFilterPattern: { includes: ['^fact_.*$'], excludes: [] },
      },
    });
  });

  it('drops unfilled newKey map rows (formatAdditionalProperties)', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'metadata',
        serviceKind: 'database',
        sourceConfigData: {
          ownerConfig: { database: { sales: 'alice@example.com', newKey1: {} } },
        },
      }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        ownerConfig: { database: { sales: 'alice@example.com' } },
      },
    });
  });

  it('keeps keys the form does not model (the P-07 edit guarantee)', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'metadata',
        serviceKind: 'database',
        sourceConfigData: {
          includeViews: true,
          someFutureKey: { nested: true },
        },
      }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        includeViews: true,
        someFutureKey: { nested: true },
      },
    });
  });

  it('omits the six ElasticSearch-connection fields for elasticSearchReindex', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'elasticSearchReindex',
        serviceKind: 'database',
        sourceConfigData: {
          useSSL: true,
          verifyCerts: true,
          timeout: 30,
          caCerts: 'cert',
          useAwsCredentials: true,
          regionName: 'us-east-1',
          batchSize: 100,
        },
      }),
    ).toEqual({
      config: { type: 'MetadataToElasticSearch', batchSize: 100 },
    });
  });

  it('clones Vue reactive form data without throwing (DataCloneError)', () => {
    // The form data is a Vue reactive object. `structuredClone` throws
    // DataCloneError on reactive proxies, which killed the create/edit
    // submit before the request was even built; the clone must be a
    // JSON round-trip instead.
    const data = reactive({
      includeViews: true,
      schemaFilterPattern: { includes: ['public'], excludes: [] },
    });
    expect(
      buildSourceConfig({ pipelineType: 'metadata', serviceKind: 'database', sourceConfigData: data }),
    ).toEqual({
      config: {
        type: 'DatabaseMetadata',
        includeViews: true,
        schemaFilterPattern: { includes: ['public'], excludes: [] },
      },
    });
    // The form's data is untouched by the submit-time formatting.
    expect(data.schemaFilterPattern).toEqual({ includes: ['public'], excludes: [] });
  });

  it('carries excludes for every filter field (P-08(b))', () => {
    expect(
      buildSourceConfig({
        pipelineType: 'metadata',
        serviceKind: 'messaging',
        sourceConfigData: {
          topicFilterPattern: { includes: [], excludes: ['^internal_.*$'] },
        },
      }),
    ).toEqual({
      config: {
        type: 'MessagingMetadata',
        topicFilterPattern: { includes: [], excludes: ['^internal_.*$'] },
      },
    });
  });
});
