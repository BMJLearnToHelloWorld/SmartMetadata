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

// ---------------------------------------------------------------------------
// Owned jobs (official CsvJobsTray.constants.ts markCsvJobOwned /
// isCsvJobOwned, verbatim in semantics). Job ids the current user started
// in this browser-tab session via an export or import action. The tray
// must always surface these — even a fast job that finishes before the
// tray's first jobs fetch — so the stale-job guard (which hides jobs
// already terminal on first load, e.g. leftovers shown after a page
// refresh) never suppresses a job the user just triggered. A module-level
// Set, not sessionStorage, not persisted: ownership lasts exactly this
// tab session, matching the official in-memory set.
// ADR:2026-11-08-csv-job-owned-memory-set.
// ---------------------------------------------------------------------------

const ownedCsvJobIds = new Set<string>();

export function markCsvJobOwned(jobId?: string): void {
  if (jobId) {
    ownedCsvJobIds.add(jobId);
  }
}

export function isCsvJobOwned(jobId: string): boolean {
  return ownedCsvJobIds.has(jobId);
}
