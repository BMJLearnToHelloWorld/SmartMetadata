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
import { mapSearchResponse } from './searchHits';

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
              owners: [{ name: 'data-eng', displayName: 'Data Eng', type: 'team' }],
              tags: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
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
    expect(mapped.hits[1].entityType).toBe('topic');
    expect(mapped.hits[1].fullyQualifiedName).toBe('kafka.events');
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

  it('returns an empty result for an unexpected payload', () => {
    expect(mapSearchResponse(null)).toEqual({ total: 0, hits: [] });
    expect(mapSearchResponse({})).toEqual({ total: 0, hits: [] });
  });
});
