/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef, SearchHit, SearchPage, TagRef } from '@/types/api';
import { mapSearchAggregations } from './searchFacets';

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
    const name = asString(rec.name) || asString(rec.displayName);
    if (!name) {
      return [];
    }
    return [
      {
        id: asString(rec.id) || undefined,
        name,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
      },
    ];
  });
}

function mapTags(value: unknown): TagRef[] {
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
    if (!name && !tagFQN) {
      return [];
    }
    return [{ tagFQN: tagFQN || name, name: name || tagFQN }];
  });
}

function entityTypeFromIndex(index: string): string {
  const match = index.match(/([a-z]+)_search_index/i);
  return match ? match[1].toLowerCase() : '';
}

function readTotal(hits: Record<string, unknown>): number {
  const total = hits.total;
  if (typeof total === 'number') {
    return total;
  }
  const rec = asRecord(total);
  if (rec && typeof rec.value === 'number') {
    return rec.value;
  }
  return 0;
}

function nestedName(value: unknown, ...keys: string[]): string {
  const rec = asRecord(value);
  if (!rec) {
    return typeof value === 'string' ? value : '';
  }
  for (const key of keys) {
    const found = asString(rec[key]);
    if (found) {
      return found;
    }
  }
  return '';
}

function mapTier(source: Record<string, unknown>): string | undefined {
  const direct = asString(source.tier);
  if (direct) {
    return direct;
  }
  const tier = nestedName(source.tier, 'tagFQN', 'name', 'displayName');
  return tier || undefined;
}

export function hitLocation(hit: SearchHit): string {
  return [hit.serviceName, hit.databaseName, hit.schemaName].filter(Boolean).join(' / ');
}

const ENTITY_TAG_COLOR: Record<string, string> = {
  table: 'blue',
  topic: 'purple',
  dashboard: 'cyan',
  pipeline: 'orange',
  mlmodel: 'magenta',
  container: 'geekblue',
  database: 'green',
  databaseSchema: 'lime',
};

export function entityTypeColor(entityType: string): string {
  return ENTITY_TAG_COLOR[entityType] ?? 'default';
}

export function mapSearchResponse(payload: unknown): SearchPage {
  const facets = mapSearchAggregations(payload);
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  if (!hitsNode || !Array.isArray(hitsNode.hits)) {
    return { total: 0, hits: [], facets };
  }

  const hits: SearchHit[] = hitsNode.hits.flatMap((raw) => {
    const hit = asRecord(raw);
    if (!hit) {
      return [];
    }
    const source = asRecord(hit._source) ?? {};
    const index = asString(hit._index);
    const fullyQualifiedName = asString(source.fullyQualifiedName);
    const name = asString(source.name) || asString(source.displayName);
    if (!fullyQualifiedName && !name) {
      return [];
    }
    const serviceName =
      nestedName(source.service, 'displayName', 'name', 'fullyQualifiedName') ||
      asString(source.serviceName) ||
      undefined;
    return [
      {
        id: asString(source.id) || asString(hit._id) || undefined,
        name: name || fullyQualifiedName,
        displayName: asString(source.displayName) || undefined,
        fullyQualifiedName,
        entityType: asString(source.entityType) || entityTypeFromIndex(index),
        description: asString(source.description) || undefined,
        serviceType: asString(source.serviceType) || undefined,
        serviceName,
        databaseName: nestedName(source.database, 'displayName', 'name') || undefined,
        schemaName: nestedName(source.databaseSchema, 'displayName', 'name') || undefined,
        tier: mapTier(source),
        owners: mapOwners(source.owners),
        tags: mapTags(source.tags),
      },
    ];
  });

  return { total: readTotal(hitsNode), hits, facets };
}
