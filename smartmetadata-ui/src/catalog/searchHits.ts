/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef, SearchExplanation, SearchHit, SearchPage, TagRef } from '@/types/api';
import { mapUsageSummary } from './usagePercentile';
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

// labelType is intentionally dropped here: search surfaces render Generated
// tags plain per the pin gate (D-F1), and ES payload carriage is unverified (Q4).
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
    const source = rec.source === 'Glossary' || rec.source === 'Classification' ? rec.source : undefined;
    return [{ tagFQN: tagFQN || name, name: name || tagFQN, source }];
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

// Ranking payload (Explore D12): the ES `_explanation` tree is only
// present when the request sent `explain: true`. Malformed nodes are
// dropped, and the walk stops at the same depth the ranking parser
// reads (8), so a pathological payload cannot grow the mapped hit.
function mapExplanation(value: unknown, depth = 0): SearchExplanation | undefined {
  const rec = asRecord(value);
  if (!rec || typeof rec.value !== 'number' || !Number.isFinite(rec.value)) {
    return undefined;
  }
  const description = asString(rec.description);
  if (!description) {
    return undefined;
  }
  const details =
    depth < 8 && Array.isArray(rec.details)
      ? rec.details.flatMap((detail) => {
          const mapped = mapExplanation(detail, depth + 1);
          return mapped ? [mapped] : [];
        })
      : undefined;
  return { value: rec.value, description, ...(details?.length ? { details } : {}) };
}

// NLQ echo (Explore D11): pin's SearchResponse carries
// `applied_quick_filters` on NLQ responses; only the `fieldList` (the
// backend-detected filter fields) is surfaced, which is what the echo
// display reads. Anything else in the object is dropped, never shown.
function mapAppliedQuickFilters(value: unknown): { fieldList?: string[] } | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const fieldList = Array.isArray(rec.fieldList)
    ? rec.fieldList.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
  return fieldList?.length ? { fieldList } : undefined;
}

function mapHighlight(value: unknown): Record<string, string[]> | undefined {
  const node = asRecord(value);
  if (!node) {
    return undefined;
  }
  const highlight: Record<string, string[]> = {};
  for (const [key, fragments] of Object.entries(node)) {
    if (Array.isArray(fragments)) {
      highlight[key] = fragments.map((fragment) => String(fragment));
    }
  }
  return Object.keys(highlight).length ? highlight : undefined;
}

function nestedFqn(value: unknown): string | undefined {
  const rec = asRecord(value);
  return asString(rec?.fullyQualifiedName) || undefined;
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
    // Pin explore card rule: the percentile shows when the _source carries
    // the usageSummary key at all, even with no weekly rank (which then
    // falls back to 0). A present-but-unmappable value still counts.
    const usageSummary =
      'usageSummary' in source ? (mapUsageSummary(source.usageSummary) ?? {}) : undefined;
    // Official Domain.domainType enum (domain.json): only the three enum
    // values pass through; anything else is dropped, never shown.
    const domainTypeRaw = asString(source.domainType);
    const domainType =
      domainTypeRaw === 'Source-aligned' || domainTypeRaw === 'Consumer-aligned' || domainTypeRaw === 'Aggregate'
        ? domainTypeRaw
        : undefined;
    const mapped: SearchHit = {
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
      serviceFqn: nestedFqn(source.service),
      databaseFqn: nestedFqn(source.database),
      schemaFqn: nestedFqn(source.databaseSchema),
      highlight: mapHighlight(hit.highlight),
      tier: mapTier(source),
      owners: mapOwners(source.owners),
      tags: mapTags(source.tags),
      domains: mapOwners(source.domains),
      dataProducts: mapOwners(source.dataProducts),
      dataType: asString(source.dataType) || undefined,
      domainType,
      tableName: nestedName(source.table, 'displayName', 'name') || asString(source.tableName) || undefined,
      tableFqn: asString(asRecord(source.table)?.fullyQualifiedName) || undefined,
      constraint: asString(source.constraint) || undefined,
      updatedAt:
        typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
          ? source.updatedAt
          : undefined,
      entityStatus: asString(source.entityStatus) || undefined,
      parent: mapOwners(source.parent ? [source.parent] : [])[0],
      requestMethod: asString(source.requestMethod) || undefined,
      metricType: asString(source.metricType) || undefined,
      granularity: asString(source.granularity) || undefined,
      childrenCount:
        typeof source.childrenCount === 'number' && Number.isFinite(source.childrenCount)
          ? source.childrenCount
          : undefined,
      usageSummary,
      // Ranking payload: only present when the request sent
      // `explain: true`; a missing `_score` stays absent rather than 0,
      // so the card can tell "no ranking data" from a zero score.
      score:
        typeof hit._score === 'number' && Number.isFinite(hit._score) ? hit._score : undefined,
      explanation: mapExplanation(hit._explanation),
      matchedQueries: Array.isArray(hit.matched_queries)
        ? hit.matched_queries.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
    };
    return [mapped];
  });

  const appliedQuickFilters = mapAppliedQuickFilters(root?.applied_quick_filters);
  return {
    total: readTotal(hitsNode),
    hits,
    facets,
    ...(appliedQuickFilters ? { appliedQuickFilters } : {}),
  };
}
