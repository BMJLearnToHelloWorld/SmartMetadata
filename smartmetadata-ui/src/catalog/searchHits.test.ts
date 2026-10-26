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
              tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
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
    expect(mapped.hits[0]).toMatchObject({
      serviceType: 'BigQuery',
      serviceName: 'BigQuery Prod',
      databaseName: 'analytics',
      schemaName: 'marts',
      tier: 'Tier.Tier1',
      updatedAt: 1710000000000,
    });
    expect(mapped.hits[1].entityType).toBe('topic');
    expect(mapped.hits[1].fullyQualifiedName).toBe('kafka.events');
    expect(mapped.facets).toEqual([
      { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 2 }] },
    ]);
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
});
