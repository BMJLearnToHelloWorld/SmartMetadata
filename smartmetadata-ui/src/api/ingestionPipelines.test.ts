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
  getOrchestratorStatus,
  listIngestionPipelines,
  listPipelineStatuses,
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
          airflowConfig: { pausePipeline: true },
        });
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
      airflowConfig: { pausePipeline: true },
    });
    expect(created.id).toBe('p1');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('updates through PUT /v1/services/ingestionPipelines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: 'p1', name: 'warehouse-metadata', pipelineType: 'metadata' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await updateIngestionPipeline({
      name: 'warehouse-metadata',
      pipelineType: 'metadata',
      service: { id: 's1', type: 'databaseService' },
      sourceConfig: { config: { type: 'DatabaseMetadata' } },
      airflowConfig: { pausePipeline: true },
      description: 'Updated',
    });
    expect(lastFetch().init?.method).toBe('PUT');
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
});
