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
import { estateFromQuery } from './browseEstate';

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
  certification: 'certification.tagLabel.tagFQN',
  dataProduct: 'dataProducts.displayName.keyword',
};

export const SORT_OPTIONS = [
  { id: 'relevance', field: '_score', defaultOrder: 'desc' },
  { id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' },
  { id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' },
  { id: 'updated', field: 'updatedAt', defaultOrder: 'desc' },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]['id'];
export type SortOrder = 'asc' | 'desc';

export interface SearchSort {
  id: SortId;
  order: SortOrder;
}

export const DEFAULT_SORT: SearchSort = { id: 'relevance', order: 'desc' };

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

export function sortFromQuery(query: Record<string, unknown>): SearchSort {
  const raw = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const option = SORT_OPTIONS.find((item) => item.id === raw) ?? SORT_OPTIONS[0];
  const rawOrder = Array.isArray(query.order) ? query.order[0] : query.order;
  const order: SortOrder = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : option.defaultOrder;
  return { id: option.id, order };
}

export function sortField(sort: SearchSort): string {
  return SORT_OPTIONS.find((item) => item.id === sort.id)?.field ?? '_score';
}

export interface SearchRouteOptions {
  sort?: SearchSort;
  estate?: string;
}

export function searchRouteQuery(
  userQuery: string,
  filters: SearchFilters,
  page = 0,
  options: SearchRouteOptions = {},
): Record<string, string> {
  const next = filtersToQuery(filters);
  const trimmed = userQuery.trim();
  if (trimmed) {
    next.q = trimmed;
  }
  if (page > 0) {
    next.page = String(page);
  }
  const sort = options.sort ?? DEFAULT_SORT;
  if (sort.id !== DEFAULT_SORT.id) {
    next.sort = sort.id;
  }
  const option = SORT_OPTIONS.find((item) => item.id === sort.id) ?? SORT_OPTIONS[0];
  if (sort.order !== option.defaultOrder) {
    next.sort = sort.id;
    next.order = sort.order;
  }
  const estate = options.estate ?? '';
  if (estate) {
    next.estate = estate;
  }
  return next;
}

export function searchRouteFromLocation(
  userQuery: string,
  query: Record<string, unknown>,
  page = 0,
  overrides: SearchRouteOptions & { filters?: SearchFilters } = {},
): Record<string, string> {
  return searchRouteQuery(
    userQuery,
    overrides.filters ?? filtersFromQuery(query),
    page,
    {
      sort: overrides.sort ?? sortFromQuery(query),
      estate: overrides.estate ?? estateFromQuery(query),
    },
  );
}
