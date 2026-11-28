/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { canEditTestCaseListIncident, inlineIncidentFromTestCase } from './testCaseListIncident.utils';
import type { TestCase } from '@/types/quality';

const baseCase: TestCase = {
  id: 'tc1',
  name: 'row_count',
  testSuites: [],
  parameterValues: [],
};

describe('testCaseListIncident.utils', () => {
  it('reads inlined incident objects from the list row', () => {
    const row: TestCase = {
      ...baseCase,
      incidentStatus: {
        id: 'inc1',
        testCaseResolutionStatusType: 'New',
      },
    };
    expect(inlineIncidentFromTestCase(row)?.testCaseResolutionStatusType).toBe('New');
  });

  it('gates incident edits on EditStatus like official renderIncidentCell', () => {
    const row: TestCase = { ...baseCase, deleted: false };
    expect(
      canEditTestCaseListIncident(row, {
        tc1: {
          resource: 'testCase',
          permissions: [{ operation: 'EditStatus', access: 'allow' }],
        },
      }),
    ).toBe(true);
    expect(
      canEditTestCaseListIncident(row, {
        tc1: {
          resource: 'testCase',
          permissions: [{ operation: 'EditTags', access: 'allow' }],
        },
      }),
    ).toBe(false);
    expect(canEditTestCaseListIncident({ ...baseCase, deleted: true }, {})).toBe(false);
  });
});