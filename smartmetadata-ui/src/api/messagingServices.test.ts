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
import { createMessagingService, listMessagingServices } from './messagingServices';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('messagingServices API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists services from GET /v1/services/messagingServices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'm1', name: 'events', serviceType: 'Kafka' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listMessagingServices();
    expect(page.data[0]).toMatchObject({ kind: 'messaging', serviceType: 'Kafka' });
    expect(lastFetch().url).toContain('/api/v1/services/messagingServices');
  });

  it('creates a Kafka service with name, serviceType, and bootstrapServers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'events',
          serviceType: 'Kafka',
          connection: { config: { type: 'Kafka', bootstrapServers: 'localhost:9092' } },
        });
        return new Response(JSON.stringify({ id: 'm1', name: 'events', serviceType: 'Kafka' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createMessagingService({
      name: 'events',
      serviceType: 'Kafka',
      connection: { config: { type: 'Kafka', bootstrapServers: 'localhost:9092' } },
    });
    expect(created.id).toBe('m1');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
