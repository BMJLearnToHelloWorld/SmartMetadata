/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FacetId } from './searchFacets';

export type SearchFilters = Partial<Record<FacetId, string[]>>;

export const FILTER_LUCENE_FIELD: Record<FacetId, string> = {
  entityType: 'entityType',
  serviceType: 'serviceType',
  service: 'service.displayName.keyword',
  database: 'database.name.keyword',
  schema: 'databaseSchema.name.keyword',
  tagFqn: 'tags.tagFQN',
  owner: 'ownerDisplayName',
  domain: 'domains.displayName.keyword',
  tier: 'tier.tagFQN',
};

export const SEARCH_PAGE_SIZE = 20;

const SPECIAL = /[\s+\-!(){}[\]^"~*?:\\/]/;

export function luceneTerm(field: string, value: string): string {
  if (SPECIAL.test(value)) {
    return `${field}:"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `${field}:${value}`;
}

export function composeSearchQuery(userQuery: string, filters: SearchFilters = {}): string {
  const clauses: string[] = [];
  const trimmed = userQuery.trim();
  if (trimmed && trimmed !== '*') {
    clauses.push(trimmed);
  }
  for (const id of Object.keys(FILTER_LUCENE_FIELD) as FacetId[]) {
    const values = (filters[id] ?? []).filter((value) => value.trim().length > 0);
    if (!values.length) {
      continue;
    }
    const field = FILTER_LUCENE_FIELD[id];
    if (values.length === 1) {
      clauses.push(luceneTerm(field, values[0]));
    } else {
      clauses.push(`(${values.map((value) => luceneTerm(field, value)).join(' OR ')})`);
    }
  }
  return clauses.length ? clauses.join(' AND ') : '*';
}

export function readQueryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []));
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function filtersFromQuery(query: Record<string, unknown>): SearchFilters {
  const filters: SearchFilters = {};
  (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).forEach((id) => {
    const values = readQueryList(query[id]);
    if (values.length) {
      filters[id] = values;
    }
  });
  return filters;
}

export function filtersToQuery(filters: SearchFilters): Record<string, string> {
  const next: Record<string, string> = {};
  (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).forEach((id) => {
    const values = filters[id];
    if (values?.length) {
      next[id] = values.join(',');
    }
  });
  return next;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return (Object.keys(FILTER_LUCENE_FIELD) as FacetId[]).some((id) => (filters[id]?.length ?? 0) > 0);
}

export function toggleFilterValue(filters: SearchFilters, id: FacetId, value: string): SearchFilters {
  const current = filters[id] ?? [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return {
    ...filters,
    [id]: next,
  };
}

export function pageFromQuery(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function searchRouteQuery(userQuery: string, filters: SearchFilters, page = 0): Record<string, string> {
  const next = filtersToQuery(filters);
  const trimmed = userQuery.trim();
  if (trimmed) {
    next.q = trimmed;
  }
  if (page > 0) {
    next.page = String(page);
  }
  return next;
}
