/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPLORE_TABS,
  defaultSortForTab,
  exploreSortFromQuery,
  exploreTabForIndex,
  exploreTabForSlug,
  exploreTabFromQuery,
  sortOptionsForTab,
} from './exploreTabs';

describe('exploreTabs', () => {
  it('lists all 24 official Explore tabs with unique indexes and slugs', () => {
    expect(EXPLORE_TABS).toHaveLength(24);
    expect(new Set(EXPLORE_TABS.map((tab) => tab.index)).size).toBe(24);
    expect(new Set(EXPLORE_TABS.map((tab) => tab.slug)).size).toBe(24);
  });

  it('resolves tabs by index, slug and route query, and null for all/unknown', () => {
    expect(exploreTabForIndex('table')?.slug).toBe('tables');
    expect(exploreTabForSlug('columns')?.index).toBe('tableColumn');
    expect(exploreTabFromQuery({ tab: 'topic' })?.slug).toBe('topics');
    expect(exploreTabFromQuery({ tab: 'dashboards' })?.index).toBe('dashboard');
    expect(exploreTabFromQuery({})).toBeNull();
    expect(exploreTabFromQuery({ tab: 'nope' })).toBeNull();
  });

  it('uses per-tab sorting groups and defaults', () => {
    const table = exploreTabForIndex('table');
    expect(sortOptionsForTab(table).map((option) => option.id)).toEqual([
      'popularity',
      'name',
      'weeklyUsage',
      'relevance',
      'updated',
    ]);
    expect(defaultSortForTab(table).field).toBe('totalVotes');
    const tag = exploreTabForIndex('tag');
    expect(defaultSortForTab(tag)).toEqual({ id: 'name', field: 'displayName.keyword', defaultOrder: 'asc' });
    const column = exploreTabForIndex('tableColumn');
    expect(sortOptionsForTab(column).map((option) => option.id)).toEqual([
      'dataType',
      'table',
      'name',
      'relevance',
      'updated',
    ]);
    expect(defaultSortForTab(column).id).toBe('name');
  });

  it('falls back to the active tab default when the query sort is not selectable on it', () => {
    const column = exploreTabForIndex('tableColumn');
    // popularity is a table/entity sort, not a column sort.
    expect(exploreSortFromQuery({ sort: 'popularity' }, column).id).toBe('name');
    expect(exploreSortFromQuery({ sort: 'name', order: 'desc' }, column)).toEqual({
      id: 'name',
      order: 'desc',
      field: 'displayName.keyword',
    });
    expect(exploreSortFromQuery({}, null).id).toBe('popularity');
  });
});
