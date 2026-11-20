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
import { buildSchemaQueryFilter } from './searchFilters';

describe('buildSchemaQueryFilter (pin getTermQuery shape)', () => {
  it('builds a bool/must term filter without a search string', () => {
    expect(buildSchemaQueryFilter('databaseSchema.fullyQualifiedName.keyword', 'svc.db.schema')).toBe(
      JSON.stringify({
        bool: { must: [{ term: { 'databaseSchema.fullyQualifiedName.keyword': 'svc.db.schema' } }] },
      }),
    );
  });

  it('adds a should wildcard clause for displayName and name when searching', () => {
    expect(
      buildSchemaQueryFilter('apiCollection.fullyQualifiedName', 'svc.coll', 'pet'),
    ).toBe(
      JSON.stringify({
        bool: {
          must: [
            { term: { 'apiCollection.fullyQualifiedName': 'svc.coll' } },
            {
              bool: {
                should: [
                  { wildcard: { 'displayName.keyword': '*pet*' } },
                  { wildcard: { 'name.keyword': '*pet*' } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      }),
    );
  });
});
