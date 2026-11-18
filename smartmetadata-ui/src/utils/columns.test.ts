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
  EMPTY_REFERENCE_LIST_TEXT,
  LIST_CAP,
  actionTooltipTitle,
  descriptionColumnDef,
  entityNameColumnDef,
  referenceListColumnDef,
  resolveTooltipTitle,
  splitReferenceList,
} from './columns';

describe('columns helpers (official TableColumn.util + Roles/Policies lists)', () => {
  it('caps the visible reference prefix at LIST_CAP = 1', () => {
    expect(LIST_CAP).toBe(1);
    const split = splitReferenceList(['a', 'b', 'c']);
    expect(split.visible).toEqual(['a']);
    expect(split.overflow).toEqual(['b', 'c']);
    expect(split.hasMore).toBe(true);
    expect(split.overflowCount).toBe(2);
    expect(split.isEmpty).toBe(false);
  });

  it('reports a single reference as fully visible and empty input as empty', () => {
    expect(splitReferenceList(['a'])).toEqual({
      visible: ['a'],
      overflow: [],
      hasMore: false,
      overflowCount: 0,
      isEmpty: false,
    });
    expect(splitReferenceList([]).isEmpty).toBe(true);
    expect(splitReferenceList(undefined).isEmpty).toBe(true);
    expect(splitReferenceList(null).visible).toEqual([]);
    expect(EMPTY_REFERENCE_LIST_TEXT).toBe('-- ');
  });

  it('resolves tooltip titles by first matching rule with fallback', () => {
    expect(
      resolveTooltipTitle(
        [
          { matches: false, title: 'system' },
          { matches: true, title: 'admin' },
        ],
        'fallback',
      ),
    ).toBe('admin');
    expect(resolveTooltipTitle([{ matches: false, title: 'system' }], 'fallback')).toBe(
      'fallback',
    );
  });

  it('expresses the Bot three-state tooltip and the COL-4 two-state tooltip through one helper', () => {
    // Bot list: system wins over admin; admin wins over the admin-only fallback.
    const botTitle = (isSystemBot: boolean, isAdmin: boolean) =>
      resolveTooltipTitle(
        [
          { matches: isSystemBot, title: 'ingestion-bot' },
          { matches: isAdmin, title: 'Delete' },
        ],
        'admin-only',
      );
    expect(botTitle(true, true)).toBe('ingestion-bot');
    expect(botTitle(false, true)).toBe('Delete');
    expect(botTitle(false, false)).toBe('admin-only');

    expect(actionTooltipTitle(true, 'Delete Roles', 'no-permission')).toBe('Delete Roles');
    expect(actionTooltipTitle(false, 'Delete Roles', 'no-permission')).toBe('no-permission');
  });

  it('builds the description column with overrides winning, like official ...args', () => {
    expect(descriptionColumnDef('Description')).toEqual([
      { title: 'Description', dataIndex: 'description', key: 'description' },
    ]);
    expect(descriptionColumnDef('Description', { width: 300 })).toEqual([
      { title: 'Description', dataIndex: 'description', key: 'description', width: 300 },
    ]);
  });

  it('builds the name column at width 200 with caller overrides', () => {
    expect(entityNameColumnDef('Name')).toEqual([
      { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    ]);
    expect(entityNameColumnDef('Name', { dataIndex: 'displayName', key: 'displayName' })).toEqual([
      { title: 'Name', dataIndex: 'displayName', key: 'displayName', width: 200 },
    ]);
  });

  it('builds reference-list columns keyed by the reference field at width 250', () => {
    expect(referenceListColumnDef('Policies', 'policies')).toEqual([
      { title: 'Policies', dataIndex: 'policies', key: 'policies', width: 250 },
    ]);
  });
});
