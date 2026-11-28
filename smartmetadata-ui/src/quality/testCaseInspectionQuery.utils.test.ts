/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import type { ChangeDescription } from '@/api/entities';
import {
  getInspectionQueryChangeStatus,
  getInspectionQueryVersionDiff,
} from './testCaseInspectionQuery.utils';

describe('getInspectionQueryChangeStatus', () => {
  it('matches official getChangedEntityStatus cases', () => {
    expect(getInspectionQueryChangeStatus('a', 'a')).toBe('NORMAL');
    expect(getInspectionQueryChangeStatus('a', 'b')).toBe('UPDATED');
    expect(getInspectionQueryChangeStatus('a', '')).toBe('DELETED');
    expect(getInspectionQueryChangeStatus('', 'b')).toBe('ADDED');
  });
});

describe('getInspectionQueryVersionDiff', () => {
  it('falls back to inspectionQuery when changeDescription has no diff', () => {
    const result = getInspectionQueryVersionDiff(undefined, 'SELECT 1');
    expect(result.type).toBe('plain');
    if (result.type === 'plain') {
      expect(result.text).toBe('SELECT 1');
    }
  });

  it('word-diffs inspectionQuery field updates', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'inspectionQuery',
          oldValue: 'SELECT 1',
          newValue: 'SELECT 2',
        },
      ],
    };
    const result = getInspectionQueryVersionDiff(change, 'SELECT 2');
    expect(result.type).toBe('diff');
  });
});