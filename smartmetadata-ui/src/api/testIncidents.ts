/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type { CreateTestIncidentRequest, TestIncident } from '@/types/quality';
import { apiRequest } from './client';

export interface ListTestIncidentsQuery {
  limit?: number;
  latest?: boolean;
  testCaseFQN?: string;
  originEntityFQN?: string;
  testCaseResolutionStatusType?: string;
}

function mapEntityRef(value: unknown): EntityRef | undefined {
  return mapEntityRefs(value ? [value] : [])[0];
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
  };
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
