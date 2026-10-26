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
  composeSearchQuery,
  filtersFromQuery,
  luceneTerm,
  searchRouteFromLocation,
  searchRouteQuery,
  sortFromQuery,
  toggleFilterValue,
} from './searchQuery';

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
});
