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
import type { AssetDetail, SearchHit } from '@/types/api';
import {
  buildPreviewOverviewRows,
  previewLayoutFor,
  previewPermissionTarget,
  type PreviewOverviewInput,
} from './previewOverview';

const t = (key: string): string => {
  if (key === 'usage.ordinalSuffixTh') {
    return 'th';
  }
  if (key === 'usage.pctile') {
    return 'pctile';
  }
  return key;
};

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
    ...overrides,
  };
}

function detail(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    entityType: 'table',
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: 'Columns',
    ...overrides,
  };
}

function rows(input: PreviewOverviewInput) {
  return buildPreviewOverviewRows(input, t);
}

function keys(input: PreviewOverviewInput) {
  return rows(input).map((row) => row.key);
}

describe('buildPreviewOverviewRows (pin explore-visible builders)', () => {
  it('table in explore mode shows only Type / Queries / Columns / Incidents', () => {
    const result = rows({
      hit: hit(),
      detail: detail({ tableType: 'Regular', schemaRows: [{ key: 'a', name: 'a', dataType: 'int' }] }),
      queryCount: 3,
      incidentCount: 2,
    });
    expect(keys({ hit: hit(), detail: detail(), queryCount: 3, incidentCount: 2 })).toEqual([
      'type',
      'queries',
      'columns',
      'incidents',
    ]);
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      type: 'Regular',
      queries: '3',
      columns: '1',
      incidents: '2',
    });
  });

  it('table omits Queries / Incidents while their counts are still loading', () => {
    expect(keys({ hit: hit(), detail: detail() })).toEqual(['type', 'columns']);
  });

  it('table shows "No queries" at a zero count (pin QueryCount)', () => {
    const result = rows({ hit: hit(), detail: detail(), queryCount: 0, incidentCount: 0 });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      queries: 'explore.noQueries',
      incidents: '0',
    });
  });

  it('table Incidents row links to the detail-page profiler tab (pin EntityTabs.PROFILER)', () => {
    const result = rows({ hit: hit(), detail: detail(), queryCount: 0, incidentCount: 2 });
    const incidents = result.find((row) => row.key === 'incidents');
    expect(incidents?.to).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
      query: { tab: 'profiler' },
    });
  });

  it('table without a fetched detail shows a dash for columns (pin NO_DATA)', () => {
    const result = rows({ hit: hit(), detail: null, queryCount: 1, incidentCount: 0 });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      columns: '-',
    });
  });

  it('tableColumn reads the search hit (pin: no fetch entry, search data as-is)', () => {
    const result = rows({
      hit: hit({
        entityType: 'tableColumn',
        fullyQualifiedName: 'svc.db.schema.orders.customer_id',
        dataType: 'varchar(50)',
        tableName: 'orders',
        tableFqn: 'svc.db.schema.orders',
        serviceName: 'BigQuery Prod',
        databaseName: 'analytics',
        schemaName: 'marts',
        constraint: 'PRIMARY_KEY',
      }),
      detail: null,
    });
    expect(keys({ hit: hit({ entityType: 'tableColumn', constraint: 'PRIMARY_KEY' }), detail: null })).toEqual([
      'dataType',
      'table',
      'service',
      'database',
      'schema',
      'constraint',
    ]);
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      dataType: 'varchar(50)',
      table: 'orders',
      service: 'BigQuery Prod',
      constraint: 'PRIMARY_KEY',
    });
    expect(result.find((row) => row.key === 'table')?.to).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('tableColumn omits the constraint row when the hit carries none (pin conditional)', () => {
    expect(
      keys({ hit: hit({ entityType: 'tableColumn', dataType: 'int' }), detail: null }),
    ).toEqual(['dataType', 'table', 'service', 'database', 'schema']);
  });

  it('topic shows partitions / replication / retention / cleanup / max size / schema type', () => {
    const result = rows({
      hit: hit({ entityType: 'topic', fullyQualifiedName: 'kafka.events' }),
      detail: detail({
        entityType: 'topic',
        partitions: 6,
        replicationFactor: 3,
        retentionSize: 1024,
        cleanupPolicies: ['delete', 'compact'],
        maximumMessageSize: 2048,
        messageSchemaType: 'Avro',
      }),
    });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      // Row values are display strings (PreviewOverviewRow.value: string),
      // so counts render as decimal text, like the byte sizes beside them.
      partitions: '6',
      replicationFactor: '3',
      retentionSize: '1.00 KB',
      cleanupPolicies: 'delete, compact',
      maxMessageSize: '2.00 KB',
      schemaType: 'Avro',
    });
  });

  it('searchIndex has no explore-visible rows (both pin rows are lineage-only)', () => {
    expect(rows({ hit: hit({ entityType: 'searchIndex' }), detail: detail() })).toEqual([]);
  });

  it('types without a builder get no overview rows', () => {
    for (const entityType of ['glossaryTerm', 'tag', 'dataProduct', 'domain', 'query', 'user']) {
      expect(rows({ hit: hit({ entityType }), detail: null })).toEqual([]);
    }
  });

  it('database shows Owners / Tier / Service / Usage from the fetched detail', () => {
    const result = rows({
      hit: hit({ entityType: 'database', fullyQualifiedName: 'svc.analytics' }),
      detail: detail({
        entityType: 'database',
        owners: [{ name: 'data-eng', displayName: 'Data Eng' }],
        tags: [{ tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' }],
        service: { name: 'svc', displayName: 'BigQuery Prod' },
        usageSummary: { weeklyStats: { count: 20, percentileRank: 45 } },
      }),
    });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      owners: 'Data Eng',
      tier: 'Tier1',
      service: 'BigQuery Prod',
      usage: ' 45th pctile',
    });
  });

  it('pipeline URL row links out only when a source URL exists', () => {
    const withUrl = rows({
      hit: hit({ entityType: 'pipeline', fullyQualifiedName: 'airflow.etl' }),
      detail: detail({ entityType: 'pipeline', displayName: 'ETL', sourceUrl: 'https://example.invalid/etl' }),
    });
    expect(withUrl[0]).toMatchObject({ key: 'pipelineUrl', value: 'ETL', href: 'https://example.invalid/etl' });
    const withoutUrl = rows({
      hit: hit({ entityType: 'pipeline', fullyQualifiedName: 'airflow.etl' }),
      detail: detail({ entityType: 'pipeline' }),
    });
    expect(withoutUrl[0]).toMatchObject({ key: 'pipelineUrl', value: 'orders' });
    expect(withoutUrl[0].href).toBeUndefined();
  });

  it('storedProcedure derives the schema from the FQN and omits Language without code', () => {
    const result = rows({
      hit: hit({ entityType: 'storedProcedure', fullyQualifiedName: 'svc.db.schema.proc' }),
      detail: detail({ entityType: 'storedProcedure' }),
    });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      schema: 'schema',
    });
    expect(keys({ hit: hit({ entityType: 'storedProcedure', fullyQualifiedName: 'svc.db.schema.proc' }), detail: null })).not.toContain('language');
    const withCode = rows({
      hit: hit({ entityType: 'storedProcedure', fullyQualifiedName: 'svc.db.schema.proc' }),
      detail: detail({ entityType: 'storedProcedure', storedProcedureCode: { language: 'SQL' } }),
    });
    expect(withCode.find((row) => row.key === 'language')?.value).toBe('SQL');
  });

  it('metric shows type / unit / granularity', () => {
    const result = rows({
      hit: hit({ entityType: 'metric', fullyQualifiedName: 'biz.m1' }),
      detail: detail({
        entityType: 'metric',
        metricType: 'Count',
        unitOfMeasurement: 'rows',
        granularity: 'daily',
      }),
    });
    expect(Object.fromEntries(result.map((row) => [row.key, row.value]))).toMatchObject({
      metricType: 'Count',
      unitOfMeasurement: 'rows',
      granularity: 'daily',
    });
  });
});

describe('previewLayoutFor (pin DataAssetSummaryPanelV1 layouts)', () => {
  it('maps knowledge page, data product, misc, and common types', () => {
    expect(previewLayoutFor('page')).toBe('knowledgePage');
    expect(previewLayoutFor('dataProduct')).toBe('dataProduct');
    expect(previewLayoutFor('user')).toBe('misc');
    expect(previewLayoutFor('team')).toBe('misc');
    expect(previewLayoutFor('table')).toBe('common');
    expect(previewLayoutFor('glossaryTerm')).toBe('common');
  });
});

describe('previewPermissionTarget (pin permission precedence)', () => {
  it('prefers by-id, falls back to by-FQN', () => {
    expect(previewPermissionTarget(hit({ id: 't1' }))).toEqual({
      resource: 'table',
      identifier: { id: 't1' },
    });
    expect(previewPermissionTarget(hit())).toEqual({
      resource: 'table',
      identifier: 'svc.db.schema.orders',
    });
  });

  it('gates a column on its parent table by FQN', () => {
    expect(
      previewPermissionTarget(
        hit({ entityType: 'tableColumn', tableFqn: 'svc.db.schema.orders', fullyQualifiedName: 'svc.db.schema.orders.id' }),
      ),
    ).toEqual({ resource: 'table', identifier: 'svc.db.schema.orders' });
  });

  it('leaves types outside the ResourceEntity union ungated', () => {
    expect(previewPermissionTarget(hit({ entityType: 'workflowDefinition' }))).toBeNull();
  });
});
