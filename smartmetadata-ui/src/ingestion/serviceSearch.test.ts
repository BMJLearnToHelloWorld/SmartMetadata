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
  buildServiceQueryFilter,
  escapeServiceSearchTerm,
  filterMetadataOpenMetadata,
  isServiceSearchNumberBased,
} from './serviceSearch';
import type { CatalogService } from '@/types/ingestion';

describe('serviceSearch queryFilter', () => {
  it('returns undefined with no search term and no type filter', () => {
    expect(buildServiceQueryFilter('', [])).toBeUndefined();
  });

  it('escapes * ? and backslash in the search term', () => {
    expect(escapeServiceSearchTerm('a*b?c\\d')).toBe('a\\*b\\?c\\\\d');
    expect(escapeServiceSearchTerm('plain')).toBe('plain');
  });

  it('builds the wildcard should clause for a search term', () => {
    expect(buildServiceQueryFilter('my*db', [])).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [
                  { wildcard: { 'name.keyword': '*my\\*db*' } },
                  { wildcard: { 'displayName.keyword': '*my\\*db*' } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });
  });

  it('builds the serviceType term clause for type filters', () => {
    expect(buildServiceQueryFilter('', ['Mysql', 'Postgres'])).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [{ term: { serviceType: 'Mysql' } }, { term: { serviceType: 'Postgres' } }],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });
  });

  it('must-combines search and type clauses', () => {
    const filter = buildServiceQueryFilter('x', ['Kafka']);
    expect(filter?.query.bool.must).toHaveLength(2);
  });
});

describe('isServiceSearchNumberBased', () => {
  it('is true with only a search term, only a filter, or both; false with neither', () => {
    expect(isServiceSearchNumberBased('x', [])).toBe(true);
    expect(isServiceSearchNumberBased('', ['Kafka'])).toBe(true);
    expect(isServiceSearchNumberBased('x', ['Kafka'])).toBe(true);
    expect(isServiceSearchNumberBased('', [])).toBe(false);
  });
});

describe('filterMetadataOpenMetadata', () => {
  const services = [
    { fullyQualifiedName: 'OpenMetadata', name: 'OpenMetadata' },
    { fullyQualifiedName: 'Amundsen', name: 'Amundsen' },
  ] as CatalogService[];

  it('drops the OpenMetadata service only for the metadata category', () => {
    expect(filterMetadataOpenMetadata(services, true).map((s) => s.name)).toEqual(['Amundsen']);
    expect(filterMetadataOpenMetadata(services, false).map((s) => s.name)).toEqual([
      'OpenMetadata',
      'Amundsen',
    ]);
  });
});
