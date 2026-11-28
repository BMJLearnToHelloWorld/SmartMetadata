/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { createTestI18n } from '@/test/i18n';
import TestSuiteDetailView from './TestSuiteDetailView.vue';

vi.mock('@/composables/useEntityPermissions', () => ({
  useEntityPermissions: () => ({
    permissions: computed(() => ({ Delete: true, EditDisplayName: true, EditAll: true })),
    isLoading: computed(() => false),
    canDelete: computed(() => true),
    canEditDisplayName: computed(() => true),
    canEditAll: computed(() => true),
  }),
}));

const getTestSuite = vi.fn();

vi.mock('@/api/testSuites', () => ({
  getTestSuite: (...args: unknown[]) => getTestSuite(...args),
  updateTestSuite: vi.fn(),
}));

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: TestSuiteDetailView, props: true },
      { path: '/test-suites/:fqn/add-ingestion', name: 'quality-test-suite-add-ingestion', component: { template: '<div />' } },
      { path: '/test-suites/:fqn/edit-ingestion/:ingestionFqn', name: 'quality-test-suite-edit-ingestion', component: { template: '<div />' } },
      { path: '/data-quality/:tab/:subTab?', name: 'quality-data-quality-tab', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'quality-test-suite', params: { id: 'ts1' } });
  await router.isReady();
  const wrapper = mount(TestSuiteDetailView, {
    props: { id: 'ts1' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('TestSuiteDetailView pipeline tab (A15: wired, no longer residual)', () => {
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

  it('renders official test-cases and pipeline tabs with an add-ingestion entry', async () => {
    const wrapper = await mountView();
    // Ant Tabs does not forward TabPane testids to the DOM; the force-rendered
    // slot contents are the observable surface.
    expect(wrapper.text()).toContain('orders_suite');
    expect(wrapper.find('[data-testid="test-suite-pipeline-residual"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-test-suite-ingestion"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pipeline');
  });

  it('navigates add-ingestion to the official /test-suites/:fqn/add-ingestion page', async () => {
    const wrapper = await mountView();
    const router = wrapper.vm.$router;
    await wrapper.find('[data-testid="add-test-suite-ingestion"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(
      '/test-suites/svc.db.schema.orders.orders_suite/add-ingestion',
    );
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    wrapper.unmount();
  });
});
