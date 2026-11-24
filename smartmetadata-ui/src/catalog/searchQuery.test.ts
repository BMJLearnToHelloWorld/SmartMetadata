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
import {
  composeFacetQuery,
  composeSearchQuery,
  FILTER_LUCENE_FIELD,
  filtersFromQuery,
  isIndexNotFoundError,
  luceneTerm,
  mergeQueryFilters,
  nullExistsQueryFilter,
  pageSizeFromQuery,
  searchRouteFromLocation,
  searchRouteQuery,
  selfExcludedFacetIds,
  sortFromQuery,
  toggleFilterValue,
} from './searchQuery';
import { aggregationFieldNamesForFacet, NULL_OPTION_KEY } from './searchFacets';

describe('searchQuery', () => {
  it('composes documented Lucene q= terms for entity type and tags', () => {
    expect(composeSearchQuery('orders', { entityType: ['table'], tagFqn: ['PII.Sensitive'] })).toBe(
      'orders AND entityType:table AND tags.tagFQN:PII.Sensitive',
    );
  });

  it('quotes values that contain Lucene special characters', () => {
    expect(luceneTerm('ownerDisplayName', 'Data Eng')).toBe('ownerDisplayName:"Data Eng"');
    expect(composeSearchQuery('', { owner: ['Data Eng'] })).toBe('ownerDisplayName:"Data Eng"');
  });

  it('uses OR inside a multi-value facet and * when nothing is set', () => {
    expect(composeSearchQuery('  ', { entityType: ['table', 'topic'] })).toBe(
      '(entityType:table OR entityType:topic)',
    );
    expect(composeSearchQuery('', {})).toBe('*');
  });

  it('accepts only official page-size options and falls back otherwise', () => {
    expect(pageSizeFromQuery('25', 15)).toBe(25);
    expect(pageSizeFromQuery('50', 15)).toBe(50);
    expect(pageSizeFromQuery('24', 25)).toBe(25);
    expect(pageSizeFromQuery('10', 15)).toBe(15);
    expect(pageSizeFromQuery(undefined, 25)).toBe(25);
  });

  it('detects index-not-found errors from the official marker strings', () => {
    expect(isIndexNotFoundError('Failed to to find index [table_search_index]')).toBe(true);
    expect(isIndexNotFoundError('Elasticsearch exception: reason=all shards failed')).toBe(true);
    expect(isIndexNotFoundError('Request failed (500)')).toBe(false);
    expect(isIndexNotFoundError(undefined)).toBe(false);
  });

  it('round-trips filter query params and toggles a bucket', () => {
    const filters = filtersFromQuery({ entityType: 'table,topic', tagFqn: 'PII.Sensitive' });
    expect(filters).toEqual({ entityType: ['table', 'topic'], tagFqn: ['PII.Sensitive'] });
    expect(toggleFilterValue(filters, 'entityType', 'table').entityType).toEqual(['topic']);
    expect(searchRouteQuery('orders', filters, 2)).toEqual({
      q: 'orders',
      entityType: 'table,topic',
      tagFqn: 'PII.Sensitive',
      page: '2',
    });
  });

  it('keeps sort and estate on the search route and maps them to API fields', () => {
    expect(sortFromQuery({ sort: 'popularity' })).toEqual({ id: 'popularity', order: 'desc' });
    expect(sortFromQuery({ sort: 'name', order: 'desc' })).toEqual({ id: 'name', order: 'desc' });
    expect(
      searchRouteQuery('orders', { entityType: ['table'] }, 0, {
        sort: { id: 'updated', order: 'desc' },
        estate: 'databases',
      }),
    ).toEqual({
      q: 'orders',
      entityType: 'table',
      sort: 'updated',
      estate: 'databases',
    });
    expect(
      searchRouteFromLocation('customers', { q: 'orders', entityType: 'table', sort: 'popularity', estate: 'databases' }),
    ).toEqual({
      q: 'customers',
      entityType: 'table',
      sort: 'popularity',
      estate: 'databases',
    });
  });

  it('carries the global-search scope as tab and omits it for All (D13)', () => {
    expect(searchRouteQuery('orders', {}, 0, { tab: 'table' })).toEqual({
      q: 'orders',
      tab: 'table',
    });
    expect(searchRouteQuery('orders', {}, 0, { tab: '' })).toEqual({ q: 'orders' });
    expect(searchRouteQuery('orders', {}, 0)).toEqual({ q: 'orders' });
    expect(
      searchRouteFromLocation('orders', { q: 'old', tab: 'topic' }, 0, { tab: 'table' }),
    ).toEqual({ q: 'orders', tab: 'table' });
  });

  it('composes certification and data-product Lucene terms when those chips are set', () => {
    expect(composeSearchQuery('', { certification: ['Certification.Gold'] })).toBe(
      'certification.tagLabel.tagFQN:Certification.Gold',
    );
    expect(composeSearchQuery('', { dataProduct: ['Finance Mart'] })).toBe(
      'dataProducts.displayName.keyword:"Finance Mart"',
    );
  });

  it('excludes only the facet own field when composing its options query (ADR:2026-11-11-explore-facet-self-exclusion)', () => {
    // Selecting Tag must not shrink the entityType chip to just Tag: the
    // options query drops entityType but keeps the free text and the
    // service filter, so Metric stays available.
    expect(
      composeFacetQuery('orders', { entityType: ['tag'], service: ['mysql'] }, 'entityType'),
    ).toBe('orders AND service.displayName.keyword:mysql');
    // The reverse: opening the service chip drops the service filter but
    // keeps the entityType filter, so other services stay available.
    expect(
      composeFacetQuery('orders', { entityType: ['tag'], service: ['mysql'] }, 'service'),
    ).toBe('orders AND entityType:tag');
    // A multi-value own filter is dropped as a whole.
    expect(composeFacetQuery('', { entityType: ['table', 'topic'] }, 'entityType')).toBe('*');
    // With no other filters, the options query is just the free text.
    expect(composeFacetQuery('orders', { entityType: ['tag'] }, 'entityType')).toBe('orders');
  });

  it('derives the excluded ids from the facet own mapping', () => {
    // The entity-type facet records two aggregation names (official's
    // `entityType` and `entityType.keyword`), but this console has only
    // one entity-type filter id, so the exclusion is the singleton —
    // there is no second filter to exclude.
    expect(aggregationFieldNamesForFacet('entityType')).toEqual([
      'entityType',
      'entityType.keyword',
    ]);
    expect(selfExcludedFacetIds('entityType')).toEqual(['entityType']);
    expect(selfExcludedFacetIds('service')).toEqual(['service']);
    expect(selfExcludedFacetIds('tagFqn')).toEqual(['tagFqn']);
    // Database/schema filter on the display-name .keyword field while
    // their aggregations carry no .keyword suffix: the facet's own
    // Lucene field is part of the exclusion, or opening the database
    // chip would narrow its own options by its own selection.
    expect(selfExcludedFacetIds('database')).toEqual(['database']);
    expect(selfExcludedFacetIds('schema')).toEqual(['schema']);
  });

  it('filters database and schema on the display-name keyword field (pin TABLE/COLUMN dropdowns)', () => {
    expect(FILTER_LUCENE_FIELD.database).toBe('database.displayName.keyword');
    expect(FILTER_LUCENE_FIELD.schema).toBe('databaseSchema.displayName.keyword');
    expect(composeSearchQuery('', { database: ['Orders DB'] })).toBe(
      'database.displayName.keyword:"Orders DB"',
    );
    expect(composeSearchQuery('', { schema: ['Public'] })).toBe(
      'databaseSchema.displayName.keyword:Public',
    );
  });

  it('composes per-tab Lucene terms for the new D5 facets', () => {
    expect(composeSearchQuery('', { column: ['order_id'] })).toBe('columns.name.keyword:order_id');
    expect(composeSearchQuery('', { tableType: ['Regular'] })).toBe('tableType:Regular');
    expect(composeSearchQuery('', { dataType: ['INT'] })).toBe('dataType:INT');
    expect(composeSearchQuery('', { tableName: ['orders'] })).toBe('table.name.keyword:orders');
    expect(composeSearchQuery('', { classification: ['PII'] })).toBe(
      'classification.name.keyword:PII',
    );
    expect(composeSearchQuery('', { glossary: ['Business'] })).toBe(
      'glossary.name.keyword:Business',
    );
    expect(composeSearchQuery('', { entityStatus: ['Approved'] })).toBe('entityStatus:Approved');
    expect(composeSearchQuery('', { columnDescriptionStatus: ['Completed'] })).toBe(
      'columnDescriptionStatus:Completed',
    );
    expect(filtersFromQuery({ column: 'order_id', tableType: 'Regular', entityStatus: 'Approved' })).toEqual({
      column: ['order_id'],
      tableType: ['Regular'],
      entityStatus: ['Approved'],
    });
  });

  it('keeps a "No X" selection out of Lucene q (pin NULL_OPTION_KEY)', () => {
    expect(composeSearchQuery('', { owner: [NULL_OPTION_KEY] })).toBe('*');
    expect(composeSearchQuery('orders', { owner: [NULL_OPTION_KEY], tier: ['Tier1'] })).toBe(
      'orders AND tier.tagFQN:Tier1',
    );
    // A null selection mixed with a real value on the same facet: only
    // the real value becomes a Lucene term.
    expect(composeSearchQuery('', { owner: ['alice', NULL_OPTION_KEY] })).toBe(
      'ownerDisplayName:alice',
    );
  });

  it('builds the structured must_not.exists filter for "No X" selections', () => {
    expect(nullExistsQueryFilter({})).toBeUndefined();
    expect(nullExistsQueryFilter({ owner: ['alice'] })).toBeUndefined();
    expect(nullExistsQueryFilter({ owner: [NULL_OPTION_KEY] })).toBe(
      JSON.stringify({
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { bool: { must_not: { exists: { field: 'ownerDisplayName' } } } },
                  ],
                },
              },
            ],
          },
        },
      }),
    );
    // One must clause per facet with a null selection, in field order.
    const merged = nullExistsQueryFilter({
      owner: [NULL_OPTION_KEY],
      tier: ['Tier1', NULL_OPTION_KEY],
    });
    const parsed = JSON.parse(merged ?? '') as {
      query: { bool: { must: Array<{ bool: { should: unknown[] } }> } } };
    expect(parsed.query.bool.must).toHaveLength(2);
    expect(JSON.stringify(parsed.query.bool.must[1])).toContain('tier.tagFQN');
    // Self-exclusion: the options query for a facet drops its own null.
    expect(nullExistsQueryFilter({ owner: [NULL_OPTION_KEY] }, 'owner')).toBeUndefined();
    expect(nullExistsQueryFilter({ owner: [NULL_OPTION_KEY], domain: [NULL_OPTION_KEY] }, 'owner')).toContain(
      'domains.displayName.keyword',
    );
  });

  it('merges a saved query_filter with the null clauses', () => {
    const saved = JSON.stringify({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
    });
    const nulls = nullExistsQueryFilter({ owner: [NULL_OPTION_KEY] });
    const merged = mergeQueryFilters(saved, nulls);
    const parsed = JSON.parse(merged ?? '') as {
      query: { bool: { must: unknown[] } };
    };
    expect(parsed.query.bool.must).toHaveLength(2);
    expect(parsed.query.bool.must[0]).toEqual({ term: { 'tags.tagFQN': 'PII.Sensitive' } });
    expect(mergeQueryFilters(undefined, undefined)).toBeUndefined();
    expect(mergeQueryFilters(saved)).toBe(saved);
    // A single filter that parses but has no bool.must to decompose
    // (D28: an unparseable saved filter) is returned verbatim, not
    // re-wrapped into a bool.must — the server must receive it unchanged.
    const matchAll = JSON.stringify({ query: { match_all: {} } });
    expect(mergeQueryFilters(matchAll)).toBe(matchAll);
    expect(mergeQueryFilters(matchAll, undefined)).toBe(matchAll);
    // An unparseable saved filter is returned verbatim rather than
    // silently dropped to make room for a null selection.
    expect(mergeQueryFilters('not-json', nulls)).toBe('not-json');
  });
});
