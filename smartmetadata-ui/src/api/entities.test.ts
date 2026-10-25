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
import { fetchAssetDetail, patchAsset } from './entities';

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
    expect(container.schemaRows).toEqual([{ name: 'event_id', dataType: 'STRING' }]);
    expect(container.prefix).toBe('raw/');
    expect(container.fileFormats).toEqual(['parquet']);

    const index = await fetchAssetDetail('searchIndex', 'os.logs');
    expect(index.schemaRows).toEqual([{ name: 'message', dataType: 'TEXT' }]);
    expect(index.indexType).toBe('Index');

    const proc = await fetchAssetDetail('storedProcedure', 'svc.db.schema.refresh_mart');
    expect(proc.storedProcedureCode).toEqual({ language: 'SQL', code: 'SELECT 1' });
    expect(proc.schemaRows).toEqual([]);
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
