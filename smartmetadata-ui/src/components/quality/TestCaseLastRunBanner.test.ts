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
          testCaseResult: { testCaseStatus: 'Success', result: 'Found 10 rows', timestamp: Date.UTC(2026, 0, 1) },
        }),
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.find('[data-testid="test-case-last-run-banner-success"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-last-run-summary"]').exists()).toBe(true);
  });
});