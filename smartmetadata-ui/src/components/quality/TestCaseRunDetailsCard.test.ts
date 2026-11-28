/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official RunDetailsCard.threshold.test.tsx (Vue).
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TestCaseRunDetailsCard from './TestCaseRunDetailsCard.vue';
import type { TestCase, TestCaseResult } from '@/types/quality';

const NOT_NULL_ONE_PERCENT: TestCase = {
  id: 'tc1',
  name: 'not_null',
  fullyQualifiedName: 'svc.db.schema.users.not_null',
  parameterValues: [
    { name: 'threshold', value: '1' },
    { name: 'thresholdUnit', value: 'PERCENTAGE' },
  ],
  testDefinition: { id: 'def', name: 'columnValuesToBeNotNull' },
};

const rowRun = (
  testCaseStatus: string,
  failedRows: number,
  passedRows: number,
): TestCaseResult => ({
  timestamp: 1_786_001_601_000,
  testCaseStatus,
  testResultValue: [{ name: 'nullCount', value: String(failedRows) }],
  passedRows,
  failedRows,
  failedRowsPercentage: Math.round((failedRows / (failedRows + passedRows)) * 10000) / 100,
});

function mountCard(result: TestCaseResult) {
  return mount(TestCaseRunDetailsCard, {
    props: {
      testCase: NOT_NULL_ONE_PERCENT,
      results: [result],
      selectedRun: result,
    },
    global: { plugins: [createTestI18n()] },
  });
}

describe('TestCaseRunDetailsCard threshold and scope', () => {
  it('sets a failing run beside the threshold it exceeded', () => {
    const wrapper = mountCard(rowRun('Failed', 120, 9861));
    expect(wrapper.find('[data-testid="run-details-failed"]').text()).toContain('1.20%');
    expect(wrapper.find('[data-testid="run-details-failed"]').text()).toContain('120');
    expect(wrapper.find('[data-testid="run-details-threshold"]').text()).toContain('1%');
    expect(wrapper.find('[data-testid="run-details-evaluated"]').text()).toContain('9,981');
    wrapper.unmount();
  });

  it('badges a sampled, partitioned run and shows the sample note', () => {
    const wrapper = mountCard({
      ...rowRun('Failed', 120, 9861),
      evaluationScope: {
        sampled: true,
        profileSample: 10,
        profileSampleType: 'PERCENTAGE',
        partitioned: true,
        partitionColumnName: 'event_date',
      },
    });
    expect(wrapper.find('[data-testid="run-details-sampled-badge"]').text()).toContain('10%');
    expect(wrapper.find('[data-testid="run-details-partitioned-badge"]').text()).toContain('event_date');
    expect(wrapper.find('[data-testid="run-details-sample-note"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows duration with timeout wording', () => {
    const wrapper = mountCard({
      ...rowRun('Aborted', 0, 0),
      duration: 30_000,
      errorDetails: { errorType: 'QueryCanceled', message: 'statement timeout' },
    });
    expect(wrapper.find('[data-testid="run-details-duration"]').text()).toMatch(/timeout/i);
    wrapper.unmount();
  });
});