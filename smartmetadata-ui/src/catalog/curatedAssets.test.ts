/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  getCuratedExploreURL,
  getModifiedQueryFilterWithSelectedAssets,
  getTotalResourceCount,
  isValidElasticsearchQuery,
} from './curatedAssets';
import { buildCuratedQueryFilter, DEFAULT_CURATED_RULE, describeCuratedRule } from './curatedRule';

describe('getModifiedQueryFilterWithSelectedAssets', () => {
  it('leaves the filter untouched for all or no selection', () => {
    const filter = { query: { bool: { must: [] } } };
    expect(getModifiedQueryFilterWithSelectedAssets(filter, ['all'])).toBe(filter);
    expect(getModifiedQueryFilterWithSelectedAssets(filter, [])).toBe(filter);
    expect(getModifiedQueryFilterWithSelectedAssets(filter, undefined)).toBe(filter);
  });

  it('ANDs an entityType should-clause onto the saved filter', () => {
    const filter = { query: { bool: { must: [{ term: { 'tier.tagFQN': 'Tier.Tier1' } }] } } };
    const result = getModifiedQueryFilterWithSelectedAssets(filter, ['table', 'topic']);
    expect(result).toEqual({
      query: {
        bool: {
          must: [
            filter.query,
            { bool: { should: [{ term: { entityType: 'table' } }, { term: { entityType: 'topic' } }] } },
          ],
        },
      },
    });
  });

  it('starts a bool query when the saved filter has no query', () => {
    const result = getModifiedQueryFilterWithSelectedAssets({}, ['table']);
    expect(result).toEqual({
      query: { bool: { must: [{ bool: { should: [{ term: { entityType: 'table' } }] } }] } },
    });
  });
});

describe('getTotalResourceCount', () => {
  const buckets = [
    { key: 'table', doc_count: 4 },
    { key: 'topic', doc_count: 3 },
    { key: 'dashboard', doc_count: 2 },
  ];

  it('sums only the selected buckets', () => {
    expect(getTotalResourceCount(buckets, ['table', 'topic'])).toBe(7);
  });

  it('counts every listed type when all is selected', () => {
    expect(getTotalResourceCount(buckets, ['all'])).toBe(9);
  });
});

describe('isValidElasticsearchQuery', () => {
  it('rejects empty filter strings', () => {
    expect(isValidElasticsearchQuery('')).toBe(false);
    expect(isValidElasticsearchQuery('{}')).toBe(false);
    expect(isValidElasticsearchQuery('{"query":{"bool":{"must":[]}}}')).toBe(false);
  });

  it('accepts a well-formed bool filter and a plain term query', () => {
    expect(
      isValidElasticsearchQuery(
        '{"query":{"bool":{"must":[{"term":{"tier.tagFQN":"Tier.Tier1"}}]}}}',
      ),
    ).toBe(true);
    expect(isValidElasticsearchQuery('{"query":{"term":{"entityType":"table"}}}')).toBe(true);
  });

  it('rejects malformed JSON and a bool with an empty must', () => {
    expect(isValidElasticsearchQuery('{not json')).toBe(false);
    expect(isValidElasticsearchQuery('{"query":{"bool":{"must":[]}}}')).toBe(false);
  });
});

describe('getCuratedExploreURL', () => {
  it('sends a saved filter as query_filter JSON', () => {
    expect(
      getCuratedExploreURL({
        queryFilter: '{"query":{"bool":{"must":[]}}}',
        resources: ['table'],
        rule: DEFAULT_CURATED_RULE,
      }),
    ).toEqual({
      name: 'search',
      query: { query_filter: '{"query":{"bool":{"must":[]}}}' },
    });
  });

  it('sends the chip rule as facet params', () => {
    expect(
      getCuratedExploreURL({ rule: DEFAULT_CURATED_RULE }),
    ).toEqual({
      name: 'search',
      query: { tier: 'Tier.Tier1', certification: 'Certification.Gold' },
    });
  });
});

describe('curatedRule', () => {
  it('builds an AND of term clauses from the default rule', () => {
    expect(buildCuratedQueryFilter(DEFAULT_CURATED_RULE)).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'tier.tagFQN': 'Tier.Tier1' } },
            { term: { 'certification.tagLabel.tagFQN': 'Certification.Gold' } },
          ],
        },
      },
    });
  });

  it('describes the rule as one locale-joined phrase', () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (key === 'message.field-is-value') {
        return `${params?.field} is ${params?.value}`;
      }
      if (key === 'label.tier') return 'Tier';
      if (key === 'label.certification') return 'Certification';
      return key;
    };
    expect(describeCuratedRule(DEFAULT_CURATED_RULE, t, 'en')).toBe(
      'Tier is Tier1 and Certification is Gold',
    );
  });
});
