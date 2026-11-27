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
  exploreSortQueryParams,
  exploreTabForIndex,
  exploreTabForSlug,
  exploreTabFromQuery,
  exploreTabFromRoute,
  facetsForTab,
  findActiveSearchIndex,
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

  it('uses pin ExplorePageTabs paths as slugs (singular/camel, not pluralised)', () => {
    expect(exploreTabForIndex('storedProcedure')?.slug).toBe('storedProcedure');
    expect(exploreTabForIndex('database')?.slug).toBe('database');
    expect(exploreTabForIndex('databaseSchema')?.slug).toBe('databaseSchema');
    expect(exploreTabForIndex('dashboardDataModel')?.slug).toBe('dashboardDataModel');
    expect(exploreTabForIndex('glossaryTerm')?.slug).toBe('glossaries');
    expect(exploreTabForIndex('apiCollection')?.slug).toBe('apiCollection');
    expect(exploreTabForIndex('apiEndpoint')?.slug).toBe('apiEndpoint');
    expect(exploreTabForIndex('metric')?.slug).toBe('metric');
  });

  it('resolves the tab from the /explore/:tab param, falling back to a legacy ?tab= query', () => {
    expect(exploreTabFromRoute({ params: { tab: 'tables' }, query: {} })?.index).toBe('table');
    expect(exploreTabFromRoute({ params: { tab: 'glossaries' }, query: {} })?.index).toBe('glossaryTerm');
    // The path param wins over the query.
    expect(exploreTabFromRoute({ params: { tab: 'topics' }, query: { tab: 'table' } })?.index).toBe('topic');
    // Legacy links: ?tab= still resolves (index or slug).
    expect(exploreTabFromRoute({ params: {}, query: { tab: 'table' } })?.index).toBe('table');
    expect(exploreTabFromRoute({ params: {}, query: { tab: 'dashboards' } })?.index).toBe('dashboard');
    expect(exploreTabFromRoute({ params: {}, query: {} })).toBeNull();
    expect(exploreTabFromRoute({ params: { tab: 'nope' }, query: {} })).toBeNull();
  });

  it('auto-selects the tab with the most hits, preferring the top hit when it has hits', () => {
    const counts = new Map([
      ['table', 2],
      ['dashboard', 5],
      ['topic', 1],
    ]);
    expect(findActiveSearchIndex(counts)?.index).toBe('dashboard');
    // The top hit wins even when another tab counts more.
    expect(findActiveSearchIndex(counts, 'topic')?.index).toBe('topic');
    // A top hit with no hits does not win.
    expect(findActiveSearchIndex(counts, 'pipeline')?.index).toBe('dashboard');
    // A tie goes to the first tab in EXPLORE_TABS order.
    expect(findActiveSearchIndex(new Map([['table', 1], ['topic', 1]]))?.index).toBe('table');
    // No tab with hits: null (the caller falls back to dataAsset).
    expect(findActiveSearchIndex(new Map())).toBeNull();
    expect(findActiveSearchIndex(new Map([['table', 0]]))).toBeNull();
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

  it('reads official ES field + sortOrder and still accepts legacy product ids', () => {
    expect(exploreSortFromQuery({ sort: 'totalVotes' }, null)).toEqual({
      id: 'popularity',
      order: 'desc',
      field: 'totalVotes',
    });
    expect(exploreSortFromQuery({ sort: '_score', sortOrder: 'asc' }, null)).toEqual({
      id: 'relevance',
      order: 'asc',
      field: '_score',
    });
    expect(exploreSortFromQuery({ sort: 'popularity', order: 'asc' }, null).order).toBe('asc');
    expect(exploreSortQueryParams({ id: 'popularity', order: 'desc' }, null)).toEqual({});
    expect(exploreSortQueryParams({ id: 'relevance', order: 'desc' }, null)).toEqual({ sort: '_score' });
    expect(exploreSortQueryParams({ id: 'popularity', order: 'asc' }, null)).toEqual({
      sort: 'totalVotes',
      sortOrder: 'asc',
    });
  });
});

describe('facetsForTab (pin SearchClassBase.getDropDownItems)', () => {
  it('shows the 9 data-asset chips on the all-tab only', () => {
    expect(facetsForTab(null)).toEqual([
      'entityType',
      'domain',
      'dataProduct',
      'owner',
      'tagFqn',
      'tier',
      'certification',
      'service',
      'serviceType',
    ]);
  });

  it('gives the table tab the common set plus database/schema/column/table-type', () => {
    expect(facetsForTab(exploreTabForIndex('table'))).toEqual([
      'domain',
      'dataProduct',
      'owner',
      'tagFqn',
      'tier',
      'service',
      'serviceType',
      'database',
      'schema',
      'column',
      'tableType',
      'columnDescriptionStatus',
    ]);
    // No entityType/certification chip where pin lacks it.
    expect(facetsForTab(exploreTabForIndex('table'))).not.toContain('entityType');
    expect(facetsForTab(exploreTabForIndex('table'))).not.toContain('certification');
  });

  it('gives the column tab only data-type/table/database/schema', () => {
    expect(facetsForTab(exploreTabForIndex('tableColumn'))).toEqual([
      'dataType',
      'tableName',
      'database',
      'schema',
    ]);
  });

  it('gives the glossary tab domains/owner/tag/glossary/status', () => {
    expect(facetsForTab(exploreTabForIndex('glossaryTerm'))).toEqual([
      'domain',
      'owner',
      'tagFqn',
      'glossary',
      'entityStatus',
    ]);
  });

  it('gives the tag tab domains/classification and the data-product tab domains/owner', () => {
    expect(facetsForTab(exploreTabForIndex('tag'))).toEqual(['domain', 'classification']);
    expect(facetsForTab(exploreTabForIndex('dataProduct'))).toEqual(['domain', 'owner']);
  });

  it('gives common-only tabs the common set, and unmapped tabs no chips', () => {
    for (const index of ['storedProcedure', 'database', 'databaseSchema', 'apiCollection', 'metric']) {
      expect(facetsForTab(exploreTabForIndex(index))).toEqual([
        'domain',
        'dataProduct',
        'owner',
        'tagFqn',
        'tier',
        'service',
        'serviceType',
      ]);
    }
    for (const index of ['chart', 'directory', 'file', 'spreadsheet', 'worksheet']) {
      expect(facetsForTab(exploreTabForIndex(index))).toEqual([]);
    }
    expect(facetsForTab(exploreTabForIndex('topic'))).toEqual([
      'domain',
      'dataProduct',
      'owner',
      'tagFqn',
      'tier',
      'service',
      'serviceType',
      'schemaField',
    ]);
    expect(facetsForTab(exploreTabForIndex('page'))).toEqual(['owner', 'tagFqn']);
  });
});
