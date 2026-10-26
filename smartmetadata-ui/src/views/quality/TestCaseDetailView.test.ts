/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TestCaseDetailView from './TestCaseDetailView.vue';

const getTestCase = vi.fn();
const listTestCaseResults = vi.fn();

vi.mock('@/api/testCases', () => ({
  getTestCase: (...args: unknown[]) => getTestCase(...args),
  updateTestCase: vi.fn(),
}));
vi.mock('@/api/testCaseResults', () => ({
  listTestCaseResults: (...args: unknown[]) => listTestCaseResults(...args),
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: TestCaseDetailView, props: true },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-case', params: { id: 'tc1' } });
  await router.isReady();
  const wrapper = mount(TestCaseDetailView, {
    props: { id: 'tc1' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('TestCaseDetailView results chart', () => {
  beforeEach(() => {
    getTestCase.mockReset();
    listTestCaseResults.mockReset();
    getTestCase.mockResolvedValue({
      id: 'tc1',
      name: 'row_count',
      fullyQualifiedName: 'svc.db.schema.orders.row_count',
      parameterValues: [],
      testSuites: [],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('plots stored results and stays empty when the API has none', async () => {
    listTestCaseResults.mockResolvedValue({
      data: [
        { testCaseStatus: 'Success', timestamp: Date.UTC(2026, 0, 1) },
        { testCaseStatus: 'Failed', timestamp: Date.UTC(2026, 0, 2) },
      ],
    });
    const withPoints = await mountView();
    expect(withPoints.find('[data-testid="test-case-results-chart"]').attributes('data-points')).toBe('1');
    withPoints.unmount();

    listTestCaseResults.mockResolvedValue({ data: [] });
    const empty = await mountView();
    expect(empty.find('[data-testid="test-case-results-chart"]').attributes('data-points')).toBe('0');
    expect(empty.text()).toContain('No data');
  });
});
