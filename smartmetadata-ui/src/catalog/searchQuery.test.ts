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
  filtersFromQuery,
  isIndexNotFoundError,
  luceneTerm,
  pageSizeFromQuery,
  searchRouteFromLocation,
  searchRouteQuery,
  selfExcludedFacetIds,
  sortFromQuery,
  toggleFilterValue,
} from './searchQuery';
import { aggregationFieldNamesForFacet } from './searchFacets';

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
  });
});
