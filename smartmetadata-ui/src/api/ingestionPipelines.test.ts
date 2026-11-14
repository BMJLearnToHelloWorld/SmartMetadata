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
import {
  createIngestionPipeline,
  deleteIngestionPipeline,
  downloadIngestionPipelineLogs,
  getIngestionPipeline,
  getIngestionPipelineByFqn,
  getIngestionPipelineLogs,
  getOrchestratorStatus,
  killIngestionPipeline,
  listIngestionPipelines,
  listPipelineStatuses,
  toggleIngestionPipeline,
  updateIngestionPipeline,
} from './ingestionPipelines';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('ingestionPipelines API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists pipelines from GET /v1/services/ingestionPipelines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                pipelineType: 'metadata',
                service: { id: 's1', type: 'databaseService', name: 'warehouse' },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listIngestionPipelines({ limit: 50 });
    expect(page.data[0]?.name).toBe('warehouse-metadata');
    expect(page.data[0]?.service?.name).toBe('warehouse');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines');
  });

  it('creates a pipeline with schema-required name, service, pipelineType, sourceConfig, airflowConfig', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'warehouse-metadata',
          pipelineType: 'metadata',
          service: { id: 's1', type: 'databaseService' },
          sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
        });
        // The client passes airflowConfig through, and the born-unpaused
        // shape carries no pausePipeline key (spec default false).
        expect('pausePipeline' in (body.airflowConfig as Record<string, unknown>)).toBe(false);
        return new Response(JSON.stringify({ id: 'p1', name: 'warehouse-metadata', pipelineType: 'metadata' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createIngestionPipeline({
      name: 'warehouse-metadata',
      pipelineType: 'metadata',
      service: { id: 's1', type: 'databaseService' },
      sourceConfig: { config: { type: 'DatabaseMetadata', includeViews: true } },
      airflowConfig: {},
    });
    expect(created.id).toBe('p1');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates through PATCH /v1/services/ingestionPipelines/{id} with JSON Patch ops (P-07)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'p1', name: 'warehouse-metadata', pipelineType: 'metadata' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateIngestionPipeline('p1', [{ op: 'replace', path: '/displayName', value: 'Warehouse v2' }]);
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/p1');
    expect(lastFetch().init?.method).toBe('PATCH');
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual([
      { op: 'replace', path: '/displayName', value: 'Warehouse v2' },
    ]);
  });

  it('loads a pipeline by FQN from GET /v1/services/ingestionPipelines/name/{fqn} (P-22)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'p9',
            name: 'generated-uuid',
            fullyQualifiedName: 'orders_suite.generated-uuid',
            pipelineType: 'TestSuite',
            service: { id: 'suite1', type: 'testSuite' },
            owners: [{ id: 'o1', type: 'user', name: 'owner1' }],
            loggerLevel: 'DEBUG',
            raiseOnError: false,
            airflowConfig: { scheduleInterval: '0 0 * * *', retries: 2 },
            sourceConfig: { config: { type: 'TestSuite', testCases: ['row_count'] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const pipeline = await getIngestionPipelineByFqn('orders_suite.generated-uuid');
    expect(lastFetch().url).toContain(
      '/api/v1/services/ingestionPipelines/name/orders_suite.generated-uuid',
    );
    expect(lastFetch().init?.method ?? 'GET').toBe('GET');
    expect(lastFetch().url).toContain('fields=owners%2CpipelineStatuses');
    expect(pipeline.id).toBe('p9');
    expect(pipeline.owners).toEqual([{ id: 'o1', type: 'user', name: 'owner1' }]);
    expect(pipeline.loggerLevel).toBe('DEBUG');
    expect(pipeline.raiseOnError).toBe(false);
    expect(pipeline.airflowConfig?.retries).toBe(2);
    expect(pipeline.sourceConfig?.config?.testCases).toEqual(['row_count']);
  });

  it('loads owners, raiseOnError and retries on the single-pipeline GET (P-07)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'p1',
            name: 'warehouse-metadata',
            pipelineType: 'metadata',
            owners: [{ id: 'o1', type: 'user', name: 'owner1' }],
            raiseOnError: true,
            airflowConfig: { scheduleInterval: '0 0 * * *', retries: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const pipeline = await getIngestionPipeline('p1');
    expect(lastFetch().url).toContain('fields=owners%2CpipelineStatuses');
    expect(pipeline.owners).toEqual([{ id: 'o1', type: 'user', name: 'owner1' }]);
    expect(pipeline.raiseOnError).toBe(true);
    expect(pipeline.airflowConfig?.retries).toBe(3);
  });

  it('toggles a pipeline through POST /v1/services/ingestionPipelines/toggleIngestion/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'p1',
            name: 'warehouse-metadata',
            pipelineType: 'metadata',
            enabled: false,
            deployed: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const toggled = await toggleIngestionPipeline('p1');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/toggleIngestion/p1');
    expect(lastFetch().init?.method).toBe('POST');
    expect(toggled.id).toBe('p1');
    expect(toggled.enabled).toBe(false);
  });

  it('reads stored status from GET /{fqn}/pipelineStatus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ runId: 'r1', pipelineState: 'success', timestamp: 1 }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listPipelineStatuses('warehouse.warehouse-metadata');
    expect(page.data[0]?.pipelineState).toBe('success');
    expect(lastFetch().url).toContain(
      '/api/v1/services/ingestionPipelines/warehouse.warehouse-metadata/pipelineStatus',
    );
    expect(lastFetch().init?.method ?? 'GET').toBe('GET');
  });

  it('reads orchestrator availability from GET /status without calling trigger', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 200, platform: 'disabled', reason: 'Pipeline Client Disabled' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const status = await getOrchestratorStatus();
    expect(status.platform).toBe('disabled');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/status');
    expect(lastFetch().url).not.toContain('/trigger/');
  });

  it('lists with the P-23 default fields owners,pipelineStatuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'p1',
                name: 'warehouse-metadata',
                pipelineType: 'metadata',
                owners: [{ id: 'u1', type: 'user', name: 'alice', displayName: 'Alice' }],
                pipelineStatuses: [{ runId: 'r1', pipelineState: 'success' }],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listIngestionPipelines({ limit: 25 });
    expect(lastFetch().url).toContain('fields=owners%2CpipelineStatuses');
    expect(page.data[0]?.owners?.[0]?.displayName).toBe('Alice');
    expect(page.data[0]?.pipelineStatuses?.[0]?.runId).toBe('r1');
  });

  it('forwards sortField/sortOrder only for legal values (P-28)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await listIngestionPipelines({ sortField: 'displayName', sortOrder: 'asc' });
    expect(lastFetch().url).toContain('sortField=displayName');
    expect(lastFetch().url).toContain('sortOrder=asc');
    await listIngestionPipelines({ sortField: 'displayName', sortOrder: 'sideways' as never });
    expect(lastFetch().url).not.toContain('sortOrder=');
    await listIngestionPipelines({ sortField: 'name' as never, sortOrder: 'desc' });
    expect(lastFetch().url).not.toContain('sortField=');
  });

  it('maps full step fields and failure name/stackTrace (P-03)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                runId: 'r1',
                pipelineState: 'failed',
                status: [
                  {
                    name: 'ingest',
                    records: 10,
                    filtered: 2,
                    updated_records: 3,
                    warnings: 1,
                    errors: 4,
                    failures: [{ name: 'bad-row', error: 'boom', stackTrace: 'trace here' }],
                  },
                ],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listPipelineStatuses('warehouse.warehouse-metadata');
    const step = page.data[0]?.status?.[0];
    expect(step?.records).toBe(10);
    expect(step?.filtered).toBe(2);
    expect(step?.updated_records).toBe(3);
    expect(step?.warnings).toBe(1);
    expect(step?.errors).toBe(4);
    expect(step?.failures?.[0]?.name).toBe('bad-row');
    expect(step?.failures?.[0]?.stackTrace).toBe('trace here');
  });

  it('deletes with hardDelete=true (P-18)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await deleteIngestionPipeline('p1');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/p1?hardDelete=true');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('kills through POST /kill/{id} and maps the client response (P-05)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 200, platform: 'airflow', runId: 'r1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const result = await killIngestionPipeline('p1');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/kill/p1');
    expect(lastFetch().init?.method).toBe('POST');
    expect(result.code).toBe(200);
    expect(result.runId).toBe('r1');
  });

  it('reads logs from GET /logs/{fqn}/last with an after cursor (P-04)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ logs: 'line1\nline2', after: '42', total: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const logs = await getIngestionPipelineLogs('warehouse.warehouse-metadata', '0');
    expect(lastFetch().url).toContain(
      '/api/v1/services/ingestionPipelines/logs/warehouse.warehouse-metadata/last?after=0',
    );
    expect(logs.logs).toBe('line1\nline2');
    expect(logs.after).toBe('42');
  });

  it('surfaces a plain-string Pipeline Client Disabled log body as an error (P-04/C-01)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Pipeline Client Disabled', { status: 200 })),
    );
    await expect(getIngestionPipelineLogs('warehouse.warehouse-metadata')).rejects.toThrow(
      'Pipeline Client Disabled',
    );
  });

  it('downloads logs as a blob from GET /logs/{fqn}/last/download (P-04)', async () => {
    vi.stubGlobal(
      'fetch',
      // String body: the client's blob branch reads it back as a Blob.
      // (A jsdom Blob round-tripped through the Response constructor
      // comes back stringified as '[object Blob]' — cross-realm.)
      vi.fn(async () => new Response('line1', { status: 200 })),
    );
    const result = await downloadIngestionPipelineLogs('warehouse.warehouse-metadata');
    expect(lastFetch().url).toContain(
      '/api/v1/services/ingestionPipelines/logs/warehouse.warehouse-metadata/last/download',
    );
    // No `toBeInstanceOf(Blob)` here: on Node 22 `response.blob()`
    // returns undici's Blob while the test's global Blob is jsdom's,
    // so the instanceof check fails across realms even though the value
    // is a correct Blob (server gate, 2026-11-12). Pin the observable
    // shape instead — size, type and content — which is realm-independent
    // and at least as strong as the constructor check.
    expect(result.size).toBe(5);
    expect(result.type).toBe('text/plain;charset=utf-8');
    expect(await result.text()).toBe('line1');
  });

  it('toggle throws on the plain-string disabled body instead of reporting success (C-01)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Pipeline Client Disabled', { status: 200 })),
    );
    await expect(toggleIngestionPipeline('p1')).rejects.toThrow('Pipeline Client Disabled');
  });

  it('forwards the agentType grouping filter (official agentType param)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await listIngestionPipelines({ agentType: 'metadata', service: 'pg.warehouse' });
    expect(lastFetch().url).toContain('agentType=metadata');
    expect(lastFetch().url).toContain('service=pg.warehouse');
  });

  it('maps step progress records and drops non-record step entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'p1',
                name: 'pg-metadata',
                pipelineType: 'metadata',
                pipelineStatuses: [
                  {
                    runId: 'r1',
                    pipelineState: 'running',
                    status: [
                      {
                        name: 'metadata',
                        progress: {
                          Table: { processed: 5, total: 10, estimatedRemainingSeconds: 30 },
                          Database: 'junk',
                        },
                      },
                      'junk-step',
                      { name: 'no-progress', progress: 'not-a-record' },
                      { name: 'empty-progress', progress: {} },
                    ],
                  },
                ],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listIngestionPipelines({ limit: 50 });
    const steps = page.data[0]?.pipelineStatuses?.[0]?.status;
    expect(steps).toHaveLength(3);
    expect(steps?.[0]?.progress).toEqual({
      Table: { processed: 5, total: 10, estimatedRemainingSeconds: 30 },
    });
    expect(steps?.[1]?.progress).toBeUndefined();
    expect(steps?.[2]?.progress).toBeUndefined();
  });
});
