/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  buildLineageQueryFilter,
  hasLineageQuickFilters,
  normalizeLineageQuickFilters,
} from './quickFilters';

describe('lineage quick filters', () => {
  it('returns an empty filter string when nothing is selected', () => {
    expect(buildLineageQueryFilter([])).toBe('');
    expect(buildLineageQueryFilter([{ key: 'tag', values: [] }])).toBe('');
    expect(buildLineageQueryFilter([{ key: 'tag', values: ['  ', ''] }])).toBe('');
    expect(hasLineageQuickFilters([])).toBe(false);
  });

  it('builds one must clause per filter with term/should values on pin field keys', () => {
    const json = buildLineageQueryFilter([
      { key: 'domains', values: ['Finance'] },
      { key: 'owners', values: ['alice', 'bob'] },
      { key: 'tag', values: ['PII.Sensitive'] },
      { key: 'column', values: ['customer_id'] },
    ]);
    expect(JSON.parse(json)).toEqual({
      query: {
        bool: {
          must: [
            { bool: { should: [{ term: { 'domains.displayName.keyword': 'Finance' } }] } },
            {
              bool: {
                should: [
                  { term: { ownerDisplayName: 'alice' } },
                  { term: { ownerDisplayName: 'bob' } },
                ],
              },
            },
            { bool: { should: [{ term: { 'tags.tagFQN': 'PII.Sensitive' } }] } },
            { bool: { should: [{ term: { 'columns.name.keyword': 'customer_id' } }] } },
          ],
        },
      },
    });
    expect(hasLineageQuickFilters([{ key: 'tag', values: ['PII.Sensitive'] }])).toBe(true);
  });

  it('trims values, drops duplicates and unknown keys', () => {
    expect(
      normalizeLineageQuickFilters([
        { key: 'tag', values: [' PII ', 'PII', 'Sensitive'] },
        { key: 'tier', values: ['Tier1'] },
        { key: 'owners', values: [42] },
      ]),
    ).toEqual([{ key: 'tag', values: ['PII', 'Sensitive'] }]);
  });
});
