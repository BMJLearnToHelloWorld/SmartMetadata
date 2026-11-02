/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { advancedClauses, composeAdvancedQuery, parseAdvancedQuery } from './advancedSearch';

describe('advancedSearch', () => {
  it('composes Lucene clauses through the shared luceneTerm quoting', () => {
    expect(advancedClauses([{ field: 'owner', value: 'Data Eng' }])).toEqual(['ownerDisplayName:"Data Eng"']);
    expect(advancedClauses([{ field: 'entityType', value: 'table' }])).toEqual(['entityType:table']);
    expect(advancedClauses([{ field: 'owner', value: '  ' }])).toEqual([]);
  });

  it('keeps free text ahead of builder clauses', () => {
    expect(composeAdvancedQuery('orders', [{ field: 'entityType', value: 'table' }])).toBe(
      'orders AND entityType:table',
    );
    expect(composeAdvancedQuery('', [{ field: 'entityType', value: 'table' }])).toBe('entityType:table');
    expect(composeAdvancedQuery('', [])).toBe('*');
  });

  it('parses its own clauses back and leaves hand-written Lucene untouched', () => {
    const parsed = parseAdvancedQuery('orders AND ownerDisplayName:"Data Eng" AND name:foo*');
    expect(parsed.freeText).toBe('orders AND name:foo*');
    expect(parsed.rows).toEqual([{ field: 'owner', value: 'Data Eng' }]);
  });

  it('does not split on AND inside a quoted value', () => {
    const parsed = parseAdvancedQuery('ownerDisplayName:"A AND B"');
    expect(parsed.rows).toEqual([{ field: 'owner', value: 'A AND B' }]);
    expect(parsed.freeText).toBe('');
  });
});
