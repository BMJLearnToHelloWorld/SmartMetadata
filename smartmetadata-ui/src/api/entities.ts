/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { resolveDetailEndpoint, resolvePatchPath } from '@/catalog/entityRoutes';
import type { AssetDetail, EntityRef, SchemaRow, TagRef } from '@/types/api';
import { apiRequest } from './client';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mapOwners(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.displayName) || asString(rec.name) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
      },
    ];
  });
}

export function mapTags(value: unknown): TagRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const tagFQN = asString(rec.tagFQN);
    const name = asString(rec.name) || tagFQN;
    const source = asString(rec.source);
    return name || tagFQN
      ? [
          {
            tagFQN: tagFQN || name,
            name: name || tagFQN,
            source: source === 'Glossary' || source === 'Classification' ? source : undefined,
          },
        ]
      : [];
  });
}

function mapColumns(value: unknown): SchemaRow[] {
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
        dataType: asString(rec.dataTypeDisplay) || asString(rec.dataType),
        description: asString(rec.description) || undefined,
      },
    ];
  });
}

function schemaRowsFor(entityType: string, body: Record<string, unknown>): { rows: SchemaRow[]; label: string } {
  if (entityType === 'table') {
    return { rows: mapColumns(body.columns), label: 'Columns' };
  }
  if (entityType === 'topic') {
    const schema = asRecord(body.messageSchema);
    return { rows: mapColumns(schema?.schemaFields), label: 'Schema fields' };
  }
  return { rows: [], label: 'Schema' };
}

export async function fetchAssetDetail(entityType: string, fqn: string): Promise<AssetDetail> {
  const endpoint = resolveDetailEndpoint(entityType, fqn);
  if (!endpoint) {
    throw new Error(`No Phase 1 detail endpoint for entity type "${entityType}"`);
  }
  const body = await apiRequest<Record<string, unknown>>(endpoint.path, {
    query: { fields: endpoint.fields },
  });
  const schema = schemaRowsFor(entityType, body);
  return {
    entityType,
    id: asString(body.id) || undefined,
    name: asString(body.name) || asString(body.displayName) || fqn,
    displayName: asString(body.displayName) || undefined,
    fullyQualifiedName: asString(body.fullyQualifiedName) || fqn,
    description: asString(body.description) || undefined,
    owners: mapOwners(body.owners),
    tags: mapTags(body.tags),
    domains: mapOwners(body.domains),
    schemaRows: schema.rows,
    schemaLabel: schema.label,
    extension: asRecord(body.extension) || undefined,
  };
}

export function patchAsset(entityType: string, id: string, patch: JsonPatchOp[]): Promise<unknown> {
  const path = resolvePatchPath(entityType, id);
  if (!path) {
    throw new Error(`No Phase 4 patch endpoint for entity type "${entityType}"`);
  }
  return apiRequest(path, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}
