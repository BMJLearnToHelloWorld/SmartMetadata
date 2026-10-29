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
import { getApp, listApps, mapApp } from './apps';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

const sampleApp = {
  id: 'a1',
  name: 'DataInsightsReportApp',
  displayName: 'Data Insights',
  description: 'Reports',
  appType: 'internal',
  scheduleType: 'Scheduled',
};

describe('apps API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps an app without inventing marketplace fields', () => {
    expect(mapApp(sampleApp)).toMatchObject({ id: 'a1', name: 'DataInsightsReportApp', appType: 'internal' });
    expect(mapApp({ displayName: 'orphan' })).toBeNull();
  });

  it('lists apps from GET /v1/apps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [sampleApp], paging: { total: 1 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const page = await listApps({ limit: 25 });
    expect(page.data[0]?.name).toBe('DataInsightsReportApp');
    expect(lastFetch()).toContain('/api/v1/apps');
    expect(lastFetch()).toContain('limit=25');
  });

  it('gets one app from GET /v1/apps/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(sampleApp), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const app = await getApp('a1');
    expect(app.displayName).toBe('Data Insights');
    expect(lastFetch()).toContain('/api/v1/apps/a1');
  });
});
