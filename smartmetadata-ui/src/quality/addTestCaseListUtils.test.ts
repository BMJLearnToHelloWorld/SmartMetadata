/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getColumnNameFromColumnFilterKey,
  getSelectionFlags,
  parseColumnAggregateBuckets,
} from './addTestCaseListUtils';

describe('addTestCaseListUtils', () => {
  it('parses column aggregate buckets with optional table FQN prefix', () => {
    expect(parseColumnAggregateBuckets([{ key: 'zip' }], 'db.t')).toEqual([
      { key: 'db.t::zip', label: 'zip' },
    ]);
  });

  it('extracts column name from composite filter key', () => {
    expect(getColumnNameFromColumnFilterKey('db.t::amount')).toBe('amount');
    expect(getColumnNameFromColumnFilterKey('amount')).toBe('amount');
  });

  it('shows select-all-total link when every loaded row is selected and more exist server-side', () => {
    const flags = getSelectionFlags({
      loadedItemIds: ['a', 'b'],
      isLoadedRowSelected: (id) => id === 'a' || id === 'b',
      selectAll: false,
      totalCount: 50,
      itemsLength: 2,
    });
    expect(flags.showSelectAllTotalLink).toBe(true);
  });
});