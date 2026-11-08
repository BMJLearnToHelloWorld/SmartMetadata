/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listRecentlyViewed,
  MAX_RECENTLY_VIEWED,
  recordRecentlyViewed,
  type RecentlyViewedPage,
} from './contextCenterRecent';

function entry(id: string, title: string): Omit<RecentlyViewedPage, 'timestamp'> {
  return { id, title, pageType: 'Article', fullyQualifiedName: id };
}

describe('contextCenterRecent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('records views newest-first and dedupes re-views', () => {
    vi.setSystemTime(1000);
    recordRecentlyViewed('alice', entry('p1', 'Getting Started'));
    vi.setSystemTime(2000);
    recordRecentlyViewed('alice', entry('p2', 'Runbook'));
    vi.setSystemTime(3000);
    recordRecentlyViewed('alice', entry('p1', 'Getting Started'));
    const items = listRecentlyViewed('alice');
    expect(items.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(items[0]?.timestamp).toBe(3000);
    expect(items[1]?.timestamp).toBe(2000);
  });

  it('keeps at most 10 entries, dropping the oldest', () => {
    for (let i = 0; i < MAX_RECENTLY_VIEWED + 3; i++) {
      vi.setSystemTime(1000 + i);
      recordRecentlyViewed('alice', entry(`p${i}`, `Page ${i}`));
    }
    const items = listRecentlyViewed('alice');
    expect(items).toHaveLength(MAX_RECENTLY_VIEWED);
    expect(items[0]?.id).toBe(`p${MAX_RECENTLY_VIEWED + 2}`);
    expect(items.map((item) => item.id)).not.toContain('p0');
  });

  it('isolates records per user', () => {
    recordRecentlyViewed('alice', entry('p1', 'Getting Started'));
    recordRecentlyViewed('bob', entry('p2', 'Runbook'));
    expect(listRecentlyViewed('alice').map((item) => item.id)).toEqual(['p1']);
    expect(listRecentlyViewed('bob').map((item) => item.id)).toEqual(['p2']);
  });

  it('records nothing and throws nothing without a logged-in user', () => {
    expect(() => recordRecentlyViewed(undefined, entry('p1', 'Getting Started'))).not.toThrow();
    expect(listRecentlyViewed(undefined)).toEqual([]);
    expect(listRecentlyViewed('alice')).toEqual([]);
  });

  it('tolerates corrupt stored JSON', () => {
    localStorage.setItem('sm.contextCenter.recentlyViewed.v1:alice', '{not json');
    expect(listRecentlyViewed('alice')).toEqual([]);
    expect(() =>
      recordRecentlyViewed('alice', entry('p1', 'Getting Started')),
    ).not.toThrow();
    expect(listRecentlyViewed('alice').map((item) => item.id)).toEqual(['p1']);
  });

  it('keeps quick-link entries with their target URL', () => {
    recordRecentlyViewed('alice', {
      id: 'q1',
      title: 'Handbook',
      pageType: 'QuickLink',
      pageUrl: 'https://example.com/handbook',
      fullyQualifiedName: 'q1',
    });
    const [item] = listRecentlyViewed('alice');
    expect(item?.pageType).toBe('QuickLink');
    expect(item?.pageUrl).toBe('https://example.com/handbook');
  });
});
