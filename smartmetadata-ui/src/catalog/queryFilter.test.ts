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
  buildFilterOptionsQuery,
  createQueryFilter,
  getQueryWithSlash,
  QUERY_DEFAULT_SORT,
  QUERY_SORT_OPTIONS,
} from './queryFilter';

describe('createQueryFilter', () => {
  it('always filters on the table id and nothing else when no filter is selected', () => {
    expect(createQueryFilter({ tableId: 'tbl-1' })).toEqual({
      query: { bool: { must: [{ term: { 'queryUsedIn.id': 'tbl-1' } }] } },
    });
  });

  it('adds a tag should-clause keyed by tag FQN', () => {
    expect(
      createQueryFilter({
        tableId: 'tbl-1',
        tags: [
          { key: 'PII.Sensitive', label: 'Sensitive' },
          { key: 'Tier.Tier1', label: 'Tier1' },
        ],
      }),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'queryUsedIn.id': 'tbl-1' } },
            {
              bool: {
                should: [
                  { term: { 'tags.tagFQN': 'PII.Sensitive' } },
                  { term: { 'tags.tagFQN': 'Tier.Tier1' } },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it('adds a nested owners clause keyed by owner name', () => {
    expect(
      createQueryFilter({ tableId: 'tbl-1', owners: [{ key: 'alice', label: 'Alice' }] }),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'queryUsedIn.id': 'tbl-1' } },
            {
              nested: {
                path: 'owners',
                query: { bool: { should: [{ term: { 'owners.name': 'alice' } }] } },
              },
            },
          ],
        },
      },
    });
  });

  it('adds a queryDate range clause and keeps clause order tag, owner, range', () => {
    const filter = createQueryFilter({
      tableId: 'tbl-1',
      tags: [{ key: 'PII.Sensitive', label: 'Sensitive' }],
      owners: [{ key: 'alice', label: 'Alice' }],
      timeRange: { startTs: 1000, endTs: 2000 },
    }) as { query: { bool: { must: unknown[] } } };
    expect(filter.query.bool.must).toHaveLength(4);
    expect(filter.query.bool.must[3]).toEqual({
      range: { queryDate: { gte: 1000, lte: 2000 } },
    });
  });

  it('omits empty tag/owner selections', () => {
    expect(createQueryFilter({ tableId: 'tbl-1', tags: [], owners: [] })).toEqual({
      query: { bool: { must: [{ term: { 'queryUsedIn.id': 'tbl-1' } }] } },
    });
  });
});

describe('query sort options', () => {
  it('matches the pin QUERY_SORT_OPTIONS and defaults to queryDate DESC', () => {
    expect(QUERY_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'queryDate',
      'updatedAt',
      'totalVotes',
    ]);
    expect(QUERY_DEFAULT_SORT).toEqual({ field: 'queryDate', order: 'desc' });
  });
});

describe('buildFilterOptionsQuery', () => {
  it('wraps search text in wildcards and ANDs the filters string', () => {
    expect(buildFilterOptionsQuery('sens', 'disabled:false')).toBe('*sens* AND disabled:false');
  });

  it('sends only the filters string for the default wildcard search', () => {
    expect(buildFilterOptionsQuery('*', 'isBot:false')).toBe('isBot:false');
  });

  it('escapes quotes in the wrapped search text so ES query_string parsing cannot break', () => {
    expect(buildFilterOptionsQuery("o'brien", 'disabled:false')).toBe(
      String.raw`*o\'brien* AND disabled:false`,
    );
    expect(buildFilterOptionsQuery('"customer"', 'isBot:false')).toBe(
      String.raw`*\"customer\"* AND isBot:false`,
    );
    expect(buildFilterOptionsQuery('plain text', 'disabled:false')).toBe(
      '*plain text* AND disabled:false',
    );
  });
});

describe('getQueryWithSlash', () => {
  it('drops queries made only of backslashes or ampersands', () => {
    for (const query of ['&', '\\', '&&', '\\\\', '\\&', '  &  ']) {
      expect(getQueryWithSlash(query)).toBe('');
    }
  });

  it('escapes single quotes and leaves plain queries untouched', () => {
    expect(getQueryWithSlash("it's")).toBe(String.raw`it\'s`);
    expect(getQueryWithSlash('sample_data orders')).toBe('sample_data orders');
    expect(getQueryWithSlash('*')).toBe('*');
  });

  it('escapes raw double quotes but not already-escaped ones, by backslash parity', () => {
    expect(getQueryWithSlash('*"customer"*')).toBe(String.raw`*\"customer\"*`);
    expect(getQueryWithSlash(String.raw`\"customer`)).toBe(String.raw`\"customer`);
    expect(getQueryWithSlash(String.raw`\\"customer`)).toBe(String.raw`\\\"customer`);
    expect(getQueryWithSlash(String.raw`\\\"customer`)).toBe(String.raw`\\\"customer`);
  });
});
