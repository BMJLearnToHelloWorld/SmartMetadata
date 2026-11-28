/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TestCaseDimensionsView from './TestCaseDimensionsView.vue';

vi.mock('@/api/testCases', () => ({
  getTestCaseByName: vi.fn(async () => ({
    id: 'tc1',
    name: 'col_test',
    fullyQualifiedName: 'svc.db.schema.orders.col_test',
    dimensionColumns: ['region', 'country'],
  })),
  listTestCaseDimensionResults: vi.fn(async () => ({ data: [], paging: { total: 0 } })),
}));

describe('TestCaseDimensionsView', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders official dimension-key for the route param', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/test-case/:fqn/dimensions/:dimensionKey', component: TestCaseDimensionsView, props: true }],
    });
    await router.push('/test-case/svc.db.schema.orders.col_test/dimensions/region');
    await router.isReady();
    const wrapper = mount(TestCaseDimensionsView, {
      global: { plugins: [router, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="dimension-key"]').text()).toBe('region');
    wrapper.unmount();
  });
});