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
import { createEventSubscription, listEventSubscriptions } from './eventSubscriptions';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('eventSubscriptions API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists alerts from GET /v1/events/subscriptions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'al1', name: 'dq-fail', alertType: 'Observability', enabled: true }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listEventSubscriptions();
    expect(page.data[0]?.alertType).toBe('Observability');
    expect(lastFetch().url).toContain('/api/v1/events/subscriptions');
  });

  it('creates an alert with required name, alertType, and a webhook destination', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'dq-webhook',
          alertType: 'Observability',
        });
        expect(body.destinations).toEqual([
          { category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com/hook' } },
        ]);
        return new Response(JSON.stringify({ id: 'al2', name: 'dq-webhook', alertType: 'Observability' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createEventSubscription({
      name: 'dq-webhook',
      alertType: 'Observability',
      destinations: [
        { category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com/hook' } },
      ],
    });
    expect(created.id).toBe('al2');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
