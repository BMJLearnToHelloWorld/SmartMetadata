/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { TestCase } from '@/types/quality';
import {
  getRunScopeBadges,
  getRunThresholdData,
  ThresholdNoun,
  ThresholdTestSemantic,
} from './testCaseThreshold.utils';

const testCaseOf = (
  name: string,
  parameterValues: { name: string; value: string }[],
  useDynamicAssertion?: boolean,
): TestCase =>
  ({
    name: 'test',
    fullyQualifiedName: 'svc.db.schema.users.test',
    parameterValues,
    useDynamicAssertion,
    testDefinition: { id: 'def', name },
  }) as TestCase;

describe('getRunThresholdData', () => {
  const NOT_NULL_ONE_PERCENT = testCaseOf('columnValuesToBeNotNull', [
    { name: 'threshold', value: '1' },
    { name: 'thresholdUnit', value: 'PERCENTAGE' },
  ]);

  it('sets a row-countable run beside its percentage threshold', () => {
    const data = getRunThresholdData(NOT_NULL_ONE_PERCENT, {
      testCaseStatus: 'Failed',
      passedRows: 9861,
      failedRows: 120,
      failedRowsPercentage: 1.2,
    });
    expect(data).toMatchObject({
      semantic: ThresholdTestSemantic.RowCountable,
      threshold: 1,
      isPercentage: true,
      noun: ThresholdNoun.Rows,
      failedRows: 120,
      evaluatedRows: 9981,
      populationNoun: ThresholdNoun.Rows,
    });
    expect(data?.failedPercentage).toBeCloseTo(1.2023, 4);
  });

  it('sets the configured range beside the range the run reports', () => {
    const data = getRunThresholdData(
      testCaseOf('columnValueMeanToBeBetween', [
        { name: 'minValueForMeanInCol', value: '90' },
        { name: 'maxValueForMeanInCol', value: '110' },
        { name: 'threshold', value: '5' },
        { name: 'thresholdUnit', value: 'PERCENTAGE' },
      ]),
      {
        testCaseStatus: 'Success',
        minBound: 85.5,
        maxBound: 115.50000000000001,
      },
    );
    expect(data).toEqual({
      semantic: ThresholdTestSemantic.Statistical,
      threshold: 5,
      isPercentage: true,
      noun: ThresholdNoun.Bound,
      configuredRange: '90 – 110',
      effectiveRange: '85.5 – 115.5',
    });
  });

  it('says nothing for tableCustomSQLQuery', () => {
    expect(
      getRunThresholdData(testCaseOf('tableCustomSQLQuery', []), {
        testCaseStatus: 'Failed',
      }),
    ).toBeUndefined();
  });
});

describe('getRunScopeBadges', () => {
  it('badges a sampled partitioned run', () => {
    const badges = getRunScopeBadges({
      sampled: true,
      profileSample: 10,
      profileSampleType: 'PERCENTAGE',
      partitioned: true,
      partitionColumnName: 'event_date',
    });
    expect(badges?.sample?.value).toBe(10);
    expect(badges?.isPartitioned).toBe(true);
    expect(badges?.partitionColumn).toBe('event_date');
  });

  it('has no badge for a full-table run', () => {
    expect(getRunScopeBadges({ sampled: false, partitioned: false })).toBeUndefined();
  });
});