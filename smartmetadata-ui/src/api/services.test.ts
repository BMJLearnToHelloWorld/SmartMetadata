/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServicesOverview } from './services';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getServicesOverview', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: [], paging: { total: 0 } }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends health as repeated lowercase parameters, never a joined value', async () => {
    await getServicesOverview({
      entityType: ['databaseService', 'pipelineService'],
      health: ['failed', 'partialSuccess'],
      includeHealth: true,
    });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain('/api/v1/services/overview');
    expect(url).toContain('health=failed&health=partialSuccess');
    expect(url).not.toContain('health=failed%2CpartialSuccess');
    expect(url).not.toContain('health=Failed');
    expect(url).toContain('entityType=databaseService&entityType=pipelineService');
    expect(url).toContain('includeHealth=true');
  });

  it('omits empty arrays and undefined options', async () => {
    await getServicesOverview({ health: [] });
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).not.toContain('health=');
  });
});
