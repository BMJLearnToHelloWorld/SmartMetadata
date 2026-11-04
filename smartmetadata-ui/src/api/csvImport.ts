/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Official bulk-import surface (openmetadata-ui rest/csvAPI.ts +
 * rest/importExportAPI.ts + utils/EntityImport/EntityImportUtils.ts):
 * CSV documentation, per-entity importAsync (dryRun validate, then real
 * import), and the csvAsyncJobs polling endpoints. The import itself is
 * asynchronous server-side: PUT importAsync returns a job id, completion
 * is polled here (the product has no import-job websocket channel, so
 * polling is the product equivalent of official's websocket completion
 * frame), and the full per-row result is fetched from import-result.
 * Authorization is enforced per row server-side (upstream S3): a row the
 * caller may not write fails individually inside CSVImportResult, never
 * the whole file — callers must render per-row results, not a single
 * pass/fail.
 */
import { apiRequest, ApiError } from './client';
import { asRecord, asString } from './json';

export interface CsvHeaderDocumentation {
  name: string;
  required?: boolean;
  description?: string;
  examples?: string[];
}

export interface CsvDocumentation {
  summary?: string;
  headers: CsvHeaderDocumentation[];
}

export type CsvAsyncJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED';

export interface CsvAsyncJob {
  jobId: string;
  operation?: string;
  entityType?: string;
  targetFqn?: string;
  status?: CsvAsyncJobStatus;
  progress?: number;
  total?: number;
  dryRun?: boolean;
  recursive?: boolean;
  error?: string;
  message?: string;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
}

export interface CsvImportResult {
  dryRun?: boolean;
  status?: string;
  abortReason?: string;
  numberOfRowsProcessed?: number;
  numberOfRowsPassed?: number;
  numberOfRowsFailed?: number;
  numberOfRowsPendingApproval?: number;
  importResultsCsv?: string;
}

export interface CsvImportAsyncResponse {
  jobId: string;
  message: string;
}

const TERMINAL_JOB_STATUSES: ReadonlySet<string> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function mapCsvDocumentation(payload: unknown): CsvDocumentation {
  const rec = asRecord(payload) ?? {};
  const rawHeaders = Array.isArray(rec.headers) ? rec.headers : [];
  return {
    summary: asString(rec.summary),
    headers: rawHeaders.flatMap((item) => {
      const header = asRecord(item);
      if (!header) {
        return [];
      }
      const name = asString(header.name);
      return name
        ? [
            {
              name,
              required: header.required === true,
              description: asString(header.description),
              examples: Array.isArray(header.examples)
                ? header.examples.filter((e): e is string => typeof e === 'string')
                : undefined,
            },
          ]
        : [];
    }),
  };
}

export function mapCsvAsyncJob(payload: unknown): CsvAsyncJob {
  const rec = asRecord(payload) ?? {};
  return {
    jobId: asString(rec.jobId) ?? '',
    operation: asString(rec.operation),
    entityType: asString(rec.entityType),
    targetFqn: asString(rec.targetFqn),
    status: asString(rec.status) as CsvAsyncJobStatus | undefined,
    progress: asNumber(rec.progress),
    total: asNumber(rec.total),
    dryRun: rec.dryRun === true,
    recursive: rec.recursive === true,
    error: asString(rec.error),
    message: asString(rec.message),
    createdAt: asNumber(rec.createdAt),
    updatedAt: asNumber(rec.updatedAt),
    completedAt: asNumber(rec.completedAt),
  };
}

/** Shared with the column CSV import, which returns the same result shape. */
export function mapCsvImportResult(payload: unknown): CsvImportResult {
  const rec = asRecord(payload) ?? {};
  return {
    dryRun: rec.dryRun === true,
    status: asString(rec.status),
    abortReason: asString(rec.abortReason),
    numberOfRowsProcessed: asNumber(rec.numberOfRowsProcessed),
    numberOfRowsPassed: asNumber(rec.numberOfRowsPassed),
    numberOfRowsFailed: asNumber(rec.numberOfRowsFailed),
    numberOfRowsPendingApproval: asNumber(rec.numberOfRowsPendingApproval),
    importResultsCsv: asString(rec.importResultsCsv),
  };
}

const CSV_DOCUMENTATION_FALLBACK_PATHS: Record<string, string> = {
  glossary: '/v1/glossaries/documentation/csv',
  metric: '/v1/metrics/documentation/csv',
  team: '/v1/teams/documentation/csv',
  user: '/v1/users/documentation/csv',
};

export async function getCsvDocumentation(
  entityType: string,
  recursive = false,
): Promise<CsvDocumentation> {
  try {
    const payload = await apiRequest<unknown>(
      `/v1/csv/documentation/${encodeURIComponent(entityType)}?recursive=${recursive}`,
    );
    return mapCsvDocumentation(payload);
  } catch (error) {
    const fallbackPath = CSV_DOCUMENTATION_FALLBACK_PATHS[entityType];
    if (!fallbackPath || !(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
    const payload = await apiRequest<unknown>(`${fallbackPath}?recursive=${recursive}`);
    return mapCsvDocumentation(payload);
  }
}

export interface ImportCsvParams {
  entityType: string;
  name: string;
  data: string;
  dryRun?: boolean;
  recursive?: boolean;
  targetEntityType?: string;
}

/**
 * Official getImportValidateAPIEntityType: four entity kinds have their own
 * import route; everything else uses the naive `/{entityType}s` plural.
 */
export function importCsvUrl(params: ImportCsvParams): string {
  const encoded = encodeURIComponent(params.name);
  const query = new URLSearchParams();
  query.set('dryRun', String(params.dryRun ?? true));
  if (params.recursive !== undefined) {
    query.set('recursive', String(params.recursive));
  }
  if (params.targetEntityType) {
    query.set('targetEntityType', params.targetEntityType);
  }
  const suffix = `?${query.toString()}`;
  switch (params.entityType) {
    case 'databaseService':
      return `/v1/services/databaseServices/name/${encoded}/importAsync${suffix}`;
    case 'glossary':
      return `/v1/glossaries/name/${encoded}/importAsync${suffix}`;
    case 'glossaryTerm':
      return `/v1/glossaryTerms/name/${encoded}/importAsync${suffix}`;
    case 'testCase':
      return `/v1/dataQuality/testCases/name/${encoded}/importAsync${suffix}`;
    default:
      return `/v1/${params.entityType}s/name/${encoded}/importAsync${suffix}`;
  }
}

export async function importEntityCsv(params: ImportCsvParams): Promise<CsvImportAsyncResponse> {
  const payload = await apiRequest<unknown>(importCsvUrl(params), {
    method: 'PUT',
    text: params.data,
  });
  const rec = asRecord(payload) ?? {};
  return { jobId: asString(rec.jobId) ?? '', message: asString(rec.message) ?? '' };
}

export async function getCsvAsyncJob(jobId: string): Promise<CsvAsyncJob> {
  return mapCsvAsyncJob(
    await apiRequest<unknown>(`/v1/csvAsyncJobs/${encodeURIComponent(jobId)}`),
  );
}

export async function getCsvAsyncImportResult(jobId: string): Promise<CsvImportResult> {
  return mapCsvImportResult(
    await apiRequest<unknown>(`/v1/csvAsyncJobs/${encodeURIComponent(jobId)}/import-result`),
  );
}

export async function getCsvAsyncJobResultCsv(jobId: string): Promise<string> {
  return apiRequest<string>(`/v1/csvAsyncJobs/${encodeURIComponent(jobId)}/result`, {
    response: 'text',
    headers: { Accept: 'text/csv' },
  });
}

export async function cancelCsvAsyncJob(jobId: string): Promise<CsvAsyncJob> {
  return mapCsvAsyncJob(
    await apiRequest<unknown>(`/v1/csvAsyncJobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'PUT',
    }),
  );
}

export interface CsvJobPollOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onProgress?: (job: CsvAsyncJob) => void;
  /** When true, polling stops at the next poll boundary. */
  isCancelled?: () => boolean;
}

/** Poll until the job reaches a terminal status; returns the terminal job. */
export async function pollCsvAsyncJob(
  jobId: string,
  options: CsvJobPollOptions = {},
): Promise<CsvAsyncJob> {
  const intervalMs = options.intervalMs ?? 2000;
  const maxAttempts = options.maxAttempts ?? 60;
  let job = await getCsvAsyncJob(jobId);
  options.onProgress?.(job);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (job.status !== undefined && TERMINAL_JOB_STATUSES.has(job.status)) {
      return job;
    }
    if (options.isCancelled?.()) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    job = await getCsvAsyncJob(jobId);
    options.onProgress?.(job);
  }
  return job;
}
