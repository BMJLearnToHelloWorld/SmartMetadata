/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { TestCase } from '@/types/quality';
import TestCaseLastRunBanner from './TestCaseLastRunBanner.vue';

function baseCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc1',
    name: 'row_count',
    fullyQualifiedName: 'svc.db.schema.orders.row_count',
    parameterValues: [],
    testSuites: [],
    ...overrides,
  };
}

describe('TestCaseLastRunBanner (official test ids)', () => {
  it('uses test-case-last-run-banner-not-run-yet when there is no last run', () => {
    const wrapper = mount(TestCaseLastRunBanner, {
      props: { testCase: baseCase() },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="test-case-last-run-banner-not-run-yet"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-next-run"]').exists()).toBe(true);
  });

  it('uses the success banner test id when the case status is Success', () => {
    const wrapper = mount(TestCaseLastRunBanner, {
      props: {
        testCase: baseCase({
          testCaseStatus: 'Success',
          testCaseResult: {
            testCaseStatus: 'Success',
            result: 'Found 10 rows',
            timestamp: Date.UTC(2026, 0, 1),
            testResultValue: [{ name: 'value', value: '10' }],
          },
          parameterValues: [{ name: 'value', value: '10' }],
          testDefinition: { name: 'tableRowCountToEqual' },
        }),
        nextRunTimestamp: Date.now() + 3600_000,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="test-case-last-run-banner-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-last-run-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-last-run-right-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-result-expected"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-last-run-time"]').exists()).toBe(true);
  });

  it('renders incident footer for failed runs with a task link', () => {
    const wrapper = mount(TestCaseLastRunBanner, {
      props: {
        testCase: baseCase({
          entityLink: '<#E::table::svc.db.schema.orders>',
          testCaseStatus: 'Failed',
          testCaseResult: { testCaseStatus: 'Failed', result: 'Failed check', timestamp: Date.UTC(2026, 0, 2) },
          testDefinition: { name: 'tableRowCountToEqual', displayName: 'Row count' },
        }),
        taskLinkInfo: { path: '/test-case/svc.db.schema.orders.row_count/issues', label: '#12' },
        testCaseStatusData: { id: 'inc-1', testCaseResolutionStatusType: 'New' },
        incidentTaskLoaded: true,
        hasEditStatusPermission: true,
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="test-case-last-run-incident"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="acknowledge-incident-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="view-incident-button"]').exists()).toBe(true);
  });
});