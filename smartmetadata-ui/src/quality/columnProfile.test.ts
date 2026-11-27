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
  PAGE_SIZE_LARGE,
  buildOverallSummary,
  calculatePercentage,
  flattenColumnRows,
  formatProportion,
  pruneEmptyChildren,
  sortColumnRecords,
  type ColumnProfileRecord,
} from './columnProfile';

describe('columnProfile official helpers', () => {
  it('uses official PAGE_SIZE_LARGE of 50', () => {
    expect(PAGE_SIZE_LARGE).toBe(50);
  });

  it('formats a 0-1 proportion as official calculatePercentage(value, 1, 2, true)', () => {
    expect(calculatePercentage(0.25, 1, 2, true)).toBe('25%');
    expect(formatProportion(0.333)).toBe('33.3%');
    expect(formatProportion(null)).toBe('--');
    expect(formatProportion(undefined)).toBe('--');
  });

  it('prunes empty children so only nested columns keep an expand chevron', () => {
    const pruned = pruneEmptyChildren([
      { name: 'root', children: [] },
      { name: 'parent', children: [{ name: 'child', children: [] }] },
    ]);
    expect(pruned[0]?.children).toBeUndefined();
    expect(pruned[1]?.children?.map((child) => child.name)).toEqual(['child']);
    expect(pruned[1]?.children?.[0]?.children).toBeUndefined();
  });

  it('flattens expanded nested rows and sorts official comparable columns', () => {
    const rows: ColumnProfileRecord[] = [
      { name: 'b', dataType: 'INT', profile: { valuesCount: 2 } },
      {
        name: 'a',
        fullyQualifiedName: 't.a',
        dataType: 'STRING',
        profile: { valuesCount: 10 },
        children: [{ name: 'child', fullyQualifiedName: 't.a.child' }],
      },
    ];
    const sorted = sortColumnRecords(rows, 'name', 'ascend');
    expect(sorted.map((row) => row.name)).toEqual(['a', 'b']);
    const collapsed = flattenColumnRows(sorted, new Set());
    expect(collapsed.map((row) => row.record.name)).toEqual(['a', 'b']);
    const expanded = flattenColumnRows(sorted, new Set(['t.a']));
    expect(expanded.map((row) => row.record.name)).toEqual(['a', 'child', 'b']);
    expect(expanded[1]?.depth).toBe(1);
  });

  it('builds the official five overall summary cards from the table profile', () => {
    const cards = buildOverallSummary(
      {
        rowCount: 1000,
        columnCount: 4,
        sizeInByte: 0,
        profileSampleType: 'Percentage',
        profileSample: 50,
        columns: [],
      },
      (key, values) => {
        if (key === 'label.entity-count') return (values?.entity ?? '') + ' Count';
        if (key === 'label.column-entity') return 'Column ' + (values?.entity ?? '');
        if (key === 'label.row') return 'Row';
        if (key === 'label.count') return 'Count';
        if (key === 'label.profile-sample-type') return 'Profile Sample type';
        if (key === 'label.size') return 'Size';
        if (key === 'label.created-date') return 'Created Date';
        return key;
      },
    );
    expect(cards.map((card) => card.key)).toEqual([
      'row-count',
      'column-count',
      'profile-sample-type',
      'size',
      'created-date',
    ]);
    expect(cards[0]?.value).toBe('1,000');
    expect(cards[2]?.value).toBe('50%');
    expect(cards[4]?.value).toBe('--');
  });
});
