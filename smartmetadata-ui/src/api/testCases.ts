/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import { mapTestIncident } from '@/api/testIncidents';
import type { ResourcePermission } from '@/api/permissions';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type {
  CreateTestCaseRequest,
  TestCase,
  TestCaseDimensionResult,
  TestCaseEvaluationScope,
  TestCaseResult,
  TestParameterValue,
  TableSampleData,
} from '@/types/quality';
import { ApiError, apiRequest } from './client';

export const TEST_CASE_FIELDS =
  'owners,tags,domains,dataProducts,testSuite,testDefinition,testSuites,incidentId,incidentStatus,testCaseResult,useDynamicAssertion,computePassedFailedRowCount,dataQualityDimension';

export interface ListTestCasesQuery {
  limit?: number;
  after?: string;
  entityFQN?: string;
  entityLink?: string;
  testSuiteId?: string;
  includeAllTests?: boolean;
  /** Pin TestCaseResource: a list — several statuses at once via repeated params. */
  testCaseStatus?: string | string[];
  include?: 'non-deleted' | 'deleted' | 'all';
  testCaseType?: string;
  includePermissions?: boolean;
}

export interface SearchTestCasesQuery {
  q?: string;
  limit?: number;
  offset?: number;
  /** Pin TestCaseResource search list: repeated params, same as the plain list. */
  testCaseStatus?: string | string[];
  owner?: string;
  followedBy?: string;
  testCaseType?: string;
  /** Pin ListTestCaseParamsBySearch: the dashboard drill-down filters by dimension. */
  dataQualityDimension?: string;
  /** Fields override; defaults to TEST_CASE_FIELDS (incl. incidentStatus). */
  fields?: string;
  tags?: string;
  tier?: string;
  dataProductFqn?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  includeAllTests?: boolean;
  sortField?: string;
  sortType?: 'asc' | 'desc';
  /** Scope the search to a suite / entity (pin ListTestCaseParamsBySearch). */
  testSuiteId?: string;
  entityLink?: string;
  entityFQN?: string;
  columnName?: string;
  /** Official ListTestCaseParamsBySearch.tableFqn — sent as entityFQN when entityFQN is empty. */
  tableFqn?: string;
  testPlatforms?: string | string[];
  /** Official ListTestCaseParamsBySearch.serviceName. */
  serviceName?: string;
  include?: 'non-deleted' | 'deleted' | 'all';
  includePermissions?: boolean;
}

export interface TestCaseListPage extends Paged<TestCase> {
  entityPermissions?: Record<string, ResourcePermission>;
}

function mapEntityRef(value: unknown): EntityRef | undefined {
  return mapEntityRefs(value ? [value] : [])[0];
}

function mapParameterValues(value: unknown): TestParameterValue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name);
    if (!name) {
      return [];
    }
    return [{ name, value: asString(rec.value) }];
  });
}

function mapEvaluationScope(value: unknown): TestCaseEvaluationScope | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const profileSampleType = asString(rec.profileSampleType);
  return {
    sampled: rec.sampled === true,
    profileSample: asNumber(rec.profileSample),
    profileSampleType:
      profileSampleType === 'ROWS' || profileSampleType === 'PERCENTAGE'
        ? profileSampleType
        : undefined,
    partitioned: rec.partitioned === true,
    partitionColumnName: asString(rec.partitionColumnName) || undefined,
  };
}

export function mapTestCaseResult(value: unknown): TestCaseResult | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const status = asString(rec.testCaseStatus);
  const result = asString(rec.result);
  const fqn = asString(rec.testCaseFQN);
  const timestamp = asNumber(rec.timestamp);
  if (!status && !result && timestamp === undefined && !fqn && !Array.isArray(rec.testResultValue)) {
    return undefined;
  }
  const testResultValue = Array.isArray(rec.testResultValue)
    ? rec.testResultValue.flatMap((item) => {
        const valueRec = asRecord(item);
        const valueName = valueRec ? asString(valueRec.name) : '';
        if (!valueName) {
          return [];
        }
        return [{ name: valueName, value: valueRec ? asString(valueRec.value) : '' }];
      })
    : undefined;
  const errorRec = asRecord(rec.errorDetails);
  return {
    timestamp,
    testCaseStatus: status || undefined,
    result: result || undefined,
    testCaseFQN: fqn || undefined,
    testResultValue: testResultValue && testResultValue.length > 0 ? testResultValue : undefined,
    incidentId: asString(rec.incidentId) || undefined,
    duration: asNumber(rec.duration),
    minBound: asNumber(rec.minBound),
    maxBound: asNumber(rec.maxBound),
    passedRows: asNumber(rec.passedRows),
    failedRows: asNumber(rec.failedRows),
    passedRowsPercentage: asNumber(rec.passedRowsPercentage),
    failedRowsPercentage: asNumber(rec.failedRowsPercentage),
    evaluationScope: mapEvaluationScope(rec.evaluationScope),
    errorDetails: errorRec
      ? {
          message: asString(errorRec.message) || undefined,
          errorType: asString(errorRec.errorType) || undefined,
          stackTrace: asString(errorRec.stackTrace) || undefined,
        }
      : undefined,
  };
}

function mapInlineIncidentStatus(
  raw: unknown,
  testCaseId: string,
  testCaseName: string,
  fqn?: string,
): TestCase['incidentStatus'] {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const rec = asRecord(raw);
  if (rec) {
  const mapped = mapTestIncident(rec);
    if (mapped) {
      return {
        ...mapped,
        testCaseReference: mapped.testCaseReference ?? {
          id: testCaseId,
          name: testCaseName,
          fullyQualifiedName: fqn,
          type: 'testCase',
        },
      };
    }
  }
  const status = asString(raw);
  if (!status) {
    return undefined;
  }
  return {
    id: testCaseId,
    testCaseResolutionStatusType: status,
    testCaseReference: {
      id: testCaseId,
      name: testCaseName,
      fullyQualifiedName: fqn,
      type: 'testCase',
    },
  };
}

function mapEntityPermissionsMap(raw: unknown): Record<string, ResourcePermission> | undefined {
  const rec = asRecord(raw);
  if (!rec) {
    return undefined;
  }
  const next: Record<string, ResourcePermission> = {};
  for (const [entityId, value] of Object.entries(rec)) {
    const permissionRec = asRecord(value);
    if (!permissionRec) {
      continue;
    }
    const resource = asString(permissionRec.resource);
    const permissions = Array.isArray(permissionRec.permissions)
      ? permissionRec.permissions.flatMap((entry) => {
          const row = asRecord(entry);
          if (!row) {
            return [];
          }
          const operation = asString(row.operation);
          const access = asString(row.access);
          if (!operation || !access) {
            return [];
          }
          return [{ operation, access: access as ResourcePermission['permissions'][number]['access'] }];
        })
      : [];
    if (resource) {
      next[entityId] = { resource, permissions };
    }
  }
  return Object.keys(next).length ? next : undefined;
}

function parseTestCaseListPayload(payload: unknown): TestCaseListPage {
  const root = asRecord(payload);
  const page = parsePaged(payload, mapTestCase);
  return {
    ...page,
    entityPermissions: mapEntityPermissionsMap(root?.entityPermissions),
  };
}

function mapTestCase(raw: Record<string, unknown>): TestCase | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const fullyQualifiedName = asString(raw.fullyQualifiedName) || name;
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName,
    entityLink: asString(raw.entityLink) || undefined,
    entityFQN: asString(raw.entityFQN) || undefined,
    testDefinition: mapEntityRef(raw.testDefinition),
    testSuite: mapEntityRef(raw.testSuite),
    testSuites: mapEntityRefs(raw.testSuites),
    parameterValues: mapParameterValues(raw.parameterValues),
    testCaseResult: mapTestCaseResult(raw.testCaseResult),
    testCaseStatus: asString(raw.testCaseStatus) || undefined,
    incidentId: asString(raw.incidentId) || undefined,
    incidentStatus: mapInlineIncidentStatus(raw.incidentStatus, id, name, fullyQualifiedName),
    owners: mapEntityRefs(raw.owners),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    useDynamicAssertion: raw.useDynamicAssertion === true ? true : undefined,
    computePassedFailedRowCount:
      raw.computePassedFailedRowCount === true ? true : undefined,
    dataQualityDimension: mapEntityRef(raw.dataQualityDimension),
    deleted: raw.deleted === true,
    topDimensions: asNumber(raw.topDimensions),
    dimensionColumns: Array.isArray(raw.dimensionColumns)
      ? raw.dimensionColumns.filter((item): item is string => typeof item === 'string')
      : undefined,
    inspectionQuery: asString(raw.inspectionQuery) || undefined,
    tags: Array.isArray(raw.tags)
      ? raw.tags.flatMap((item) => {
          const rec = asRecord(item);
          if (!rec) {
            return [];
          }
          const tagFQN = asString(rec.tagFQN) || asString(rec.fullyQualifiedName) || asString(rec.name);
          return tagFQN
            ? [
                {
                  tagFQN,
                  name: asString(rec.name) || tagFQN,
                  source: asString(rec.source) === 'Glossary' ? 'Glossary' : asString(rec.source) === 'Classification' ? 'Classification' : undefined,
                },
              ]
            : [];
        })
      : undefined,
  };
}

function mapDimensionResult(raw: Record<string, unknown>): TestCaseDimensionResult | null {
  if (!Array.isArray(raw.dimensionValues)) {
    return null;
  }
  return {
    dimensionValues: raw.dimensionValues.flatMap((item) => {
      const rec = asRecord(item);
      const value = rec ? asString(rec.value) : '';
      return value ? [{ value }] : [];
    }),
    testCaseStatus: asString(raw.testCaseStatus) || undefined,
    result: asString(raw.result) || undefined,
    impactScore: asNumber(raw.impactScore),
    excludedFromRollUp: raw.excludedFromRollUp === true ? true : undefined,
    timestamp: asNumber(raw.timestamp),
    dimensionKey: asString(raw.dimensionKey) || undefined,
  };
}

/**
 * Official getTestCaseDimensionResultsByFqn (rest/testAPI.ts):
 * GET /v1/dataQuality/testCases/dimensionResults/{fqn} with
 * dimensionName / startTs / endTs. Server side:
 * TestCaseDimensionResultResource @Path
 * "/v1/dataQuality/testCases/dimensionResults".
 */
export function listTestCaseDimensionResults(
  fqn: string,
  params: { dimensionName?: string; startTs?: number; endTs?: number } = {},
): Promise<Paged<TestCaseDimensionResult>> {
  const query: Record<string, string> = {};
  if (params.dimensionName) {
    query.dimensionName = params.dimensionName;
  }
  if (params.startTs !== undefined) {
    query.startTs = String(params.startTs);
  }
  if (params.endTs !== undefined) {
    query.endTs = String(params.endTs);
  }
  return apiRequest<unknown>(`/v1/dataQuality/testCases/dimensionResults/${encodeURIComponent(fqn)}`, {
    query,
  }).then((payload) => parsePaged(payload, mapDimensionResult));
}

export function listTestCases(query: ListTestCasesQuery = {}): Promise<TestCaseListPage> {
  return apiRequest<unknown>('/v1/dataQuality/testCases', {
    query: {
      fields: TEST_CASE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      entityFQN: query.entityFQN,
      entityLink: query.entityLink,
      testSuiteId: query.testSuiteId,
      includeAllTests: query.includeAllTests,
      testCaseStatus: query.testCaseStatus,
      include: query.include,
      testCaseType: query.testCaseType,
      includePermissions: query.includePermissions === true ? true : undefined,
    },
  }).then((payload) => parseTestCaseListPayload(payload));
}

export async function getTestCase(id: string): Promise<TestCase> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/dataQuality/testCases/${encodeURIComponent(id)}`, {
    query: { fields: TEST_CASE_FIELDS },
  });
  const mapped = mapTestCase(raw);
  if (!mapped) {
    throw new Error('Test case response was missing id and name');
  }
  return mapped;
}

/**
 * Official getTestCaseByName (rest/testAPI.ts): GET
 * /v1/dataQuality/testCases/name/{fqn}. The {id} slot takes a UUID
 * only, so the /test-case/:fqn alias (F-D-4) loads through this
 * endpoint; the product path keeps loading by id.
 * ADR:2026-11-08-incident-detail-redirects-to-test-case
 */
export async function getTestCaseByName(fqn: string): Promise<TestCase> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataQuality/testCases/name/${encodeURIComponent(fqn)}`,
    { query: { fields: TEST_CASE_FIELDS } },
  );
  const mapped = mapTestCase(raw);
  if (!mapped) {
    throw new Error('Test case response was missing id and name');
  }
  return mapped;
}

export async function createTestCase(body: CreateTestCaseRequest): Promise<TestCase> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testCases', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTestCase(raw);
  if (!mapped) {
    throw new Error('Create test case succeeded but the response had no test case');
  }
  return mapped;
}

/** Official updateTestCase (rest/testAPI.ts): PATCH /v1/dataQuality/testCases/{id}. */
export async function patchTestCase(id: string, patch: unknown[]): Promise<TestCase> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataQuality/testCases/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: patch,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = mapTestCase(raw);
  if (!mapped) {
    throw new Error('Update test case succeeded but the response had no test case');
  }
  return mapped;
}

export async function updateTestCase(body: CreateTestCaseRequest): Promise<TestCase> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testCases', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTestCase(raw);
  if (!mapped) {
    throw new Error('Update test case succeeded but the response had no test case');
  }
  return mapped;
}

export function listTestCasesBySearch(query: SearchTestCasesQuery = {}): Promise<TestCaseListPage> {
  return apiRequest<unknown>('/v1/dataQuality/testCases/search/list', {
    query: {
      fields: query.fields ?? TEST_CASE_FIELDS,
      q: query.q,
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      testCaseStatus: query.testCaseStatus,
      dataQualityDimension: query.dataQualityDimension,
      owner: query.owner,
      followedBy: query.followedBy,
      testCaseType: query.testCaseType,
      tags: query.tags,
      tier: query.tier,
      dataProductFqn: query.dataProductFqn,
      startTimestamp: query.startTimestamp,
      endTimestamp: query.endTimestamp,
      includeAllTests: query.includeAllTests ?? true,
      testSuiteId: query.testSuiteId,
      entityLink: query.entityLink,
      entityFQN: query.entityFQN ?? query.tableFqn,
      columnName: query.columnName,
      testPlatforms: query.testPlatforms,
      serviceName: query.serviceName,
      include: query.include,
      sortField: query.sortField,
      sortType: query.sortType,
      includePermissions: query.includePermissions === false ? undefined : true,
    },
  }).then((payload) => parseTestCaseListPayload(payload));
}

export async function isTestCaseSearchListAvailable(): Promise<boolean> {
  try {
    await listTestCasesBySearch({ limit: 1, includeAllTests: true });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return false;
    }
    throw error;
  }
}

export interface DeleteEntityOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/** Official test-case delete via the generic deleteEntity surface (rest/miscAPI.ts). */
export function deleteTestCase(id: string, options: DeleteEntityOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/dataQuality/testCases/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete: options.hardDelete, recursive: options.recursive },
  });
}

/**
 * Official addTestCaseToLogicalTestSuite (rest/testAPI.ts): PUT logicalTestCases.
 * Only logical suites accept this surface; basic suites bind tests via entities.
 */
export function addTestCasesToLogicalTestSuite(testSuiteId: string, testCaseIds: string[]): Promise<unknown> {
  return apiRequest('/v1/dataQuality/testCases/logicalTestCases', {
    method: 'PUT',
    json: { testSuiteId, testCaseIds },
  });
}

/** Official removeTestCaseFromTestSuite (rest/testAPI.ts): DELETE logicalTestCases/{suiteId}/{caseId}. */
export function removeTestCaseFromTestSuite(testSuiteId: string, testCaseId: string): Promise<unknown> {
  return apiRequest(
    `/v1/dataQuality/testCases/logicalTestCases/${encodeURIComponent(testSuiteId)}/${encodeURIComponent(testCaseId)}`,
    { method: 'DELETE' },
  );
}

/** Official getTestCaseFailedSampleData (rest/testAPI.ts): GET …/failedRowsSample. */
export function getTestCaseFailedSampleData(id: string): Promise<TableSampleData> {
  return apiRequest<TableSampleData>(
    `/v1/dataQuality/testCases/${encodeURIComponent(id)}/failedRowsSample`,
  );
}

/** Official deleteTestCaseFailedSampleData (rest/testAPI.ts): DELETE …/failedRowsSample. */
export function deleteTestCaseFailedSampleData(id: string): Promise<unknown> {
  return apiRequest(`/v1/dataQuality/testCases/${encodeURIComponent(id)}/failedRowsSample`, {
    method: 'DELETE',
  });
}

/** Official exportTestCasesInCSV (rest/testAPI.ts): GET /dataQuality/testCases/name/{fqn}/exportAsync. */
export function exportTestCasesInCSV(
  name: string,
  params: Record<string, string | boolean | number | undefined> = {},
): Promise<unknown> {
  return apiRequest(`/v1/dataQuality/testCases/name/${encodeURIComponent(name)}/exportAsync`, {
    query: params,
  });
}
