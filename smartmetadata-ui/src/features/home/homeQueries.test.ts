/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { SearchHit } from '@/types/api';
import {
  activityLabel,
  followedAssetsQuery,
  isFollowedSearch,
  isOwnedSearch,
  ownedAssetsQuery,
  scopedSearchQuery,
  sortCountBuckets,
  sortHits,
} from './homeQueries';

function hit(name: string, extra: Partial<SearchHit> = {}): SearchHit {
  return {
    name,
    fullyQualifiedName: `svc.${name}`,
    entityType: 'table',
    owners: [],
    tags: [],
    ...extra,
  };
}

describe('homeQueries', () => {
  it('builds owned and followed Lucene terms from the logged-in user', () => {
    expect(ownedAssetsQuery({ id: 'u-1', name: 'admin' })).toBe('owners.id:"u-1"');
    expect(followedAssetsQuery({ id: 'u-1', name: 'admin' })).toBe('followers:"u-1"');
    expect(ownedAssetsQuery({ name: 'admin' })).toBe('owners.name:admin');
    expect(ownedAssetsQuery(null)).toBe('');
    expect(isOwnedSearch('owners.id:u-1 AND domains.displayName.keyword:finance')).toBe(true);
    expect(isFollowedSearch('followers:u-1')).toBe(true);
  });

  it('scopes a base query with the domain facet when a domain is selected', () => {
    expect(scopedSearchQuery('*')).toBe('*');
    expect(scopedSearchQuery('orders', 'finance')).toBe(
      'orders AND domains.displayName.keyword:finance',
    );
    expect(scopedSearchQuery('owners.id:u-1', 'Life Sciences')).toBe(
      'owners.id:u-1 AND domains.displayName.keyword:"Life Sciences"',
    );
  });

  it('sorts service counts and asset rows client-side', () => {
    const buckets = [
      { key: 'Mysql', count: 10 },
      { key: 'Postgres', count: 100 },
    ];
    expect(sortCountBuckets(buckets, 'high').map((item) => item.key)).toEqual(['Postgres', 'Mysql']);
    expect(sortCountBuckets(buckets, 'low').map((item) => item.key)).toEqual(['Mysql', 'Postgres']);
    expect(sortHits([hit('zeta', { updatedAt: 1 }), hit('alpha', { updatedAt: 2 })], 'name').map(hitLabel)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(sortHits([hit('old', { updatedAt: 1 }), hit('new', { updatedAt: 9 })], 'latest').map((item) => item.name)).toEqual([
      'new',
      'old',
    ]);
  });

  it('prefers an activity summary when the event has one', () => {
    expect(activityLabel({ eventType: 'entityCreated', summary: 'Created orders' })).toBe('Created orders');
    expect(activityLabel({ eventType: 'entityCreated', entity: { name: 'orders' } })).toBe(
      'entityCreated · orders',
    );
  });
});

function hitLabel(item: SearchHit): string {
  return item.displayName || item.name;
}
