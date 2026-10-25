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
import { mapSearchAggregations } from './searchFacets';

describe('mapSearchAggregations', () => {
  it('reads terms buckets and strips typed ES/OS prefixes', () => {
    const facets = mapSearchAggregations({
      aggregations: {
        'sterms#entityType': {
          buckets: [
            { key: 'table', doc_count: 12 },
            { key: 'topic', doc_count: 3 },
          ],
        },
        'sterms#tags.tagFQN': {
          buckets: [{ key: 'PII.Sensitive', doc_count: 2 }],
        },
        ignoredMetric: { value: 1 },
      },
    });

    expect(facets).toEqual([
      {
        id: 'entityType',
        field: 'entityType',
        buckets: [
          { key: 'table', count: 12 },
          { key: 'topic', count: 3 },
        ],
      },
      {
        id: 'tagFqn',
        field: 'tags.tagFQN',
        buckets: [{ key: 'PII.Sensitive', count: 2 }],
      },
    ]);
  });

  it('ignores unknown aggregation names and empty payloads', () => {
    expect(mapSearchAggregations(null)).toEqual([]);
    expect(
      mapSearchAggregations({
        aggregations: {
          'sterms#certification.tagLabel.tagFQN': { buckets: [{ key: 'Gold', doc_count: 1 }] },
        },
      }),
    ).toEqual([]);
  });
});
