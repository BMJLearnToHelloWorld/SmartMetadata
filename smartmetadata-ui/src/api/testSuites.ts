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
import type { CreateTestSuiteRequest, TestSuite, TestSummary } from '@/types/quality';
import { ApiError, apiRequest } from './client';

export const TEST_SUITE_FIELDS = 'owners,reviewers,tests,summary';

export interface ListTestSuitesQuery {
  limit?: number;
  after?: string;
  testSuiteType?: string;
  includeEmptyTestSuites?: boolean;
}

export interface SearchTestSuitesQuery {
  q?: string;
  limit?: number;
  offset?: number;
  owner?: string;
  testSuiteType?: string;
  includeEmptyTestSuites?: boolean;
  sortField?: string;
  sortType?: 'asc' | 'desc';
}

function mapSummary(value: unknown): TestSummary | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    success: asNumber(rec.success),
    failed: asNumber(rec.failed),
    aborted: asNumber(rec.aborted),
    queued: asNumber(rec.queued),
    total: asNumber(rec.total),
  };
}

function mapTestSuite(raw: Record<string, unknown>): TestSuite | null {
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
    basic: asBoolean(raw.basic),
    basicEntityReference: asString(raw.basicEntityReference) || undefined,
    tests: mapEntityRefs(raw.tests),
    summary: mapSummary(raw.summary),
    owners: mapEntityRefs(raw.owners),
  };
}

export function listTestSuites(query: ListTestSuitesQuery = {}): Promise<Paged<TestSuite>> {
  return apiRequest<unknown>('/v1/dataQuality/testSuites', {
    query: {
      fields: TEST_SUITE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      testSuiteType: query.testSuiteType,
      includeEmptyTestSuites: query.includeEmptyTestSuites ?? true,
    },
  }).then((payload) => parsePaged(payload, mapTestSuite));
}

export async function getTestSuite(id: string): Promise<TestSuite> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/dataQuality/testSuites/${encodeURIComponent(id)}`, {
    query: { fields: TEST_SUITE_FIELDS },
  });
  const mapped = mapTestSuite(raw);
  if (!mapped) {
    throw new Error('Test suite response was missing id and name');
  }
  return mapped;
}

export async function createTestSuite(body: CreateTestSuiteRequest): Promise<TestSuite> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testSuites', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTestSuite(raw);
  if (!mapped) {
    throw new Error('Create test suite succeeded but the response had no suite');
  }
  return mapped;
}

export async function updateTestSuite(body: CreateTestSuiteRequest): Promise<TestSuite> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testSuites', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTestSuite(raw);
  if (!mapped) {
    throw new Error('Update test suite succeeded but the response had no suite');
  }
  return mapped;
}

export function listTestSuitesBySearch(query: SearchTestSuitesQuery = {}): Promise<Paged<TestSuite>> {
  return apiRequest<unknown>('/v1/dataQuality/testSuites/search/list', {
    query: {
      fields: TEST_SUITE_FIELDS,
      q: query.q,
      limit: query.limit ?? 25,
      offset: query.offset ?? 0,
      owner: query.owner,
      testSuiteType: query.testSuiteType,
      includeEmptyTestSuites: query.includeEmptyTestSuites,
      sortField: query.sortField ?? 'lastResultTimestamp',
      sortType: query.sortType ?? 'desc',
    },
  }).then((payload) => parsePaged(payload, mapTestSuite));
}

export async function isTestSuiteSearchListAvailable(): Promise<boolean> {
  try {
    await listTestSuitesBySearch({ limit: 1, includeEmptyTestSuites: true });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return false;
    }
    throw error;
  }
}
