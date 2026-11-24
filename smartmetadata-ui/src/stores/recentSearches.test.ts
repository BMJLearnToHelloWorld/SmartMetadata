/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listRecentSearches, MAX_RECENT_SEARCHES, recordRecentSearch } from './recentSearches';

describe('recentSearches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('records terms newest-first and dedupes re-searches', () => {
    recordRecentSearch('alice', 'orders');
    recordRecentSearch('alice', 'events');
    recordRecentSearch('alice', 'orders');
    expect(listRecentSearches('alice')).toEqual(['orders', 'events']);
  });

  it('caps the list at five entries', () => {
    for (let index = 0; index < MAX_RECENT_SEARCHES + 2; index++) {
      recordRecentSearch('alice', `term-${index}`);
    }
    const listed = listRecentSearches('alice');
    expect(listed).toHaveLength(MAX_RECENT_SEARCHES);
    expect(listed[0]).toBe(`term-${MAX_RECENT_SEARCHES + 1}`);
    expect(listed).not.toContain('term-0');
  });

  it('ignores blank terms and a missing user', () => {
    recordRecentSearch('alice', '   ');
    recordRecentSearch(undefined, 'orders');
    expect(listRecentSearches('alice')).toEqual([]);
    expect(listRecentSearches(undefined)).toEqual([]);
  });

  it('keeps each user on a separate list', () => {
    recordRecentSearch('alice', 'orders');
    recordRecentSearch('bob', 'events');
    expect(listRecentSearches('alice')).toEqual(['orders']);
    expect(listRecentSearches('bob')).toEqual(['events']);
  });

  it('returns an empty list for corrupt stored JSON', () => {
    localStorage.setItem('sm.recentSearches.v1:alice', '{not json');
    expect(listRecentSearches('alice')).toEqual([]);
  });
});
