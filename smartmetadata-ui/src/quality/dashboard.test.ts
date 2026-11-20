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
  buildDqDashboardChartQuery,
  buildDqDashboardNoDimensionQuery,
  buildDqDashboardTableQuery,
  buildDqIncidentCountByDaysQuery,
  buildDqIncidentTimeQuery,
  buildDqTestCaseListQuery,
  buildDqTestCaseStatusByDaysQuery,
  filterStateToChartFilters,
  healthFromCoveredCounts,
  initialDqFilterState,
  timeSeriesPointsFromReportRows,
  visibleDqFilters,
} from './dashboard';

function mustOf(query: string): Array<Record<string, unknown>> {
  return (JSON.parse(query).query.bool.must ?? []) as Array<Record<string, unknown>>;
}

describe('shared DataQualityDashboard queries', () => {
  it('merges glossaryTerms into the tags clause (pin hook parity)', () => {
    const must = mustOf(
      buildDqDashboardChartQuery({ glossaryTerms: ['Glossary.Term'] }),
    );
    expect(must).toContainEqual({
      nested: {
        path: 'tags',
        query: {
          bool: { should: [{ match: { 'tags.tagFQN': 'Glossary.Term' } }] },
        },
      },
    });
    const merged = mustOf(
      buildDqDashboardChartQuery({ tags: ['PII.Sensitive'], glossaryTerms: ['Glossary.Term'] }),
    );
    expect(merged).toContainEqual({
      nested: {
        path: 'tags',
        query: {
          bool: {
            should: [
              { match: { 'tags.tagFQN': 'PII.Sensitive' } },
              { match: { 'tags.tagFQN': 'Glossary.Term' } },
            ],
          },
        },
      },
    });
  });

  it('routes Tier / Certification tags through their first-class keys', () => {
    const tier = mustOf(buildDqDashboardChartQuery({ tier: ['Tier.Gold'] }));
    expect(tier).toContainEqual({
      bool: { should: [{ term: { 'tier.tagFQN': 'Tier.Gold' } }], minimum_should_match: 1 },
    });
    const cert = mustOf(buildDqDashboardChartQuery({ certification: ['Certified'] }));
    expect(cert).toContainEqual({
      bool: { should: [{ term: { 'certification.tagLabel.tagFQN': 'Certified' } }] },
    });
    // A Tier tag never lands in the tags clause.
    expect(JSON.stringify(tier)).not.toContain('tags.tagFQN');
  });

  it('adds the capitalized unhealthy split for the health pie', () => {
    const must = mustOf(
      buildDqDashboardChartQuery({}, undefined, { unhealthy: true }),
    );
    expect(must).toContainEqual({
      terms: { 'testCaseResult.testCaseStatus': ['Failed', 'Aborted'] },
    });
  });

  it('keeps the table query free of time clauses and testCase prefixes', () => {
    const query = buildDqDashboardTableQuery({ tags: ['PII.Sensitive'] });
    expect(query).toContain('tags.tagFQN');
    expect(query).toContain('"deleted":false');
    expect(query).not.toContain('timestamp');
    expect(query).not.toContain('testCase.');
    const noDimension = JSON.parse(
      buildDqDashboardNoDimensionQuery({ tags: ['PII.Sensitive'] }),
    );
    expect(noDimension.query.bool.must_not).toEqual([
      { exists: { field: 'dataQualityDimensionName' } },
    ]);
  });

  it('builds testCaseResult time-series queries with testCase-prefixed filters', () => {
    const range = { startTs: 1000, endTs: 2000 };
    const query = JSON.parse(
      buildDqTestCaseStatusByDaysQuery(
        { tags: ['PII.Sensitive'], certification: ['Certified'], tier: ['Tier.Gold'] },
        'Success',
        range,
      ),
    );
    const must = query.query.bool.must as Array<Record<string, unknown>>;
    expect(must).toContainEqual({ term: { testCaseStatus: 'Success' } });
    expect(must).toContainEqual({
      range: { timestamp: { gte: 1000, lte: 2000 } },
    });
    expect(must).toContainEqual({
      nested: {
        path: 'testCase.tags',
        query: {
          bool: { should: [{ match: { 'testCase.tags.tagFQN': 'PII.Sensitive' } }] },
        },
      },
    });
    expect(must).toContainEqual({
      bool: {
        should: [{ term: { 'testCase.tier.tagFQN': 'Tier.Gold' } }],
        minimum_should_match: 1,
      },
    });
    // Pin's time-series fetchers carry no certification clause and no
    // deleted clause — mirrored exactly, not "fixed".
    expect(JSON.stringify(must)).not.toContain('certification');
    expect(JSON.stringify(must)).not.toContain('deleted');
  });

  it('builds incident queries against the resolution-status index shapes', () => {
    const count = JSON.parse(
      buildDqIncidentCountByDaysQuery({ tags: ['PII.Sensitive'] }, 'New', {
        startTs: 1000,
        endTs: 2000,
      }),
    );
    expect(count.query.bool.must).toContainEqual({
      term: { testCaseResolutionStatusType: 'New' },
    });
    const time = JSON.parse(
      buildDqIncidentTimeQuery({}, 'timeToResponse', { startTs: 1000, endTs: 2000 }),
    );
    expect(time.query.bool.must).toContainEqual({
      nested: {
        path: 'metrics',
        query: {
          bool: { must: [{ match: { 'metrics.name.keyword': 'timeToResponse' } }] },
        },
      },
    });
  });

  it('scopes entityFQN to the test-case-status series only (pin parity)', () => {
    const status = JSON.parse(
      buildDqTestCaseStatusByDaysQuery({ entityFQN: 'Table.Foo' }, 'Success'),
    );
    expect(status.query.bool.must).toContainEqual({
      term: { 'testCase.entityFQN': 'Table.Foo' },
    });
    // Pin's two incident fetchers never carry the entity FQN clause.
    const count = JSON.parse(
      buildDqIncidentCountByDaysQuery({ entityFQN: 'Table.Foo' }, 'New'),
    );
    expect(JSON.stringify(count.query.bool.must)).not.toContain('entityFQN');
    const time = JSON.parse(
      buildDqIncidentTimeQuery({ entityFQN: 'Table.Foo' }, 'timeToResponse'),
    );
    expect(JSON.stringify(time.query.bool.must)).not.toContain('entityFQN');
  });

  it('maps date-histogram rows to ascending daily points', () => {
    const points = timeSeriesPointsFromReportRows(
      [
        { timestamp: '1700086400000', 'testCase.fullyQualifiedName': '3' },
        { timestamp: '1700000000000', 'testCase.fullyQualifiedName': '2' },
        { timestamp: 'not-a-number', 'testCase.fullyQualifiedName': '9' },
        { timestamp: '1700000000000', 'testCase.fullyQualifiedName': '' },
      ],
      'testCase.fullyQualifiedName',
    );
    expect(points).toEqual([
      { label: '2023-11-14', value: 2 },
      { label: '2023-11-15', value: 3 },
    ]);
  });

  it('derives health as covered minus unhealthy-covered', () => {
    expect(healthFromCoveredCounts(2, 1)).toEqual({ healthy: 1, unhealthy: 1, total: 2 });
    expect(healthFromCoveredCounts(2, undefined)).toEqual({ healthy: 2, unhealthy: 0, total: 2 });
    expect(healthFromCoveredCounts(undefined, 1)).toBeNull();
  });

  it('builds the drill-down list query from the current slice plus the clicked status', () => {
    const query = buildDqTestCaseListQuery(
      {
        tags: ['PII.Sensitive'],
        glossaryTerms: ['Glossary.Term'],
        tier: ['Tier.Gold', 'Tier.Silver'],
        dataProductFqns: ['Product.A'],
        entityFQN: 'svc.db.schema.orders',
        startTs: 1000,
        endTs: 2000,
      },
      { testCaseStatus: 'Failed' },
    );
    expect(query.testCaseStatus).toBe('Failed');
    // Glossary terms merge into tags, pin hook defaultFilters parity.
    expect(query.tags).toEqual(['PII.Sensitive', 'Glossary.Term']);
    // Pin getTestCaseListPath carries only the first tier / data product.
    expect(query.tier).toBe('Tier.Gold');
    expect(query.dataProductFqn).toBe('Product.A');
    expect(query.tableFqn).toBe('svc.db.schema.orders');
    expect(query.startTs).toBe('1000');
    expect(query.endTs).toBe('2000');
  });

  it('builds the dimension drill-down without a status', () => {
    const query = buildDqTestCaseListQuery({ tags: ['PII.Sensitive'] }, { dataQualityDimension: 'Completeness' });
    expect(query.dataQualityDimension).toBe('Completeness');
    expect(query.testCaseStatus).toBeUndefined();
    expect(query.tags).toEqual(['PII.Sensitive']);
  });

  it('converts initial filters to multi-select state and back, keeping every value', () => {
    const state = initialDqFilterState({
      ownerFqn: 'alice',
      tags: ['PII.Sensitive', 'PII.Extra'],
      glossaryTerms: ['Glossary.Term'],
      tier: ['Tier.Gold'],
    });
    expect(state).toEqual({
      owner: ['alice'],
      tier: ['Tier.Gold'],
      certification: [],
      tag: ['PII.Sensitive', 'PII.Extra'],
      glossaryTerm: ['Glossary.Term'],
      dataProduct: [],
    });
    const chart = filterStateToChartFilters(state, { startTs: 1, endTs: 2 });
    expect(chart.tags).toEqual(['PII.Sensitive', 'PII.Extra']);
    expect(chart.glossaryTerms).toEqual(['Glossary.Term']);
    expect(chart.ownerFqn).toBe('alice');
    expect(chart.startTs).toBe(1);
    expect(visibleDqFilters(['tags', 'glossaryTerms'])).toEqual([
      'owner',
      'tier',
      'certification',
      'dataProducts',
    ]);
  });

  it('carries only the first owner into the singular ownerFqn (pin handleOwnerChange)', () => {
    const chart = filterStateToChartFilters(
      { owner: ['alice', 'bob'], tier: [], certification: [], tag: [], glossaryTerm: [], dataProduct: [] },
      { startTs: 1, endTs: 2 },
    );
    expect(chart.ownerFqn).toBe('alice');
  });
});
