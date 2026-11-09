/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { removeFieldPatch, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { asNumber, asRecord, asString, mapEntityRef, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateTestIncidentRequest,
  TestIncident,
  TestIncidentResolutionDetails,
} from '@/types/quality';
import { apiRequest } from './client';

export const TEST_CASE_INCIDENT_STATUS_BASE =
  '/v1/dataQuality/testCases/testCaseIncidentStatus';

/**
 * Official getListTestCaseIncidentStatusFromSearch (rest/
 * incidentManagerAPI.ts): the classic list's only data source.
 * The endpoint takes limit/offset/startTs/endTs/
 * testCaseResolutionStatusType/latest/assignee/include/testCaseFQN/
 * originEntityFQN/domain/sortField/sortType/dateField — and NO
 * severity parameter (the classic list has no severity filter).
 * Fork server TestCaseResolutionStatusResource.listFromSearch confirms
 * the same table; its default sort is updatedAt desc.
 */
export interface ListTestIncidentsFromSearchQuery {
  limit?: number;
  offset?: number;
  startTs?: number;
  endTs?: number;
  testCaseResolutionStatusType?: string;
  latest?: boolean;
  assignee?: string;
  include?: string;
  testCaseFQN?: string;
  originEntityFQN?: string;
  domain?: string;
  sortField?: string;
  sortType?: 'asc' | 'desc';
  dateField?: 'timestamp' | 'updatedAt';
}

function mapResolutionDetails(value: unknown): TestIncidentResolutionDetails | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const assignee = mapEntityRef(rec.assignee);
  const resolvedBy = mapEntityRef(rec.resolvedBy);
  const comment = asString(rec.testCaseFailureComment);
  const reason = asString(rec.testCaseFailureReason);
  if (!assignee && !resolvedBy && !comment && !reason) {
    return undefined;
  }
  return {
    assignee,
    resolvedBy,
    testCaseFailureComment: comment || undefined,
    testCaseFailureReason: reason || undefined,
  };
}

function mapIncident(raw: Record<string, unknown>): TestIncident | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    stateId: asString(raw.stateId) || undefined,
    timestamp: asNumber(raw.timestamp),
    testCaseResolutionStatusType: asString(raw.testCaseResolutionStatusType) || undefined,
    severity: asString(raw.severity) || undefined,
    testCaseReference: mapEntityRef(raw.testCaseReference),
    updatedBy: mapEntityRef(raw.updatedBy),
    testCaseResolutionStatusDetails: mapResolutionDetails(raw.testCaseResolutionStatusDetails),
    updatedAt: asNumber(raw.updatedAt),
    failureSummary: asString(raw.failureSummary) || undefined,
    metrics: Array.isArray(raw.metrics) ? raw.metrics : undefined,
  };
}

/**
 * Query for the baseline list endpoint (GET
 * /v1/dataQuality/testCases/testCaseIncidentStatus). Only the parameters
 * the endpoint accepts: limit/latest/testCaseFQN/originEntityFQN/
 * testCaseResolutionStatusType. Unlike the search/list query, there is no
 * offset, severity, or date-range parameter here.
 */
export interface ListTestIncidentsQuery {
  limit?: number;
  latest?: boolean;
  testCaseFQN?: string;
  originEntityFQN?: string;
  testCaseResolutionStatusType?: string;
}

export function listTestIncidents(query: ListTestIncidentsQuery = {}): Promise<Paged<TestIncident>> {
  return apiRequest<unknown>('/v1/dataQuality/testCases/testCaseIncidentStatus', {
    query: {
      limit: query.limit ?? 50,
      latest: query.latest ?? true,
      testCaseFQN: query.testCaseFQN,
      originEntityFQN: query.originEntityFQN,
      testCaseResolutionStatusType: query.testCaseResolutionStatusType,
    },
  }).then((payload) => parsePaged(payload, mapIncident));
}

/** ADR:2026-11-08-incident-list-source-is-search-list */
export function listTestCaseIncidentsFromSearch(
  query: ListTestIncidentsFromSearchQuery = {},
): Promise<Paged<TestIncident>> {
  return apiRequest<unknown>(`${TEST_CASE_INCIDENT_STATUS_BASE}/search/list`, {
    query: {
      limit: query.limit ?? 10,
      offset: query.offset ?? 0,
      startTs: query.startTs,
      endTs: query.endTs,
      testCaseResolutionStatusType: query.testCaseResolutionStatusType,
      latest: query.latest ?? true,
      assignee: query.assignee,
      include: query.include,
      testCaseFQN: query.testCaseFQN,
      originEntityFQN: query.originEntityFQN,
      domain: query.domain,
      sortField: query.sortField,
      sortType: query.sortType,
      dateField: query.dateField,
    },
  }).then((payload) => parsePaged(payload, mapIncident));
}

/**
 * Official getListTestCaseIncidentByStateId (rest/incidentManagerAPI.ts):
 * GET .../stateId/{stateId}?limit=1 — the read-back after every row
 * write, so the row the list shows is the server's record, not an
 * optimistic guess.
 */
export async function getTestCaseIncidentByStateId(
  stateId: string,
  limit = 1,
): Promise<TestIncident | undefined> {
  const page = await apiRequest<unknown>(
    `${TEST_CASE_INCIDENT_STATUS_BASE}/stateId/${encodeURIComponent(stateId)}`,
    { query: { limit } },
  ).then((payload) => parsePaged(payload, mapIncident));
  return page.data[0];
}

/**
 * Official updateTestCaseIncidentById (rest/incidentManagerAPI.ts):
 * PATCH .../testCaseIncidentStatus/{id} with JSON Patch ops. The patch
 * body is built with the product's setFieldPatch helper (the docStore
 * updateDocument shape: method PATCH + application/json-patch+json),
 * which for a single-field change produces exactly the op official's
 * fast-json-patch compare() produces.
 * ADR:2026-11-08-incident-severity-inline-patch
 */
export async function patchTestIncident(id: string, patch: JsonPatchOp[]): Promise<TestIncident> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${TEST_CASE_INCIDENT_STATUS_BASE}/${encodeURIComponent(id)}`,
    { method: 'PATCH', json: patch, contentType: 'application/json-patch+json' },
  );
  const mapped = mapIncident(raw);
  if (!mapped) {
    throw new Error('Patch incident status succeeded but the response had no record');
  }
  return mapped;
}

/**
 * Severity inline edit: replace /severity (add when absent), remove when
 * cleared — the same ops official's fast-json-patch compare() produces
 * for a single-field change. Callers skip the request when the value is
 * unchanged, so an empty patch never reaches the server.
 */
export function severityPatch(currentSeverity: string | undefined, nextSeverity: string | undefined): JsonPatchOp[] {
  if (nextSeverity === undefined) {
    return currentSeverity === undefined ? [] : [removeFieldPatch('/severity')];
  }
  return setFieldPatch('/severity', currentSeverity, nextSeverity);
}

export async function getTestIncident(id: string): Promise<TestIncident> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataQuality/testCases/testCaseIncidentStatus/${encodeURIComponent(id)}`,
  );
  const mapped = mapIncident(raw);
  if (!mapped) {
    throw new Error('Incident response was missing id');
  }
  return mapped;
}

export async function createTestIncident(body: CreateTestIncidentRequest): Promise<TestIncident> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testCases/testCaseIncidentStatus', {
    method: 'POST',
    json: body,
  });
  const mapped = mapIncident(raw);
  if (!mapped) {
    throw new Error('Create incident status succeeded but the response had no record');
  }
  return mapped;
}
