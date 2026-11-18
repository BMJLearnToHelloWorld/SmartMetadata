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
  buildFollowingQueryFilter,
  buildMyDataQueryFilter,
  buildTeamAssetsCountQueryFilter,
  buildTeamAssetsQueryFilter,
  getTermQuery,
} from './membersSearchFilters';

describe('membersSearchFilters getTermQuery (pin SearchPureUtils)', () => {
  it('expands array values to one term query per value', () => {
    expect(getTermQuery({ 'owners.id': ['a', 'b'] }, 'should', 1)).toEqual({
      query: {
        bool: {
          should: [
            { nested: { path: 'owners', query: { term: { 'owners.id': 'a' } } } },
            { nested: { path: 'owners', query: { term: { 'owners.id': 'b' } } } },
          ],
          minimum_should_match: 1,
        },
      },
    });
  });

  it('wraps owners fields in nested queries and leaves other fields plain', () => {
    const filter = getTermQuery({ 'owners.id': 't1', isBot: 'false' }, 'must');
    const must = (filter.query.bool.must ?? []) as unknown[];
    expect(must).toHaveLength(2);
    expect(must[0]).toEqual({ nested: { path: 'owners', query: { term: { 'owners.id': 't1' } } } });
    expect(must[1]).toEqual({ term: { isBot: 'false' } });
    expect(filter.query.bool.minimum_should_match).toBeUndefined();
  });

  it('expands mustNotTerms under must_not', () => {
    const filter = getTermQuery({ 'owners.id': 't1' }, 'must', undefined, {
      mustNotTerms: { entityType: ['tableColumn', 'dataProduct'] },
    });
    expect(filter.query.bool.must_not).toEqual([
      { term: { entityType: 'tableColumn' } },
      { term: { entityType: 'dataProduct' } },
    ]);
  });
});

describe('membersSearchFilters asset filters', () => {
  it('excludes tableColumn from the team assets table', () => {
    const parsed = JSON.parse(buildTeamAssetsQueryFilter('t1')) as { query: { bool: { must_not: unknown[] } } };
    expect(parsed.query.bool.must_not).toEqual([{ term: { entityType: 'tableColumn' } }]);
  });

  it('excludes tableColumn and dataProduct from the assets count', () => {
    const parsed = JSON.parse(buildTeamAssetsCountQueryFilter('t1')) as { query: { bool: { must_not: unknown[] } } };
    expect(parsed.query.bool.must_not).toHaveLength(2);
  });

  it('builds My Data as a should over owners with minimum_should_match 1', () => {
    const parsed = JSON.parse(buildMyDataQueryFilter(['u1', 't1'])) as {
      query: { bool: { should: unknown[]; minimum_should_match: number } };
    };
    expect(parsed.query.bool.should).toHaveLength(2);
    expect(parsed.query.bool.minimum_should_match).toBe(1);
  });

  it('builds Following as a should over followers', () => {
    const parsed = JSON.parse(buildFollowingQueryFilter('u1')) as {
      query: { bool: { should: unknown[]; minimum_should_match: number } };
    };
    expect(parsed.query.bool.should).toEqual([{ term: { followers: 'u1' } }]);
    expect(parsed.query.bool.minimum_should_match).toBe(1);
  });
});
