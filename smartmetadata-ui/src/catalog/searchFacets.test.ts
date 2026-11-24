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
import { aggregationFieldNamesForFacet, mapSearchAggregations } from './searchFacets';

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
          'sterms#certification.tagLabel.tagFQN': { buckets: [{ key: 'Certification.Gold', doc_count: 2 }] },
          'sterms#dataProducts.displayName.keyword': { buckets: [{ key: 'Finance', doc_count: 1 }] },
        },
      }),
    ).toEqual([
      {
        id: 'certification',
        field: 'certification.tagLabel.tagFQN',
        buckets: [{ key: 'Certification.Gold', count: 2 }],
      },
      {
        id: 'dataProduct',
        field: 'dataProducts.displayName.keyword',
        buckets: [{ key: 'Finance', count: 1 }],
      },
    ]);
    expect(
      mapSearchAggregations({
        aggregations: {
          'sterms#not.a.real.facet': { buckets: [{ key: 'Gold', doc_count: 1 }] },
        },
      }),
    ).toEqual([]);
  });
});

describe('aggregationFieldNamesForFacet', () => {
  it('returns both entity-type aggregation names for the entityType facet', () => {
    // Official keeps two entity-type filter keys; the self-exclusion is
    // derived from these names (ADR:2026-11-11-explore-facet-self-exclusion).
    expect(aggregationFieldNamesForFacet('entityType')).toEqual(['entityType', 'entityType.keyword']);
    expect(aggregationFieldNamesForFacet('service')).toEqual(['service.displayName.keyword']);
    // classificationTags / glossaryTags are tag FQNs split by provenance
    // (server ParseTags), so they are fallback sources of the tag facet.
    expect(aggregationFieldNamesForFacet('tagFqn')).toEqual([
      'tags.tagFQN',
      'classificationTags',
      'glossaryTags',
    ]);
    // The database/schema facets filter on the display-name variants
    // (pin TABLE/COLUMN dropdown fields) while keeping the name.keyword
    // aggregations as fallback sources.
    expect(aggregationFieldNamesForFacet('database')).toEqual([
      'database.name.keyword',
      'database.displayName',
    ]);
    expect(aggregationFieldNamesForFacet('schema')).toEqual([
      'databaseSchema.name.keyword',
      'databaseSchema.displayName',
    ]);
  });
});

describe('mapSearchAggregations display-name preference', () => {
  it('prefers the displayName aggregation over name.keyword on a tie', () => {
    const facets = mapSearchAggregations({
      aggregations: {
        'sterms#database.name.keyword': {
          buckets: [{ key: 'orders', doc_count: 4 }],
        },
        'sterms#database.displayName': {
          buckets: [{ key: 'Orders DB', doc_count: 4 }],
        },
        'sterms#databaseSchema.name.keyword': {
          buckets: [{ key: 'public', doc_count: 4 }],
        },
        'sterms#databaseSchema.displayName': {
          buckets: [{ key: 'Public', doc_count: 4 }],
        },
      },
    });
    expect(facets).toEqual([
      {
        id: 'database',
        field: 'database.displayName.keyword',
        buckets: [{ key: 'Orders DB', count: 4 }],
      },
      {
        id: 'schema',
        field: 'databaseSchema.displayName.keyword',
        buckets: [{ key: 'Public', count: 4 }],
      },
    ]);
  });

  it('keeps a strictly longer fallback list over a shorter preferred one', () => {
    const facets = mapSearchAggregations({
      aggregations: {
        'sterms#database.name.keyword': {
          buckets: [
            { key: 'orders', doc_count: 4 },
            { key: 'billing', doc_count: 2 },
          ],
        },
        'sterms#database.displayName': {
          buckets: [{ key: 'Orders DB', doc_count: 4 }],
        },
      },
    });
    expect(facets).toEqual([
      {
        id: 'database',
        field: 'database.displayName.keyword',
        buckets: [
          { key: 'orders', count: 4 },
          { key: 'billing', count: 2 },
        ],
      },
    ]);
  });

  it('maps classificationTags and glossaryTags as tag-facet fallbacks', () => {
    expect(
      mapSearchAggregations({
        aggregations: {
          'sterms#classificationTags': {
            buckets: [{ key: 'PII.Sensitive', doc_count: 2 }],
          },
          'sterms#glossaryTags': {
            buckets: [{ key: 'Glossary.Term', doc_count: 1 }],
          },
        },
      }),
    ).toEqual([
      {
        id: 'tagFqn',
        field: 'tags.tagFQN',
        buckets: [{ key: 'PII.Sensitive', count: 2 }],
      },
    ]);
    // tags.tagFQN is the union source and wins when present.
    expect(
      mapSearchAggregations({
        aggregations: {
          'sterms#tags.tagFQN': {
            buckets: [
              { key: 'PII.Sensitive', doc_count: 2 },
              { key: 'Glossary.Term', doc_count: 1 },
            ],
          },
          'sterms#classificationTags': {
            buckets: [{ key: 'PII.Sensitive', doc_count: 2 }],
          },
        },
      }),
    ).toEqual([
      {
        id: 'tagFqn',
        field: 'tags.tagFQN',
        buckets: [
          { key: 'PII.Sensitive', count: 2 },
          { key: 'Glossary.Term', count: 1 },
        ],
      },
    ]);
  });
});
