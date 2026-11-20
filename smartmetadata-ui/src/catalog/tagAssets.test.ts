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
  buildTagAssetsQuickFilterQuery,
  combineQueryFilters,
  getQueryFilterToExcludeTermsAndEntities,
  getTagAssetsQueryFilter,
  getTagUsageAggregationField,
  getTermQuery,
} from './tagAssets';

describe('getTagAssetsQueryFilter (pin TagsPureUtils)', () => {
  it('targets tags.tagFQN for an ordinary classification', () => {
    expect(getTagAssetsQueryFilter('PII.Sensitive')).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
    });
  });

  it('targets tier.tagFQN for the Tier classification', () => {
    expect(getTagUsageAggregationField('Tier')).toBe('tier.tagFQN');
    expect(getTagAssetsQueryFilter('Tier.Tier1')).toEqual({
      query: { bool: { must: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } },
    });
  });

  it('targets certification.tagLabel.tagFQN for the Certification classification', () => {
    expect(getTagUsageAggregationField('Certification')).toBe('certification.tagLabel.tagFQN');
    expect(getTagAssetsQueryFilter('Certification.Gold')).toEqual({
      query: {
        bool: { must: [{ term: { 'certification.tagLabel.tagFQN': 'Certification.Gold' } }] },
      },
    });
  });

  it('builds a must term query', () => {
    expect(getTermQuery({ 'tags.tagFQN': 'PII.Sensitive' })).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
    });
  });
});

describe('getQueryFilterToExcludeTermsAndEntities (pin TagsPureUtils)', () => {
  it('excludes already-tagged assets and the never-offered types', () => {
    const filter = getQueryFilterToExcludeTermsAndEntities('PII.Sensitive');
    const must = (filter.query as { bool: { must: unknown[] } }).bool.must;
    expect(must[0]).toEqual({ bool: { must_not: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } });
    expect(must[1]).toEqual({
      bool: {
        must_not: [
          {
            terms: {
              entityType: [
                'classification',
                'testSuite',
                'testCase',
                'testCaseResolutionStatus',
                'testCaseResult',
                'tag',
                'dataProduct',
              ],
            },
          },
        ],
      },
    });
  });

  it('appends the types the viewer cannot EditTags on', () => {
    const filter = getQueryFilterToExcludeTermsAndEntities('PII.Sensitive', ['table', 'topic']);
    const must = (filter.query as { bool: { must: Array<{ bool: { must_not: unknown[] } }> } }).bool
      .must;
    const terms = must[1].bool.must_not[0] as { terms: { entityType: string[] } };
    expect(terms.terms.entityType).toContain('table');
    expect(terms.terms.entityType).toContain('topic');
  });
});

describe('buildTagAssetsQuickFilterQuery (pin getQuickFilterQuery)', () => {
  it('returns undefined with no selection', () => {
    expect(buildTagAssetsQuickFilterQuery({})).toBeUndefined();
    expect(buildTagAssetsQuickFilterQuery({ tier: [] })).toBeUndefined();
  });

  it('unions values within a field and intersects across fields', () => {
    expect(
      buildTagAssetsQuickFilterQuery({ entityType: ['table', 'dashboard'], tier: ['Tier.Tier1'] }),
    ).toEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { entityType: 'table' } }, { term: { entityType: 'dashboard' } }] } },
            { bool: { should: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } },
          ],
        },
      },
    });
  });
});

describe('combineQueryFilters (pin getCombinedQueryFilterObject)', () => {
  it('concatenates bool.must arrays and skips undefined', () => {
    expect(
      combineQueryFilters(
        getTagAssetsQueryFilter('PII.Sensitive'),
        undefined,
        buildTagAssetsQuickFilterQuery({ tier: ['Tier.Tier1'] }),
      ),
    ).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'tags.tagFQN': 'PII.Sensitive' } },
            { bool: { should: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } },
          ],
        },
      },
    });
  });

  it('returns undefined when nothing filters', () => {
    expect(combineQueryFilters(undefined, undefined)).toBeUndefined();
  });

  it('merges top-level must_not clauses and omits empty lanes', () => {
    expect(
      combineQueryFilters(
        { query: { bool: { must_not: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } } },
        { query: { bool: { must_not: [{ terms: { entityType: ['tag'] } }] } } },
      ),
    ).toEqual({
      query: {
        bool: {
          must_not: [
            { term: { 'tags.tagFQN': 'PII.Sensitive' } },
            { terms: { entityType: ['tag'] } },
          ],
        },
      },
    });
  });

  it('merges top-level should clauses', () => {
    expect(
      combineQueryFilters(
        { query: { bool: { should: [{ term: { entityType: 'table' } }] } } },
        { query: { bool: { should: [{ term: { entityType: 'dashboard' } }] } } },
      ),
    ).toEqual({
      query: {
        bool: {
          should: [{ term: { entityType: 'table' } }, { term: { entityType: 'dashboard' } }],
        },
      },
    });
  });

  it('merges all three lanes at once', () => {
    expect(
      combineQueryFilters(
        getTagAssetsQueryFilter('PII.Sensitive'),
        { query: { bool: { must_not: [{ term: { 'tags.tagFQN': 'PII.Other' } }] } } },
        { query: { bool: { should: [{ term: { entityType: 'table' } }] } } },
      ),
    ).toEqual({
      query: {
        bool: {
          must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }],
          must_not: [{ term: { 'tags.tagFQN': 'PII.Other' } }],
          should: [{ term: { entityType: 'table' } }],
        },
      },
    });
  });

  it('de-duplicates identical clauses across filters', () => {
    expect(
      combineQueryFilters(
        getTagAssetsQueryFilter('PII.Sensitive'),
        getTagAssetsQueryFilter('PII.Sensitive'),
      ),
    ).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
    });
  });
});
