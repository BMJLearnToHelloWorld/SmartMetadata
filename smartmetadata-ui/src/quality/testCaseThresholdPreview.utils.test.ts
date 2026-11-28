/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import {
  ThresholdSamplingKind,
  ThresholdTestSemantic,
  ThresholdUnit,
  getThresholdPreviewData,
  getThresholdPreviewTarget,
  getThresholdSampling,
} from '@/quality/testCaseThreshold.utils';
import { formatThresholdSentence } from '@/quality/testCaseThresholdSentence.utils';
import type { TestDefinition } from '@/types/quality';

function definitionOf(name: string): TestDefinition {
  return {
    name,
    parameterDefinition: [
      { name: 'threshold' },
      { name: 'thresholdUnit', optionValues: ['ABSOLUTE', 'PERCENTAGE'] },
    ],
  };
}

describe('threshold preview', () => {
  const { t } = createTestI18n().global;

  it('names column vs table preview targets', () => {
    expect(
      getThresholdPreviewTarget({
        isColumnLevel: true,
        columnName: 'email',
        tableName: 'customers',
      }),
    ).toBe('email');
    expect(
      getThresholdPreviewTarget({
        isColumnLevel: false,
        tableName: 'customers',
        tableFqn: 'svc.db.schema.customers',
      }),
    ).toBe('customers');
  });

  it('reads profiler sampling config', () => {
    expect(
      getThresholdSampling({
        profileSampleConfig: {
          config: { profileSample: 10, profileSampleType: 'PERCENTAGE' },
        },
      }),
    ).toEqual({ kind: ThresholdSamplingKind.StaticPercentage, value: 10 });
  });

  it('builds row-countable preview sentence', () => {
    const data = getThresholdPreviewData({
      definition: definitionOf('columnValuesToBeNotNull'),
      params: { threshold: '1', thresholdUnit: ThresholdUnit.Percentage },
      target: 'status',
    });
    expect(data?.semantic).toBe(ThresholdTestSemantic.RowCountable);
    const sentence = formatThresholdSentence(data!, t);
    expect(sentence).toContain('status');
  });

  it('returns undefined without thresholdUnit param', () => {
    expect(
      getThresholdPreviewData({
        definition: { name: 'tableDiff', parameterDefinition: [{ name: 'threshold' }] },
        params: { threshold: 5 },
      }),
    ).toBeUndefined();
  });
});