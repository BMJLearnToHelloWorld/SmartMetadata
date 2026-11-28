/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { getTestCaseExportFilters } from './testCaseExport.utils';

describe('testCaseExport.utils', () => {
  it('drops paging-only params and empty values like official getTestCaseExportFilters', () => {
    expect(
      getTestCaseExportFilters({
        q: 'orders',
        testCaseStatus: 'Failed',
        testCaseType: 'table',
        limit: 25,
        offset: 50,
        include: 'non-deleted',
        sortField: 'name',
      }),
    ).toEqual({
      q: 'orders',
      testCaseStatus: 'Failed',
      testCaseType: 'table',
    });
  });
});