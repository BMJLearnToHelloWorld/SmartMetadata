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

  it('maps filteringRules, owners, and destination readTimeout from list responses (Fix4)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'al1',
                name: 'dq-fail',
                alertType: 'Observability',
                enabled: true,
                filteringRules: {
                  resources: ['table', 'testCase'],
                  rules: [{ name: 'matchAnyTag', effect: 'Include', condition: ['PII'] }],
                },
                owners: [{ id: 'u1', name: 'amy', displayName: 'Amy' }],
                destinations: [
                  { category: 'External', type: 'Slack', config: { endpoint: 'https://hooks.slack.com/x', readTimeout: 12 } },
                ],
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listEventSubscriptions();
    const alert = page.data[0];
    expect(alert?.filteringRules?.resources).toEqual(['table', 'testCase']);
    expect(alert?.filteringRules?.rules).toEqual([{ name: 'matchAnyTag', effect: 'Include', condition: ['PII'] }]);
    expect(alert?.owners?.[0]?.displayName).toBe('Amy');
    expect(alert?.destinations[0]?.readTimeout).toBe(12);
  });

  it('sends filteringRules and readTimeout in the create payload when provided (Fix4)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body.filteringRules).toEqual({ resources: ['table'] });
        expect(body.destinations).toEqual([
          { category: 'External', type: 'Slack', config: { endpoint: 'https://hooks.slack.com/x', readTimeout: 12 } },
        ]);
        return new Response(JSON.stringify({ id: 'al3', name: 'dq-slack', alertType: 'Observability' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createEventSubscription({
      name: 'dq-slack',
      alertType: 'Observability',
      enabled: true,
      filteringRules: { resources: ['table'] },
      destinations: [
        { category: 'External', type: 'Slack', config: { endpoint: 'https://hooks.slack.com/x', readTimeout: 12 } },
      ],
    });
    expect(created.id).toBe('al3');
  });
});
