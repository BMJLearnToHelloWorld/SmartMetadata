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
import { hitLocation, mapSearchResponse } from './searchHits';

describe('mapSearchResponse', () => {
  it('reads Elasticsearch hits.hits._source fields used by GET /v1/search/query', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 2, relation: 'eq' },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              id: 't1',
              name: 'orders',
              displayName: 'Orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
              description: 'Daily orders',
              serviceType: 'BigQuery',
              service: { name: 'bq', displayName: 'BigQuery Prod' },
              database: { name: 'analytics' },
              databaseSchema: { name: 'marts' },
              tier: { tagFQN: 'Tier.Tier1' },
              owners: [{ name: 'data-eng', displayName: 'Data Eng', type: 'team' }],
              tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive', labelType: 'Generated' }],
              domains: [{ name: 'finance', displayName: 'Finance' }],
              dataProducts: [{ name: 'mart', displayName: 'Orders Mart' }],
              dataType: 'varchar(50)',
              table: { name: 'orders', displayName: 'Orders' },
              constraint: 'NULL',
              updatedAt: 1710000000000,
            },
          },
          {
            _id: 'k1',
            _index: 'topic_search_index',
            _source: {
              name: 'events',
              fullyQualifiedName: 'kafka.events',
              entityType: 'topic',
            },
          },
        ],
      },
      aggregations: {
        'sterms#entityType': { buckets: [{ key: 'table', doc_count: 2 }] },
      },
    });

    expect(mapped.total).toBe(2);
    expect(mapped.hits).toHaveLength(2);
    expect(mapped.hits[0]).toMatchObject({
      id: 't1',
      name: 'orders',
      displayName: 'Orders',
      fullyQualifiedName: 'svc.db.schema.orders',
      entityType: 'table',
      description: 'Daily orders',
    });
    expect(mapped.hits[0].owners[0].name).toBe('data-eng');
    expect(mapped.hits[0].tags[0].tagFQN).toBe('PII.Sensitive');
    // Pin gate (D-F1): search surfaces render Generated plain, so the
    // search mapper drops labelType even when the ES payload carries it.
    expect(mapped.hits[0].tags[0].labelType).toBeUndefined();
    expect(mapped.hits[0]).toMatchObject({
      serviceType: 'BigQuery',
      serviceName: 'BigQuery Prod',
      databaseName: 'analytics',
      schemaName: 'marts',
      tier: 'Tier.Tier1',
      dataType: 'varchar(50)',
      tableName: 'Orders',
      constraint: 'NULL',
      updatedAt: 1710000000000,
    });
    expect(mapped.hits[0].domains?.[0].displayName).toBe('Finance');
    expect(mapped.hits[0].dataProducts?.[0].displayName).toBe('Orders Mart');
    expect(mapped.hits[1].entityType).toBe('topic');
    expect(mapped.hits[1].fullyQualifiedName).toBe('kafka.events');
    expect(mapped.facets).toEqual([
      { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 2 }] },
    ]);
  });

  it('carries the ES highlight node and parent FQNs for card breadcrumbs (D18–D20)', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
              service: { name: 'bq', displayName: 'BigQuery Prod', fullyQualifiedName: 'bigquery' },
              database: { name: 'analytics', fullyQualifiedName: 'bigquery.analytics' },
              databaseSchema: { name: 'marts', fullyQualifiedName: 'bigquery.analytics.marts' },
            },
            highlight: {
              displayName: ['<span class="text-highlighter">Orders</span>'],
              description: ['Daily <span class="text-highlighter">orders</span>'],
              'columns.name.ngram': ['ord'],
            },
          },
        ],
      },
    });
    expect(mapped.hits).toHaveLength(1);
    expect(mapped.hits[0]).toMatchObject({
      serviceFqn: 'bigquery',
      databaseFqn: 'bigquery.analytics',
      schemaFqn: 'bigquery.analytics.marts',
      highlight: {
        displayName: ['<span class="text-highlighter">Orders</span>'],
        description: ['Daily <span class="text-highlighter">orders</span>'],
        'columns.name.ngram': ['ord'],
      },
    });
  });

  it('leaves highlight and parent FQNs absent when the hit carries none', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'k1',
            _index: 'topic_search_index',
            _source: { name: 'events', fullyQualifiedName: 'kafka.events', entityType: 'topic' },
          },
        ],
      },
    });
    expect(mapped.hits[0].highlight).toBeUndefined();
    expect(mapped.hits[0].serviceFqn).toBeUndefined();
    expect(mapped.hits[0].databaseFqn).toBeUndefined();
    expect(mapped.hits[0].schemaFqn).toBeUndefined();
  });

  it('accepts a numeric hits.total and infers type from the index name', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: 1,
        hits: [
          {
            _index: 'topic_search_index',
            _source: { name: 'clicks', fullyQualifiedName: 'mq.clicks' },
          },
        ],
      },
    });
    expect(mapped.total).toBe(1);
    expect(mapped.hits[0].entityType).toBe('topic');
  });

  it('keeps only official Domain.domainType enum values on domain hits', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 2, relation: 'eq' },
        hits: [
          {
            _id: 'd1',
            _index: 'domain_search_index',
            _source: {
              id: 'd1',
              name: 'sales',
              fullyQualifiedName: 'sales',
              entityType: 'domain',
              domainType: 'Aggregate',
            },
          },
          {
            _id: 'd2',
            _index: 'domain_search_index',
            _source: {
              id: 'd2',
              name: 'bogus',
              fullyQualifiedName: 'bogus',
              entityType: 'domain',
              domainType: 'NotAType',
            },
          },
        ],
      },
    });
    expect(mapped.hits[0].domainType).toBe('Aggregate');
    expect(mapped.hits[1].domainType).toBeUndefined();
  });

  it('joins service / database / schema for the card location line', () => {
    expect(
      hitLocation({
        name: 'orders',
        fullyQualifiedName: 'svc.db.schema.orders',
        entityType: 'table',
        serviceName: 'BigQuery Prod',
        databaseName: 'analytics',
        schemaName: 'marts',
        owners: [],
        tags: [],
      }),
    ).toBe('BigQuery Prod / analytics / marts');
  });

  it('returns an empty result for an unexpected payload', () => {
    expect(mapSearchResponse(null)).toEqual({ total: 0, hits: [], facets: [] });
    expect(mapSearchResponse({})).toEqual({ total: 0, hits: [], facets: [] });
  });

  it('keeps the embedded table FQN for tableColumn hits (Fix3)', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'c1',
            _index: 'tableColumn_search_index',
            _source: {
              name: 'customer_id',
              fullyQualifiedName: 'svc.db.schema.orders.customer_id',
              entityType: 'tableColumn',
              table: { name: 'orders', displayName: 'Orders', fullyQualifiedName: 'svc.db.schema.orders' },
              owners: [],
              tags: [],
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]?.tableFqn).toBe('svc.db.schema.orders');
    expect(mapped.hits[0]?.tableName).toBe('Orders');
  });

  it('leaves tableFqn absent when the column source carries no table (Fix3)', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'c2',
            _index: 'tableColumn_search_index',
            _source: {
              name: 'orphan_col',
              fullyQualifiedName: 'svc.db.schema.orders.orphan_col',
              entityType: 'tableColumn',
              owners: [],
              tags: [],
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]?.tableFqn).toBeUndefined();
  });

  it('maps metric status, parent, type, granularity, and childrenCount for the metrics list', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'm1',
            _index: 'metric_search_index',
            _source: {
              id: 'm1',
              name: 'mau',
              fullyQualifiedName: 'kpi.mau',
              entityType: 'metric',
              entityStatus: 'In Review',
              parent: { id: 'm0', name: 'mau-root', fullyQualifiedName: 'kpi.mau-root', type: 'metric' },
              metricType: 'NUMBER',
              granularity: 'MONTHLY',
              childrenCount: 2,
              owners: [],
              tags: [],
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]).toMatchObject({
      entityStatus: 'In Review',
      metricType: 'NUMBER',
      granularity: 'MONTHLY',
      childrenCount: 2,
    });
    expect(mapped.hits[0]?.parent).toMatchObject({ fullyQualifiedName: 'kpi.mau-root' });
  });

  it('carries usageSummary only when the _source carries the key', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 3 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
              usageSummary: { weeklyStats: { count: 20, percentileRank: 45.5 } },
            },
          },
          {
            _id: 't2',
            _index: 'table_search_index',
            _source: { name: 'raw', fullyQualifiedName: 'svc.db.schema.raw', entityType: 'table' },
          },
          {
            _id: 't3',
            _index: 'table_search_index',
            _source: {
              name: 'empty',
              fullyQualifiedName: 'svc.db.schema.empty',
              entityType: 'table',
              usageSummary: null,
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]?.usageSummary?.weeklyStats?.percentileRank).toBe(45.5);
    expect(mapped.hits[1]?.usageSummary).toBeUndefined();
    expect(mapped.hits[2]?.usageSummary).toEqual({});
  });

  it('carries the ranking payload when explain was requested (D12)', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _score: 12.345678,
            _explanation: {
              value: 12.345678,
              description: 'sum of',
              details: [
                { value: 7, description: 'weight(displayName.keyword:orders in 0)' },
                { value: 'not-a-number', description: 'weight(broken in 0)' },
                { value: 1, description: '' },
              ],
            },
            matched_queries: ['ranking:exactName', 'unrelated', 42],
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]?.score).toBe(12.345678);
    expect(mapped.hits[0]?.matchedQueries).toEqual(['ranking:exactName', 'unrelated']);
    expect(mapped.hits[0]?.explanation).toEqual({
      value: 12.345678,
      description: 'sum of',
      details: [{ value: 7, description: 'weight(displayName.keyword:orders in 0)' }],
    });
  });

  it('leaves the ranking payload absent without explain data (D12)', () => {
    const mapped = mapSearchResponse({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
            },
          },
        ],
      },
    });
    expect(mapped.hits[0]?.score).toBeUndefined();
    expect(mapped.hits[0]?.explanation).toBeUndefined();
    expect(mapped.hits[0]?.matchedQueries).toBeUndefined();
  });

  it('carries the NLQ applied-filters echo when present (D11)', () => {
    const mapped = mapSearchResponse({
      applied_quick_filters: { fieldList: ['owner', 'tier'] },
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
            },
          },
        ],
      },
    });
    expect(mapped.appliedQuickFilters).toEqual({ fieldList: ['owner', 'tier'] });
  });

  it('leaves the NLQ echo absent without applied_quick_filters (D11)', () => {
    const mapped = mapSearchResponse({
      applied_quick_filters: { fieldList: [] },
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 't1',
            _index: 'table_search_index',
            _source: {
              name: 'orders',
              fullyQualifiedName: 'svc.db.schema.orders',
              entityType: 'table',
            },
          },
        ],
      },
    });
    expect(mapped.appliedQuickFilters).toBeUndefined();
    expect('appliedQuickFilters' in mapped).toBe(false);
  });
});
