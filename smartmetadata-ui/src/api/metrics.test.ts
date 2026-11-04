/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import { listMetrics } from './metrics';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listMetrics', () => {
  it('maps metric entities and drops rows missing id, name, or FQN', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain('/api/v1/metrics');
      return jsonResponse({
        data: [
          {
            id: 'm1',
            name: 'mau',
            fullyQualifiedName: 'kpi.mau',
            owners: [{ id: 'u1', name: 'alice', type: 'user' }],
            tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' }],
          },
          { name: 'nameless' },
        ],
        paging: { after: 'next-cursor' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const page = await listMetrics({ limit: 1000 });
      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toMatchObject({
        id: 'm1',
        name: 'mau',
        fullyQualifiedName: 'kpi.mau',
      });
      expect(page.data[0]?.owners).toEqual([{ id: 'u1', name: 'alice', type: 'user' }]);
      expect(page.after).toBe('next-cursor');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
