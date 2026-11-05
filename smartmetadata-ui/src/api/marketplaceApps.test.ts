/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listMarketplaceApps } from './marketplaceApps';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listMarketplaceApps', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({
        data: [
          {
            name: 'DataInsightsApplication',
            displayName: 'Data Insights',
            description: 'Insights app',
            fullyQualifiedName: 'DataInsightsApplication',
            enabled: true,
          },
          { name: 'BrokenApp' },
        ],
        paging: { total: 2, after: 'next-cursor' },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET /v1/apps/marketplace and maps the catalog page', async () => {
    const page = await listMarketplaceApps({ limit: 25 });
    const calls = vi.mocked(fetch).mock.calls;
    expect(String(calls[0][0])).toContain('/api/v1/apps/marketplace');
    expect(String(calls[0][0])).toContain('limit=25');
    expect(page.data.map((app) => app.name)).toEqual(['DataInsightsApplication', 'BrokenApp']);
    expect(page.total).toBe(2);
    expect(page.after).toBe('next-cursor');
    expect(page.data[0].description).toBe('Insights app');
  });

  it('forwards cursor params for paging', async () => {
    await listMarketplaceApps({ after: 'abc' });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('after=abc');
  });
});
