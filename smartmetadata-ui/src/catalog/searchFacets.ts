/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export const FACET_IDS = [
  'entityType',
  'serviceType',
  'service',
  'database',
  'schema',
  'tagFqn',
  'owner',
  'domain',
  'tier',
  'certification',
  'dataProduct',
] as const;

/** Top-bar chips shown even when the aggregation is empty (honest empty dropdown). */
export const CHIP_FACET_IDS = [
  'entityType',
  'domain',
  'dataProduct',
  'owner',
  'tagFqn',
  'tier',
  'certification',
  'service',
  'serviceType',
] as const;

export type FacetId = (typeof FACET_IDS)[number];

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchFacet {
  id: FacetId;
  field: string;
  buckets: FacetBucket[];
}

/**
 * Names from server searchSettings.json (and typed ES/OS prefixes like
 * `sterms#`) that we can filter with documented Lucene `q=` terms.
 */
const AGG_TO_FACET: Record<string, { id: FacetId; field: string }> = {
  entityType: { id: 'entityType', field: 'entityType' },
  'entityType.keyword': { id: 'entityType', field: 'entityType' },
  serviceType: { id: 'serviceType', field: 'serviceType' },
  'service.displayName.keyword': { id: 'service', field: 'service.displayName.keyword' },
  'database.name.keyword': { id: 'database', field: 'database.name.keyword' },
  'databaseSchema.name.keyword': { id: 'schema', field: 'databaseSchema.name.keyword' },
  'tags.tagFQN': { id: 'tagFqn', field: 'tags.tagFQN' },
  ownerDisplayName: { id: 'owner', field: 'ownerDisplayName' },
  'domains.displayName.keyword': { id: 'domain', field: 'domains.displayName.keyword' },
  'tier.tagFQN': { id: 'tier', field: 'tier.tagFQN' },
  'certification.tagLabel.tagFQN': { id: 'certification', field: 'certification.tagLabel.tagFQN' },
  'dataProducts.displayName.keyword': { id: 'dataProduct', field: 'dataProducts.displayName.keyword' },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stripAggPrefix(name: string): string {
  const hash = name.indexOf('#');
  return hash >= 0 ? name.slice(hash + 1) : name;
}

function readBuckets(node: Record<string, unknown>): FacetBucket[] {
  if (!Array.isArray(node.buckets)) {
    return [];
  }
  return node.buckets.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const key = typeof rec.key === 'string' ? rec.key : rec.key !== undefined ? String(rec.key) : '';
    const count = typeof rec.doc_count === 'number' ? rec.doc_count : 0;
    return key ? [{ key, count }] : [];
  });
}

export function mapSearchAggregations(payload: unknown): SearchFacet[] {
  const root = asRecord(payload);
  const aggregations = asRecord(root?.aggregations);
  if (!aggregations) {
    return [];
  }

  const byId = new Map<FacetId, SearchFacet>();
  for (const [rawName, rawNode] of Object.entries(aggregations)) {
    const node = asRecord(rawNode);
    if (!node) {
      continue;
    }
    const mapped = AGG_TO_FACET[stripAggPrefix(rawName)];
    if (!mapped) {
      continue;
    }
    const buckets = readBuckets(node);
    if (!buckets.length) {
      continue;
    }
    const existing = byId.get(mapped.id);
    if (!existing || buckets.length > existing.buckets.length) {
      byId.set(mapped.id, { id: mapped.id, field: mapped.field, buckets });
    }
  }

  return FACET_IDS.flatMap((id) => {
    const facet = byId.get(id);
    return facet ? [facet] : [];
  });
}
