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
import { listCatalogPipelineStatuses, mapCatalogPipelineStatus, mapPipelineTask } from './catalogPipelines';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('catalog pipeline mappers', () => {
  it('drops nameless tasks and unknown downstream strings', () => {
    expect(mapPipelineTask({ displayName: 'no name' })).toBeNull();
    expect(mapPipelineTask({ name: 'extract', downstreamTasks: ['load', 1, ''] })?.downstreamTasks).toEqual(['load']);
  });

  it('requires timestamp and executionStatus on a status row', () => {
    expect(mapCatalogPipelineStatus({ executionStatus: 'Successful' })).toBeNull();
    expect(
      mapCatalogPipelineStatus({
        timestamp: 1700000000000,
        executionStatus: 'Successful',
        taskStatus: [{ name: 'extract', executionStatus: 'Successful' }],
      }),
    ).toMatchObject({
      timestamp: 1700000000000,
      executionStatus: 'Successful',
      taskStatus: [{ name: 'extract', executionStatus: 'Successful' }],
    });
  });
});

describe('listCatalogPipelineStatuses', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('GETs /v1/pipelines/{fqn}/status with the required time window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ timestamp: 1700000000000, executionStatus: 'Failed', executionId: 'run-1' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listCatalogPipelineStatuses('airflow.daily_etl', {
      startTs: 100,
      endTs: 200,
      limit: 10,
    });
    expect(page.data[0]).toMatchObject({ executionStatus: 'Failed', executionId: 'run-1' });
    expect(lastFetch().url).toContain(`/api/v1/pipelines/${encodeURIComponent('airflow.daily_etl')}/status`);
    expect(lastFetch().url).toContain('startTs=100');
    expect(lastFetch().url).toContain('endTs=200');
    expect(lastFetch().url).toContain('limit=10');
  });
});
