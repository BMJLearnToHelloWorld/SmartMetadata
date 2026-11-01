/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TestSuiteDetailView from './TestSuiteDetailView.vue';

const getTestSuite = vi.fn();

vi.mock('@/api/testSuites', () => ({
  getTestSuite: (...args: unknown[]) => getTestSuite(...args),
  updateTestSuite: vi.fn(),
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: TestSuiteDetailView, props: true },
      { path: '/quality/test-cases', name: 'quality-test-cases', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-suite', params: { id: 'ts1' } });
  await router.isReady();
  const wrapper = mount(TestSuiteDetailView, {
    props: { id: 'ts1' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('TestSuiteDetailView pipeline residual', () => {
  beforeEach(() => {
    getTestSuite.mockReset();
    getTestSuite.mockResolvedValue({
      id: 'ts1',
      name: 'orders_suite',
      fullyQualifiedName: 'svc.db.schema.orders.orders_suite',
      basic: true,
      tests: [],
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders overview and tests tabs plus an honest empty pipeline tab', async () => {
    const wrapper = await mountView();
    // Ant Tabs does not forward TabPane testids to the DOM; the force-rendered
    // slot contents are the observable surface.
    expect(wrapper.text()).toContain('orders_suite');
    expect(wrapper.find('[data-testid="test-suite-pipeline-residual"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pipeline');
  });
});
