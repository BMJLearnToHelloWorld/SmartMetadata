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
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { CreateTestCaseRequest, TestCase, TestCaseResult, TestParameterValue } from '@/types/quality';
import { apiRequest } from './client';

export const TEST_CASE_FIELDS =
  'owners,testSuite,testDefinition,testSuites,incidentId,incidentStatus,testCaseResult';

export interface ListTestCasesQuery {
  limit?: number;
  after?: string;
  entityFQN?: string;
  entityLink?: string;
  testSuiteId?: string;
  includeAllTests?: boolean;
  testCaseStatus?: string;
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

export function mapTestCaseResult(value: unknown): TestCaseResult | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const status = asString(rec.testCaseStatus);
  const result = asString(rec.result);
  const fqn = asString(rec.testCaseFQN);
  const timestamp = asNumber(rec.timestamp);
  if (!status && !result && timestamp === undefined && !fqn) {
    return undefined;
  }
  return {
    timestamp,
    testCaseStatus: status || undefined,
    result: result || undefined,
    testCaseFQN: fqn || undefined,
  };
}

function mapTestCase(raw: Record<string, unknown>): TestCase | null {
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
    entityLink: asString(raw.entityLink) || undefined,
    entityFQN: asString(raw.entityFQN) || undefined,
    testDefinition: mapEntityRef(raw.testDefinition),
    testSuite: mapEntityRef(raw.testSuite),
    testSuites: mapEntityRefs(raw.testSuites),
    parameterValues: mapParameterValues(raw.parameterValues),
    testCaseResult: mapTestCaseResult(raw.testCaseResult),
    testCaseStatus: asString(raw.testCaseStatus) || undefined,
    incidentId: asString(raw.incidentId) || undefined,
  };
}

export function listTestCases(query: ListTestCasesQuery = {}): Promise<Paged<TestCase>> {
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
    },
  }).then((payload) => parsePaged(payload, mapTestCase));
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
