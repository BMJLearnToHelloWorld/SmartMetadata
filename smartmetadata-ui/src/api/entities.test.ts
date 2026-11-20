/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { tagsPatch } from '@/governance/assetPatch';
import type { SchemaRow } from '@/types/api';
import { fetchAssetDetail, mapTags, patchAsset, updateSchemaRowTags } from './entities';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('asset entity writes', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads owners, tags, and domains from the wired table GET', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            description: 'Orders fact',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
            domains: [{ id: 'd1', name: 'Marketing', type: 'domain' }],
            columns: [{ name: 'id', dataType: 'BIGINT' }],
            tableType: 'Regular',
            serviceType: 'BigQuery',
            service: { name: 'bq', displayName: 'BigQuery Prod', type: 'databaseService' },
            database: { name: 'analytics' },
            databaseSchema: { name: 'marts' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(asset.id).toBe('tbl-1');
    expect(asset.owners[0]).toMatchObject({ id: 'u1', type: 'user' });
    expect(asset.tags[0]).toMatchObject({ tagFQN: 'PII.Sensitive', source: 'Classification' });
    expect(asset.domains[0]).toMatchObject({ id: 'd1', type: 'domain' });
    expect(asset.tableType).toBe('Regular');
    expect(asset.service?.displayName).toBe('BigQuery Prod');
    expect(asset.database?.name).toBe('analytics');
    expect(asset.databaseSchema?.name).toBe('marts');
    expect(lastFetch().url).toContain('/api/v1/tables/name/');
    expect(lastFetch().url).toContain('domains');
    expect(lastFetch().url).toContain('extension');
    expect(lastFetch().url).toContain('tableType');
  });

  it('nests STRUCT columns with path keys and drops empty nested children', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/tables/name/')) {
          return new Response(
            JSON.stringify({
              id: 'tbl-1',
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              columns: [
                { name: 'id', dataType: 'BIGINT' },
                {
                  name: 'address',
                  dataType: 'STRUCT',
                  children: [
                    { name: 'city', dataType: 'STRING' },
                    { name: 'zip', dataType: 'STRING', children: [] },
                  ],
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(asset.schemaRows).toHaveLength(2);
    expect(asset.schemaRows[0]).toMatchObject({ key: 'id', name: 'id' });
    expect(asset.schemaRows[0]?.children).toBeUndefined();
    expect(asset.schemaRows[1]).toMatchObject({ key: 'address', name: 'address' });
    expect(asset.schemaRows[1]?.children).toHaveLength(2);
    expect(asset.schemaRows[1]?.children?.[0]).toMatchObject({ key: 'address.city', name: 'city' });
    expect(asset.schemaRows[1]?.children?.[1]?.children).toBeUndefined();
  });

  it('maps dashboard charts and pipeline tasks from the wired GETs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dashboards/name/')) {
          return new Response(
            JSON.stringify({
              id: 'dash-1',
              name: 'sales',
              fullyQualifiedName: 'bi.sales',
              project: 'Finance',
              dashboardType: 'Dashboard',
              charts: [{ id: 'c1', name: 'revenue', type: 'chart' }],
              dataModels: [{ name: 'sales_model', type: 'dashboardDataModel' }],
              service: { name: 'superset' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            id: 'pipe-1',
            name: 'daily_etl',
            fullyQualifiedName: 'airflow.daily_etl',
            scheduleInterval: '0 2 * * *',
            state: 'Active',
            tasks: [
              { name: 'extract', displayName: 'Extract', downstreamTasks: ['load'] },
              { name: 'load', downstreamTasks: [] },
            ],
            pipelineStatus: {
              timestamp: 1700000000000,
              executionStatus: 'Successful',
              taskStatus: [{ name: 'extract', executionStatus: 'Successful' }],
            },
            service: { name: 'airflow' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const dashboard = await fetchAssetDetail('dashboard', 'bi.sales');
    expect(dashboard.charts?.[0]).toMatchObject({ name: 'revenue', type: 'chart' });
    expect(dashboard.dataModels?.[0]?.name).toBe('sales_model');
    expect(dashboard.project).toBe('Finance');
    expect(lastFetch().url).toContain('/api/v1/dashboards/name/');
    expect(lastFetch().url).toContain('charts');

    const pipeline = await fetchAssetDetail('pipeline', 'airflow.daily_etl');
    expect(pipeline.tasks).toHaveLength(2);
    expect(pipeline.tasks?.[0]).toMatchObject({ name: 'extract', downstreamTasks: ['load'] });
    expect(pipeline.pipelineStatus?.executionStatus).toBe('Successful');
    expect(pipeline.scheduleInterval).toBe('0 2 * * *');
    expect(lastFetch().url).toContain('/api/v1/pipelines/name/');
    expect(lastFetch().url).toContain('tasks');
    expect(lastFetch().url).toContain('pipelineStatus');
  });

  it('maps container columns, search-index fields, and stored-procedure code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/containers/')) {
          return new Response(
            JSON.stringify({
              id: 'ctr-1',
              name: 'lake',
              fullyQualifiedName: 's3.lake',
              prefix: 'raw/',
              fileFormats: ['parquet'],
              dataModel: { columns: [{ name: 'event_id', dataType: 'STRING' }] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/searchIndexes/')) {
          return new Response(
            JSON.stringify({
              id: 'idx-1',
              name: 'logs',
              fullyQualifiedName: 'os.logs',
              indexType: 'Index',
              fields: [{ name: 'message', dataType: 'TEXT' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            id: 'sp-1',
            name: 'refresh_mart',
            fullyQualifiedName: 'svc.db.schema.refresh_mart',
            storedProcedureType: 'StoredProcedure',
            storedProcedureCode: { language: 'SQL', code: 'SELECT 1' },
            mlFeatures: [{ name: 'ignored' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const container = await fetchAssetDetail('container', 's3.lake');
    expect(container.schemaRows).toEqual([
      { key: 'event_id', name: 'event_id', dataType: 'STRING', indexPath: [0] },
    ]);
    expect(container.prefix).toBe('raw/');
    expect(container.fileFormats).toEqual(['parquet']);

    const index = await fetchAssetDetail('searchIndex', 'os.logs');
    expect(index.schemaRows).toEqual([{ key: 'message', name: 'message', dataType: 'TEXT', indexPath: [0] }]);
    expect(index.indexType).toBe('Index');

    const proc = await fetchAssetDetail('storedProcedure', 'svc.db.schema.refresh_mart');
    expect(proc.storedProcedureCode).toEqual({ language: 'SQL', code: 'SELECT 1' });
    expect(proc.schemaRows).toEqual([]);
  });

  it('maps chart, metric, dashboard data model, database, and schema GETs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/charts/name/')) {
          return new Response(
            JSON.stringify({
              id: 'ch-1',
              name: 'revenue',
              fullyQualifiedName: 'bi.sales.revenue',
              chartType: 'Bar',
              sourceUrl: 'https://bi.example/charts/revenue',
              service: { name: 'superset' },
              dashboards: [{ name: 'sales', type: 'dashboard' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/v1/metrics/name/')) {
          return new Response(
            JSON.stringify({
              id: 'm-1',
              name: 'mau',
              fullyQualifiedName: 'kpi.mau',
              metricType: 'COUNT',
              unitOfMeasurement: 'EVENTS',
              granularity: 'DAY',
              metricExpression: { language: 'SQL', code: 'SELECT COUNT(*) FROM users' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/v1/dashboard/datamodels/name/')) {
          return new Response(
            JSON.stringify({
              id: 'dm-1',
              name: 'sales_model',
              fullyQualifiedName: 'bi.sales.model',
              dataModelType: 'SupersetDataModel',
              project: 'Finance',
              columns: [{ name: 'amount', dataType: 'DECIMAL' }],
              service: { name: 'superset' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/api/v1/databases/name/')) {
          return new Response(
            JSON.stringify({
              id: 'db-1',
              name: 'analytics',
              fullyQualifiedName: 'svc.analytics',
              service: { name: 'svc' },
              databaseSchemas: [{ name: 'marts', type: 'databaseSchema' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            id: 'sch-1',
            name: 'marts',
            fullyQualifiedName: 'svc.analytics.marts',
            service: { name: 'svc' },
            database: { name: 'analytics' },
            tables: [{ name: 'orders', type: 'table' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const chart = await fetchAssetDetail('chart', 'bi.sales.revenue');
    expect(chart.chartType).toBe('Bar');
    expect(chart.children?.[0]).toMatchObject({ name: 'sales', type: 'dashboard' });
    expect(lastFetch().url).toContain('/api/v1/charts/name/');
    expect(lastFetch().url).toContain('dashboards');

    const metric = await fetchAssetDetail('metric', 'kpi.mau');
    expect(metric.metricType).toBe('COUNT');
    expect(metric.unitOfMeasurement).toBe('EVENTS');
    expect(metric.granularity).toBe('DAY');
    expect(metric.storedProcedureCode).toEqual({ language: 'SQL', code: 'SELECT COUNT(*) FROM users' });
    expect(lastFetch().url).toContain('/api/v1/metrics/name/');

    const model = await fetchAssetDetail('dashboardDataModel', 'bi.sales.model');
    expect(model.schemaRows).toEqual([{ key: 'amount', name: 'amount', dataType: 'DECIMAL', indexPath: [0] }]);
    expect(model.dataModelType).toBe('SupersetDataModel');
    expect(model.project).toBe('Finance');
    expect(lastFetch().url).toContain('/api/v1/dashboard/datamodels/name/');

    const database = await fetchAssetDetail('database', 'svc.analytics');
    expect(database.children?.[0]).toMatchObject({ name: 'marts', type: 'databaseSchema' });
    expect(lastFetch().url).toContain('/api/v1/databases/name/');
    expect(lastFetch().url).toContain('databaseSchemas');

    const schema = await fetchAssetDetail('databaseSchema', 'svc.analytics.marts');
    expect(schema.database?.name).toBe('analytics');
    expect(schema.children?.[0]).toMatchObject({ name: 'orders', type: 'table' });
    expect(lastFetch().url).toContain('/api/v1/databaseSchemas/name/');
    expect(lastFetch().url).toContain('tables');
  });

  it('PATCHes a table by id with RFC 6902 json-patch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await patchAsset(
      'table',
      'tbl-1',
      tagsPatch([], [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }]),
    );
    expect(lastFetch().url).toContain('/api/v1/tables/tbl-1');
    expect(lastFetch().init?.method).toBe('PATCH');
    expect((lastFetch().init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    );
  });
});

describe('mapTags labelType', () => {
  it('preserves each of the five pin labelType values', () => {
    for (const labelType of ['Automated', 'Derived', 'Generated', 'Manual', 'Propagated'] as const) {
      expect(
        mapTags([{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType }]),
      ).toEqual([{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType }]);
    }
  });

  it('leaves labelType undefined when the payload omits it', () => {
    const [tag] = mapTags([{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }]);
    expect(tag?.labelType).toBeUndefined();
    expect(tag).toMatchObject({ tagFQN: 'PII.Sensitive', name: 'Sensitive' });
  });

  it('drops labelType values outside the five-value union', () => {
    for (const labelType of ['generated', 'Bogus', '', 42, null]) {
      const [tag] = mapTags([
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', labelType },
      ]);
      expect(tag?.labelType).toBeUndefined();
    }
  });

  it('validates labelType independently of source', () => {
    const [tag] = mapTags([
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Tag', labelType: 'Generated' },
    ]);
    expect(tag?.source).toBeUndefined();
    expect(tag?.labelType).toBe('Generated');
  });

  it('returns no tags for non-array payloads', () => {
    expect(mapTags(undefined)).toEqual([]);
    expect(mapTags(null)).toEqual([]);
    expect(mapTags('PII.Sensitive')).toEqual([]);
  });

  it('preserves the pin label state values and drops the rest', () => {
    for (const state of ['Confirmed', 'Suggested'] as const) {
      const [tag] = mapTags([
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', state },
      ]);
      expect(tag?.state).toBe(state);
    }
    for (const state of ['confirmed', 'Bogus', '', 42, null]) {
      const [tag] = mapTags([
        { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification', state },
      ]);
      expect(tag?.state).toBeUndefined();
    }
  });
});

describe('fetchAssetDetail usage and joins fields', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('requests joins for tables and maps usageSummary plus joins when present', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            deleted: true,
            usageSummary: { weeklyStats: { count: 20, percentileRank: 45 } },
            joins: {
              columnJoins: [
                { columnName: 'id', joinedWith: [{ fullyQualifiedName: 'svc.db.schema.customers.id', joinCount: 3 }] },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(urls[0]).toContain('joins');
    expect(urls[0]).not.toContain('usageSummary');
    expect(asset.usageSummary?.weeklyStats?.percentileRank).toBe(45);
    expect(asset.joins?.columnJoins).toHaveLength(1);
    expect(asset.deleted).toBe(true);
  });

  it('appends gated extra fields without duplicating the base set', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({ id: 'tbl-1', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    await fetchAssetDetail('table', 'svc.db.schema.orders', { extraFields: ['usageSummary', 'joins'] });
    const fields = new URL(urls[0] as string).searchParams.get('fields') ?? '';
    expect(fields.split(',')).toContain('usageSummary');
    expect(fields.split(',').filter((field) => field === 'joins')).toHaveLength(1);
  });

  it('requests testSuite for tables and maps it plus metric relatedMetrics', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            testSuite: { id: 'suite-1', name: 'orders-suite', fullyQualifiedName: 'svc.db.schema.orders', type: 'testSuite' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(new URL(urls[0] as string).searchParams.get('fields')?.split(',')).toContain('testSuite');
    expect(asset.testSuite?.id).toBe('suite-1');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({
            id: 'm1',
            name: 'mau',
            fullyQualifiedName: 'kpi.mau',
            relatedMetrics: [{ id: 'm2', name: 'dau', fullyQualifiedName: 'kpi.dau', type: 'metric' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const metric = await fetchAssetDetail('metric', 'kpi.mau');
    expect(new URL(urls[1] as string).searchParams.get('fields')?.split(',')).toContain('relatedMetrics');
    expect(metric.relatedMetrics?.map((ref) => ref.id)).toEqual(['m2']);
  });
});

describe('D-F2 schema rows', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps column tags, FQN and index paths through the table mapping, including nested STRUCT children', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'tbl-1',
            name: 'orders',
            fullyQualifiedName: 'svc.db.schema.orders',
            columns: [
              {
                name: 'address',
                dataType: 'STRUCT',
                fullyQualifiedName: 'svc.db.schema.orders.address',
                tags: [{ tagFQN: 'PII.Address', name: 'Address', source: 'Classification', labelType: 'Generated' }],
                children: [
                  {
                    name: 'city',
                    dataType: 'STRING',
                    fullyQualifiedName: 'svc.db.schema.orders.address.city',
                    tags: [{ tagFQN: 'Glossary.City', name: 'City', source: 'Glossary', labelType: 'Manual' }],
                  },
                ],
              },
              { name: 'id', dataType: 'BIGINT', fullyQualifiedName: 'svc.db.schema.orders.id' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const asset = await fetchAssetDetail('table', 'svc.db.schema.orders');
    expect(asset.schemaRows).toHaveLength(2);
    expect(asset.schemaRows[0]).toMatchObject({
      key: 'address',
      fullyQualifiedName: 'svc.db.schema.orders.address',
      indexPath: [0],
    });
    expect(asset.schemaRows[0].tags).toEqual([
      { tagFQN: 'PII.Address', name: 'Address', source: 'Classification', labelType: 'Generated' },
    ]);
    expect(asset.schemaRows[0].children).toHaveLength(1);
    expect(asset.schemaRows[0].children?.[0]).toMatchObject({
      key: 'address.city',
      fullyQualifiedName: 'svc.db.schema.orders.address.city',
      indexPath: [0, 0],
    });
    expect(asset.schemaRows[0].children?.[0].tags).toEqual([
      { tagFQN: 'Glossary.City', name: 'City', source: 'Glossary', labelType: 'Manual' },
    ]);
    expect(asset.schemaRows[1].tags).toBeUndefined();
    expect(asset.schemaRows[1].indexPath).toEqual([1]);
  });

  it('replaces only the targeted row tags, at any nesting depth', () => {
    const rows: SchemaRow[] = [
      {
        key: 'address',
        name: 'address',
        dataType: 'STRUCT',
        tags: [{ tagFQN: 'PII.Address', name: 'Address', source: 'Classification' as const }],
        children: [
          { key: 'address.city', name: 'city', dataType: 'STRING', indexPath: [0, 0] },
        ],
        indexPath: [0],
      },
      { key: 'id', name: 'id', dataType: 'BIGINT', indexPath: [1] },
    ];
    const next = updateSchemaRowTags(rows, 'address.city', [
      { tagFQN: 'Glossary.City', name: 'City', source: 'Glossary' as const },
    ]);
    expect(next[0].tags).toEqual([{ tagFQN: 'PII.Address', name: 'Address', source: 'Classification' }]);
    expect(next[0].children?.[0].tags).toEqual([{ tagFQN: 'Glossary.City', name: 'City', source: 'Glossary' }]);
    expect(next[1].tags).toBeUndefined();
    // The input rows are untouched: the update returns new rows.
    expect(rows[0].children?.[0].tags).toBeUndefined();
  });
});
