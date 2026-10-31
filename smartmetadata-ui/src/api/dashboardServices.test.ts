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
import { createDashboardService, listDashboardServices } from './dashboardServices';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('dashboardServices API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists services from GET /v1/services/dashboardServices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'd1', name: 'bi', serviceType: 'Superset' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listDashboardServices();
    expect(page.data[0]).toMatchObject({ kind: 'dashboard', serviceType: 'Superset' });
    expect(lastFetch().url).toContain('/api/v1/services/dashboardServices');
  });

  it('creates a Superset service with hostPort and nested API connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'bi',
          serviceType: 'Superset',
          connection: {
            config: {
              type: 'Superset',
              hostPort: 'http://localhost:8088',
              connection: { provider: 'db', username: 'admin', password: '${SUPERSET_PASSWORD}' },
            },
          },
        });
        return new Response(JSON.stringify({ id: 'd1', name: 'bi', serviceType: 'Superset' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createDashboardService({
      name: 'bi',
      serviceType: 'Superset',
      connection: {
        config: {
          type: 'Superset',
          hostPort: 'http://localhost:8088',
          connection: { provider: 'db', username: 'admin', password: '${SUPERSET_PASSWORD}' },
        },
      },
    });
    expect(created.id).toBe('d1');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
