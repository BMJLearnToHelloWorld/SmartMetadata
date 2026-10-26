/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FacetBucket } from '@/catalog/searchFacets';
import { composeSearchQuery, luceneTerm, type SearchFilters } from '@/catalog/searchQuery';
import type { LoginUser, SearchHit } from '@/types/api';

export type CountSort = 'high' | 'low';
export type AssetSort = 'latest' | 'name';
export type ActivityFilter = 'all' | string;
export type TotalRangeDays = 7 | 30;

export function domainFilters(domain: string | undefined): SearchFilters {
  const trimmed = domain?.trim();
  return trimmed ? { domain: [trimmed] } : {};
}

export function ownedAssetsQuery(user: LoginUser | null | undefined): string {
  if (user?.id) {
    return luceneTerm('owners.id', user.id);
  }
  if (user?.name) {
    return luceneTerm('owners.name', user.name);
  }
  return '';
}

export function followedAssetsQuery(user: LoginUser | null | undefined): string {
  if (user?.id) {
    return luceneTerm('followers', user.id);
  }
  if (user?.name) {
    return luceneTerm('followers', user.name);
  }
  return '';
}

export function scopedSearchQuery(base: string, domain?: string): string {
  return composeSearchQuery(base, domainFilters(domain));
}

export function isOwnedSearch(query: string): boolean {
  return query.includes('owners.id:') || query.includes('owners.name:');
}

export function isFollowedSearch(query: string): boolean {
  return query.includes('followers:');
}

export function sortCountBuckets(buckets: FacetBucket[], order: CountSort): FacetBucket[] {
  return buckets.toSorted((left, right) =>
    order === 'low' ? left.count - right.count : right.count - left.count,
  );
}

export function hitLabel(hit: SearchHit): string {
  return hit.displayName || hit.name;
}

export function sortHits(hits: SearchHit[], order: AssetSort): SearchHit[] {
  if (order === 'name') {
    return hits.toSorted((left, right) => hitLabel(left).localeCompare(hitLabel(right)));
  }
  return hits.toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

export function activityLabel(event: { summary?: string; eventType: string; entity?: { displayName?: string; name?: string } }): string {
  if (event.summary?.trim()) {
    return event.summary.trim();
  }
  const entity = event.entity?.displayName || event.entity?.name;
  return entity ? `${event.eventType} · ${entity}` : event.eventType;
}
