/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeTestDefinitionListQuery,
  parseTestDefinitionListQuery,
} from '@/quality/testDefinitionListUrl';

describe('parseTestDefinitionListQuery', () => {
  it('defaults unknown sortField to displayName', () => {
    const parsed = parseTestDefinitionListQuery({ sortField: 'not-a-column' });
    expect(parsed.sortField).toBe('displayName');
    expect(parsed.sortOrder).toBe('asc');
  });

  it('reads official quick filters and takes the first testPlatforms token', () => {
    const parsed = parseTestDefinitionListQuery({
      entityType: 'TABLE',
      testPlatforms: 'OpenMetadata,dbt',
      q: 'row',
      sortField: 'entityType',
      sortOrder: 'desc',
    });
    expect(parsed.entityType).toBe('TABLE');
    expect(parsed.testPlatform).toBe('OpenMetadata');
    expect(parsed.q).toBe('row');
    expect(parsed.sortField).toBe('entityType');
    expect(parsed.sortOrder).toBe('desc');
  });
});

describe('mergeTestDefinitionListQuery', () => {
  it('resets paging params when filters change', () => {
    const merged = mergeTestDefinitionListQuery(
      { entityType: 'TABLE', currentPage: '3', cursorValue: 'abc' },
      { entityType: 'COLUMN' },
    );
    expect(merged.entityType).toBe('COLUMN');
    expect(merged.currentPage).toBeUndefined();
    expect(merged.cursorValue).toBeUndefined();
  });
});