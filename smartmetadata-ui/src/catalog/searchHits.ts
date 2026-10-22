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

export function mapSearchResponse(payload: unknown): SearchPage {
  const root = asRecord(payload);
  const hitsNode = asRecord(root?.hits);
  if (!hitsNode || !Array.isArray(hitsNode.hits)) {
    return { total: 0, hits: [] };
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
    return [
      {
        id: asString(source.id) || asString(hit._id) || undefined,
        name: name || fullyQualifiedName,
        displayName: asString(source.displayName) || undefined,
        fullyQualifiedName,
        entityType: asString(source.entityType) || entityTypeFromIndex(index),
        description: asString(source.description) || undefined,
        owners: mapOwners(source.owners),
        tags: mapTags(source.tags),
      },
    ];
  });

  return { total: readTotal(hitsNode), hits };
}
