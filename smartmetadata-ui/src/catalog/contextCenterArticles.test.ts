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
  ARTICLE_PAGE_SIZE,
  ARTICLE_QUICK_FILTER_FACET_IDS,
  appendUniquePages,
  buildArticleQueryFilter,
  getArticleSortConfig,
  getKnowledgePageFields,
  getQuickFilterQuery,
  useArticleSearchPath,
} from './contextCenterArticles';

describe('article sort options', () => {
  it('has the four official tiers with the right ES and REST fields', () => {
    expect(getArticleSortConfig('updatedAt')).toEqual({
      id: 'updatedAt',
      esSortField: 'updatedAt',
      restSortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(getArticleSortConfig('name')).toEqual({
      id: 'name',
      esSortField: 'displayName.keyword',
      restSortBy: 'displayName',
      sortOrder: 'asc',
    });
    expect(getArticleSortConfig('publicationDate')).toEqual({
      id: 'publicationDate',
      esSortField: 'page.publicationDate',
      sortOrder: 'desc',
    });
    expect(getArticleSortConfig('popularity')).toEqual({
      id: 'popularity',
      esSortField: 'totalVotes',
      sortOrder: 'desc',
    });
    expect(getArticleSortConfig('unknown')).toEqual(getArticleSortConfig('updatedAt'));
  });

  it('returns the official REST field list verbatim', () => {
    expect(getKnowledgePageFields()).toBe(
      'owners,votes,followers,tags,domains,relatedEntities,dataProducts,reviewers',
    );
  });

  it('pages 25 at a time', () => {
    expect(ARTICLE_PAGE_SIZE).toBe(25);
  });
});

describe('getQuickFilterQuery', () => {
  it('returns undefined when nothing is selected', () => {
    expect(getQuickFilterQuery({})).toBeUndefined();
    expect(getQuickFilterQuery({ domain: [], owner: [] })).toBeUndefined();
  });

  it('unions values within a field and intersects across fields', () => {
    expect(
      getQuickFilterQuery({ domain: ['d1', 'd2'], tagFqn: ['t1'] }),
    ).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [
                  { term: { 'domains.displayName.keyword': 'd1' } },
                  { term: { 'domains.displayName.keyword': 'd2' } },
                ],
              },
            },
            { bool: { should: [{ term: { 'tags.tagFQN': 't1' } }] } },
          ],
        },
      },
    });
  });

  it('uses the official ES term keys for all four fields', () => {
    const query = getQuickFilterQuery({
      domain: ['d1'],
      owner: ['alice'],
      tagFqn: ['t1'],
      tier: ['Tier1'],
    });
    const must = (query?.query as { bool: { must: Array<{ bool: { should: Array<{ term: Record<string, string> }> } }> } }).bool.must;
    expect(must.map((clause) => Object.keys(clause.bool.should[0].term)[0])).toEqual([
      'domains.displayName.keyword',
      'ownerDisplayName',
      'tags.tagFQN',
      'tier.tagFQN',
    ]);
  });
});

describe('buildArticleQueryFilter', () => {
  it('returns undefined when unfiltered and on the All tab', () => {
    expect(buildArticleQueryFilter({}, 'All')).toBeUndefined();
  });

  it('merges the page-type term into the same bool.must array', () => {
    expect(JSON.parse(buildArticleQueryFilter({ tagFqn: ['t1'] }, 'Article') ?? '')).toEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { 'tags.tagFQN': 't1' } }] } },
            { term: { pageType: 'Article' } },
          ],
        },
      },
    });
  });

  it('emits only the page-type term when no quick filter is active', () => {
    expect(JSON.parse(buildArticleQueryFilter({}, 'QuickLink') ?? '')).toEqual({
      query: { bool: { must: [{ term: { pageType: 'QuickLink' } }] } },
    });
  });
});

describe('useArticleSearchPath', () => {
  it('uses REST only for the unfiltered default sorts', () => {
    expect(useArticleSearchPath('', {}, getArticleSortConfig('updatedAt'))).toBe(false);
    expect(useArticleSearchPath('', {}, getArticleSortConfig('name'))).toBe(false);
  });

  it('uses ES when filtered, even on a REST sort', () => {
    expect(useArticleSearchPath('guide', {}, getArticleSortConfig('updatedAt'))).toBe(true);
    expect(
      useArticleSearchPath('', { domain: ['d1'] }, getArticleSortConfig('name')),
    ).toBe(true);
  });

  it('uses ES for publication-date and popularity sorts even unfiltered', () => {
    expect(useArticleSearchPath('', {}, getArticleSortConfig('publicationDate'))).toBe(true);
    expect(useArticleSearchPath('', {}, getArticleSortConfig('popularity'))).toBe(true);
  });
});

describe('appendUniquePages', () => {
  it('appends without duplicating ids', () => {
    const first = [{ id: 'p1' }, { id: 'p2' }] as never;
    const second = [{ id: 'p2' }, { id: 'p3' }] as never;
    expect(appendUniquePages(first, second).map((page) => page.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });
});

describe('article quick-filter facet ids', () => {
  it('is exactly the four official fields', () => {
    expect(ARTICLE_QUICK_FILTER_FACET_IDS).toEqual(['domain', 'owner', 'tagFqn', 'tier']);
  });
});
