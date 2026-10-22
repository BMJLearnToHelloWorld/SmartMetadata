/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { CreateTestDefinitionRequest, TestDefinition, TestParameterDefinition } from '@/types/quality';
import { apiRequest } from './client';

export const TEST_DEFINITION_FIELDS = 'owners';

export interface ListTestDefinitionsQuery {
  limit?: number;
  after?: string;
  entityType?: string;
  testPlatform?: string;
}

function mapParameterDefinition(value: unknown): TestParameterDefinition[] {
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
    return [
      {
        name,
        displayName: asString(rec.displayName) || undefined,
        dataType: asString(rec.dataType) || undefined,
        description: asString(rec.description) || undefined,
        required: asBoolean(rec.required),
      },
    ];
  });
}

function mapTestDefinition(raw: Record<string, unknown>): TestDefinition | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const platforms = Array.isArray(raw.testPlatforms)
    ? raw.testPlatforms.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    entityType: asString(raw.entityType) || undefined,
    testPlatforms: platforms,
    dataQualityDimension: asString(raw.dataQualityDimension) || undefined,
    parameterDefinition: mapParameterDefinition(raw.parameterDefinition),
    provider: asString(raw.provider) || undefined,
  };
}

export function listTestDefinitions(query: ListTestDefinitionsQuery = {}): Promise<Paged<TestDefinition>> {
  return apiRequest<unknown>('/v1/dataQuality/testDefinitions', {
    query: {
      fields: TEST_DEFINITION_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      entityType: query.entityType,
      testPlatform: query.testPlatform,
    },
  }).then((payload) => parsePaged(payload, mapTestDefinition));
}

export async function getTestDefinition(id: string): Promise<TestDefinition> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/dataQuality/testDefinitions/${encodeURIComponent(id)}`,
    { query: { fields: TEST_DEFINITION_FIELDS } },
  );
  const mapped = mapTestDefinition(raw);
  if (!mapped) {
    throw new Error('Test definition response was missing id and name');
  }
  return mapped;
}

export async function createTestDefinition(body: CreateTestDefinitionRequest): Promise<TestDefinition> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testDefinitions', {
    method: 'POST',
    json: body,
  });
  const mapped = mapTestDefinition(raw);
  if (!mapped) {
    throw new Error('Create test definition succeeded but the response had no definition');
  }
  return mapped;
}

export async function updateTestDefinition(body: CreateTestDefinitionRequest): Promise<TestDefinition> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/dataQuality/testDefinitions', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapTestDefinition(raw);
  if (!mapped) {
    throw new Error('Update test definition succeeded but the response had no definition');
  }
  return mapped;
}
