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
  bulkDeployIngestionPipelines,
  deployIngestionPipeline,
  triggerIngestionPipeline,
} from './ingestionPipelines';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function stubJson(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
}

describe('ingestion pipeline deploy/trigger/bulk-deploy', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deploys via POST /v1/services/ingestionPipelines/deploy/{id} and echoes the client response', async () => {
    stubJson({ code: 200, platform: 'Airflow', reason: 'ok', runId: 'r1' });
    const result = await deployIngestionPipeline('p1');
    expect(result).toMatchObject({ code: 200, platform: 'Airflow', runId: 'r1' });
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/deploy/p1');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('surfaces a Pipeline Client Disabled reason verbatim instead of claiming a deploy', async () => {
    stubJson({ code: 200, reason: 'Pipeline Client Disabled' });
    const result = await deployIngestionPipeline('p1');
    expect(result.reason).toBe('Pipeline Client Disabled');
  });

  it('triggers via POST /v1/services/ingestionPipelines/trigger/{id}', async () => {
    stubJson({ code: 200, platform: 'Airflow', runId: 'r2' });
    const result = await triggerIngestionPipeline('p1');
    expect(result.runId).toBe('r2');
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/trigger/p1');
  });

  it('bulk-deploys via POST /bulk/deploy with the id list and maps one response per id', async () => {
    stubJson([
      { code: 200, platform: 'Airflow' },
      { code: 500, platform: 'Airflow', reason: 'Error deploying [p2]' },
    ]);
    const results = await bulkDeployIngestionPipelines(['p1', 'p2']);
    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ code: 500 });
    expect(lastFetch().url).toContain('/api/v1/services/ingestionPipelines/bulk/deploy');
  });
});
