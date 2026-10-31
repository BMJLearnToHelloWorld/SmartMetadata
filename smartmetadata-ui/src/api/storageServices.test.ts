/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorageService, listStorageServices } from './storageServices';

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('expected fetch');
  }
  return { url: String(call[0]), init: call[1] as RequestInit | undefined };
}

describe('storageServices API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists services from GET /v1/services/storageServices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'st1', name: 'lake', serviceType: 'S3' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listStorageServices();
    expect(page.data[0]).toMatchObject({ kind: 'storage', serviceType: 'S3' });
    expect(lastFetch().url).toContain('/api/v1/services/storageServices');
  });

  it('creates an S3 service with awsConfig + bucketNames', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'lake',
          serviceType: 'S3',
          connection: {
            config: {
              type: 'S3',
              awsConfig: { awsRegion: 'us-east-1', awsAccessKeyId: 'AKIA' },
              bucketNames: ['analytics'],
            },
          },
        });
        return new Response(JSON.stringify({ id: 'st1', name: 'lake', serviceType: 'S3' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createStorageService({
      name: 'lake',
      serviceType: 'S3',
      connection: {
        config: {
          type: 'S3',
          awsConfig: { awsRegion: 'us-east-1', awsAccessKeyId: 'AKIA' },
          bucketNames: ['analytics'],
        },
      },
    });
    expect(created.id).toBe('st1');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
