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

  it('defaults the API tabs to totalVotes although the tag group has no popularity option (D33 pin quirk)', () => {
    const collection = exploreTabForIndex('apiCollection');
    const endpoint = exploreTabForIndex('apiEndpoint');
    expect(defaultSortForTab(collection)).toEqual({ id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' });
    expect(defaultSortForTab(endpoint)).toEqual({ id: 'popularity', field: 'totalVotes', defaultOrder: 'desc' });
    // The tag group's options are unchanged: totalVotes is the default,
    // not a selectable option.
    expect(sortOptionsForTab(collection).map((option) => option.id)).toEqual(['name', 'relevance', 'updated']);
    // …and the other tag tabs still default to name.
    expect(defaultSortForTab(exploreTabForIndex('tag'))).toEqual({
      id: 'name',
      field: 'displayName.keyword',
      defaultOrder: 'asc',
    });
    expect(defaultSortForTab(exploreTabForIndex('dataProduct')).id).toBe('name');
    expect(defaultSortForTab(exploreTabForIndex('metric')).id).toBe('name');
    // No sort in the URL resolves to the quirk default on the API tabs.
    expect(exploreSortFromQuery({}, collection)).toEqual({
      id: 'popularity',
      order: 'desc',
      field: 'totalVotes',
    });
  });
});
