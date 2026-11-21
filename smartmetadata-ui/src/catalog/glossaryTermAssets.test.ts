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
  getGlossaryTermAssetsQueryFilter,
  getQueryFilterToExcludeTerm,
} from './glossaryTermAssets';

describe('getGlossaryTermAssetsQueryFilter (pin AssetsTabs GLOSSARY branch)', () => {
  it('builds a must term query on tags.tagFQN', () => {
    expect(getGlossaryTermAssetsQueryFilter('gloss.term')).toEqual({
      query: { bool: { must: [{ term: { 'tags.tagFQN': 'gloss.term' } }] } },
    });
  });
});

describe('getQueryFilterToExcludeTerm (pin GlossaryPureUtils)', () => {
  it('excludes already-tagged assets and the three never-offered types', () => {
    expect(getQueryFilterToExcludeTerm('gloss.term')).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                must_not: [{ term: { 'tags.tagFQN': 'gloss.term' } }],
              },
            },
            {
              bool: {
                must_not: [
                  { term: { entityType: 'glossaryTerm' } },
                  { term: { entityType: 'tag' } },
                  { term: { entityType: 'dataProduct' } },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it('does not exclude per-type EditTags gaps, unlike the Tag filter', () => {
    // Pin's term picker has no entitiesNotHavingPermission lane
    // (D-G1-2): the filter is the same two must clauses whatever the
    // viewer's per-type permissions are.
    const filter = getQueryFilterToExcludeTerm('gloss.term');
    const must = (filter.query as { bool: { must: unknown[] } }).bool.must;
    expect(must).toHaveLength(2);
    expect(JSON.stringify(must)).not.toContain('table');
  });
});
