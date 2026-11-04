/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import { listCsvAsyncJobs } from './csvJobs';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listCsvAsyncJobs', () => {
  it('maps the user-scoped job list and drops rows without a job id', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain('/api/v1/csvAsyncJobs');
      return jsonResponse([
        { jobId: 'j1', status: 'RUNNING', progress: 3, total: 10, operation: 'IMPORT' },
        { status: 'QUEUED' },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const jobs = await listCsvAsyncJobs(50);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ jobId: 'j1', status: 'RUNNING', progress: 3, total: 10 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns an empty list when the server returns a non-array payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    try {
      await expect(listCsvAsyncJobs()).resolves.toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
