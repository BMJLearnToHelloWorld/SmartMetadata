/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { apiRequest } from './client';
import { mapCsvAsyncJob, type CsvAsyncJob } from './csvImport';

/**
 * Official CsvJobsTray list surface (rest/csvAPI.ts getCsvAsyncJobs):
 * GET /v1/csvAsyncJobs?limit=, scoped server-side to the current user
 * (CsvAsyncJobResource listJobs, limit clamped 1..100). The tray polls
 * this list; the product has no import-job websocket channel, so polling
 * is the product equivalent of official's socket refresh.
 */
export async function listCsvAsyncJobs(limit = 50): Promise<CsvAsyncJob[]> {
  const payload = await apiRequest<unknown>('/v1/csvAsyncJobs', {
    query: { limit: Math.min(Math.max(limit, 1), 100) },
  });
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap((item) => {
    const job = mapCsvAsyncJob(item);
    return job.jobId ? [job] : [];
  });
}

/** Event dispatched when a CSV job starts, so the tray opens and refreshes. */
export const CSV_JOBS_REFRESH_EVENT = 'csv-jobs-refresh';

export function notifyCsvJobsRefresh(): void {
  window.dispatchEvent(new Event(CSV_JOBS_REFRESH_EVENT));
}
