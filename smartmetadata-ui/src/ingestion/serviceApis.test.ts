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
import type { ServiceKind } from '@/types/ingestion';
import {
  SERVICE_DELETE_API,
  SERVICE_GET_API,
  SERVICE_LIST_API,
  SERVICE_MAP_API,
  SERVICE_RESTORE_API,
} from './serviceApis';

const KINDS: { kind: ServiceKind; segment: string }[] = [
  { kind: 'database', segment: 'databaseServices' },
  { kind: 'messaging', segment: 'messagingServices' },
  { kind: 'dashboard', segment: 'dashboardServices' },
  { kind: 'storage', segment: 'storageServices' },
  { kind: 'pipeline', segment: 'pipelineServices' },
  { kind: 'api', segment: 'apiServices' },
  { kind: 'mlmodel', segment: 'mlmodelServices' },
  { kind: 'metadata', segment: 'metadataServices' },
  { kind: 'drive', segment: 'driveServices' },
  { kind: 'search', segment: 'searchServices' },
  { kind: 'llm', segment: 'llmServices' },
  { kind: 'mcp', segment: 'mcpServices' },
  { kind: 'security', segment: 'securityServices' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('serviceApis delete/restore dispatch (D-C14)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'DELETE') {
          return jsonResponse({ jobId: 'j1', message: 'Delete job started' });
        }
        if (url.includes('/restore')) {
          return jsonResponse({ id: 's1', name: 'svc', serviceType: 'Postgres', deleted: false });
        }
        if (url.includes('/s1')) {
          return jsonResponse({ id: 's1', name: 'svc', serviceType: 'Postgres', deleted: true });
        }
        return jsonResponse({
          data: [{ id: 's1', name: 'svc', serviceType: 'Postgres', deleted: true }],
          paging: { total: 1 },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each(KINDS)(
    'deletes a $kind service through the async endpoint with hardDelete + recursive',
    async ({ kind, segment }) => {
      const job = await SERVICE_DELETE_API[kind]('s1', { hardDelete: true, recursive: true });
      expect(job.message).toBe('Delete job started');
      const { url, init } = lastFetch();
      expect(init?.method).toBe('DELETE');
      expect(url).toContain(`/api/v1/services/${segment}/async/s1`);
      expect(url).toContain('hardDelete=true');
      expect(url).toContain('recursive=true');
    },
  );

  it.each(KINDS)(
    'defaults a $kind service delete to a recursive soft delete',
    async ({ kind, segment }) => {
      await SERVICE_DELETE_API[kind]('s1');
      const { url } = lastFetch();
      expect(url).toContain(`/api/v1/services/${segment}/async/s1`);
      expect(url).toContain('hardDelete=false');
      expect(url).toContain('recursive=true');
    },
  );

  it.each(KINDS)(
    'restores a $kind service through PUT /restore with { id }',
    async ({ kind, segment }) => {
      const restored = await SERVICE_RESTORE_API[kind]('s1');
      expect(restored).toMatchObject({ id: 's1', name: 'svc', deleted: false });
      const { url, init } = lastFetch();
      expect(init?.method).toBe('PUT');
      expect(url).toContain(`/api/v1/services/${segment}/restore`);
      expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ id: 's1' });
    },
  );

  it.each(KINDS)(
    'passes include through on a $kind service detail fetch',
    async ({ kind, segment }) => {
      const service = await SERVICE_GET_API[kind]('s1', 'all');
      expect(service.deleted).toBe(true);
      expect(lastFetch().url).toContain(`/api/v1/services/${segment}/s1`);
      expect(lastFetch().url).toContain('include=all');
    },
  );

  it.each(KINDS)(
    'passes include through on a $kind service list fetch',
    async ({ kind, segment }) => {
      const page = await SERVICE_LIST_API[kind]({ limit: 10, include: 'deleted' });
      expect(page.data[0]?.deleted).toBe(true);
      expect(lastFetch().url).toContain(`/api/v1/services/${segment}`);
      expect(lastFetch().url).toContain('include=deleted');
    },
  );

  it.each(KINDS)('maps raw.deleted for a $kind service', async ({ kind }) => {
    const mapped = SERVICE_MAP_API[kind]({
      id: 's1',
      name: 'svc',
      serviceType: 'Postgres',
      deleted: true,
    });
    expect(mapped?.deleted).toBe(true);
    const live = SERVICE_MAP_API[kind]({ id: 's1', name: 'svc', serviceType: 'Postgres' });
    expect(live?.deleted).toBeUndefined();
  });
});
