/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { CreateGlossaryRequest, Glossary } from '@/types/governance';
import { apiRequest } from './client';
import { notifyCsvJobsRefresh } from './csvJobs';
import { mapTags } from './entities';

export const GLOSSARY_FIELDS = 'owners,tags,reviewers,usageCount,termCount,domains';

export interface ListGlossariesQuery {
  limit?: number;
  after?: string;
}

function mapGlossary(raw: Record<string, unknown>): Glossary | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    deleted: asBoolean(raw.deleted),
    mutuallyExclusive: asBoolean(raw.mutuallyExclusive),
    termCount: asNumber(raw.termCount),
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    tags: mapTags(raw.tags),
    domains: mapEntityRefs(raw.domains),
  };
}

export function listGlossaries(query: ListGlossariesQuery = {}): Promise<Paged<Glossary>> {
  return apiRequest<unknown>('/v1/glossaries', {
    query: {
      fields: GLOSSARY_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapGlossary));
}

export async function getGlossary(id: string): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/glossaries/${encodeURIComponent(id)}`, {
    query: { fields: GLOSSARY_FIELDS },
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Glossary response was missing id and name');
  }
  return mapped;
}

export async function createGlossary(body: CreateGlossaryRequest): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaries', {
    method: 'POST',
    json: body,
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Create glossary succeeded but the response had no glossary');
  }
  return mapped;
}

export async function updateGlossary(body: CreateGlossaryRequest): Promise<Glossary> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/glossaries', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapGlossary(raw);
  if (!mapped) {
    throw new Error('Update glossary succeeded but the response had no glossary');
  }
  return mapped;
}

/**
 * D-2 batch 2: official patchGlossary (rest/glossaryAPI.ts): JSON Patch.
 * The cell-level writes (owners/reviewers/tags/domains) go through this
 * endpoint, not the full-PUT `updateGlossary` — the CreateGlossaryRequest
 * body carries none of those fields, so a PUT would drop them. Same
 * contract as `patchDomain` (application/json-patch+json).
 */
export function patchGlossary(id: string, patch: unknown[]): Promise<unknown> {
  return apiRequest(`/v1/glossaries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

export interface DeleteEntityOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/**
 * Official exportGlossaryInCSVFormat (rest/glossaryAPI.ts:205):
 * GET /v1/glossaries/name/{fqn}/exportAsync — async CSV export of the
 * glossary's terms; the response carries the CSV job id (pin
 * CSVExportResponse), never a file. Same contract as
 * exportMetricsCsvAsync: the call dispatches the CSV-jobs tray refresh
 * so the job appears even if the tray has not polled yet, and a jobId
 * is never invented when the response carries none (ADR:2026-11-08-
 * csv-job-owned-memory-set). The caller claims the job for the tray
 * (markCsvJobOwned). Server endpoint verified present in the product
 * server (B2-S1: GlossaryResource.java:568 exportAsync).
 */
export interface GlossaryCsvExportJob {
  jobId?: string;
}

export async function exportGlossaryInCSVFormat(fqn: string): Promise<GlossaryCsvExportJob> {
  const payload = await apiRequest<unknown>(
    `/v1/glossaries/name/${encodeURIComponent(fqn)}/exportAsync`,
  );
  notifyCsvJobsRefresh();
  const jobId = asString(asRecord(payload)?.jobId);
  return jobId ? { jobId } : {};
}

/** Official generic deleteEntity (rest/miscAPI.ts): DELETE /glossaries/{id}?hardDelete&recursive. */
export function deleteGlossary(id: string, options: DeleteEntityOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/glossaries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}
