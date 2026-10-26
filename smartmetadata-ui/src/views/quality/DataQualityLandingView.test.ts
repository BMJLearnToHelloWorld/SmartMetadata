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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataQualityLandingView from './DataQualityLandingView.vue';
import TestCasesListView from './TestCasesListView.vue';
import TestSuitesListView from './TestSuitesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(mode: 'ok' | 'quality-404' = 'ok'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/testCases/search/list') || url.includes('/testSuites/search/list')) {
        return new Response('not found', { status: 404 });
      }
      if (mode === 'quality-404') {
        return new Response('not found', { status: 404 });
      }
      if (url.includes('/api/v1/dataQuality/testCases')) {
        return jsonResponse({
          data: [
            {
              id: 'tc1',
              name: 'row_count',
              entityFQN: 'svc.db.schema.orders',
              testDefinition: { name: 'completenessCheck' },
              testCaseResult: { testCaseStatus: 'Success', timestamp: 1 },
            },
            {
              id: 'tc2',
              name: 'null_count',
              entityFQN: 'svc.db.schema.users',
              testDefinition: { name: 'completenessCheck' },
              testCaseResult: { testCaseStatus: 'Failed', timestamp: 2 },
            },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/api/v1/dataQuality/testSuites')) {
        return jsonResponse({
          data: [
            {
              id: 'ts1',
              name: 'orders_suite',
              basic: true,
              tests: [{ name: 'row_count' }],
              owners: [{ name: 'alice' }],
              summary: { success: 0, failed: 1, total: 1 },
            },
          ],
          paging: { total: 1 },
        });
      }
      if (url.includes('/api/v1/dataQuality/testDefinitions')) {
        return jsonResponse({
          data: [
            {
              id: 'd1',
              name: 'completenessCheck',
              dataQualityDimension: 'Completeness',
              testPlatforms: [],
            },
          ],
        });
      }
      if (url.includes('/api/v1/search/query')) {
        return jsonResponse({
          hits: { total: { value: 20 }, hits: [] },
          aggregations: {
            'sterms#entityType': { buckets: [{ key: 'table', doc_count: 20 }] },
            'sterms#ownerDisplayName': { buckets: [{ key: 'alice', doc_count: 3 }] },
            'sterms#tier.tagFQN': { buckets: [{ key: 'Tier.Gold', doc_count: 1 }] },
          },
        });
      }
      if (url.includes('/api/v1/glossaryTerms')) {
        return jsonResponse({ data: [] });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

async function mountLanding(path = '/quality/test-cases') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases', name: 'quality-test-cases', component: DataQualityLandingView },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
      {
        path: '/quality/test-suites',
        name: 'quality-test-suites',
        redirect: (to) => ({ name: 'quality-test-cases', query: { ...to.query, tab: 'test-suites' } }),
      },
      { path: '/quality/test-suites/:id', name: 'quality-test-suite', component: { template: '<div>ts</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(DataQualityLandingView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DataQualityLandingView', () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch('ok');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders Summary / Test Cases / Test Suites and health cards from listed APIs', async () => {
    const { wrapper } = await mountLanding();
    expect(wrapper.get('[data-testid="dq-landing-title"]').text()).toContain('Data Quality');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Summary');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Test Cases');
    expect(wrapper.get('[data-testid="dq-landing-tabs"]').text()).toContain('Test Suites');
    expect(wrapper.get('[data-testid="dq-health"]').text()).toContain('Data Health');
    expect(wrapper.get('[data-testid="dq-coverage-card"]').text()).toContain('Covered');
    expect(wrapper.get('[data-testid="dq-results-card"]').text()).toContain('Success');
    expect(wrapper.get('[data-testid="dq-dimension-Completeness"]').text()).toMatch(/Completeness/);
    expect(wrapper.get('[data-testid="dq-status-failed"]').text()).toContain('1');
    expect(wrapper.get('[data-testid="dq-residual-residualReport"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dq-residual-residualSearchList"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-filter-owner"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dq-filter-range"]').exists()).toBe(true);
  });

  it('opens Test Cases from the tab bar and rows navigate to the existing detail route', async () => {
    const { wrapper, router } = await mountLanding();
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    await tabs[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('test-cases');
    expect(wrapper.findComponent(TestCasesListView).exists()).toBe(true);
    expect(wrapper.get('[data-testid="test-cases-table"]').text()).toContain('row_count');
    await wrapper.get('[data-testid="test-case-row-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('opens Test Suites, supports table/bundle sub-tabs, and follows suite rows', async () => {
    const { wrapper, router } = await mountLanding('/quality/test-cases?tab=test-suites');
    expect(wrapper.findComponent(TestSuitesListView).exists()).toBe(true);
    expect(wrapper.get('[data-testid="test-suites-subtabs"]').text()).toContain('Table Suites');
    expect(wrapper.get('[data-testid="test-suites-table"]').text()).toContain('orders_suite');
    await wrapper.get('[data-testid="test-suite-row-ts1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-suite');
  });

  it('redirects /quality/test-suites onto the landing Test Suites tab', async () => {
    const { wrapper, router } = await mountLanding('/quality/test-suites');
    expect(router.currentRoute.value.name).toBe('quality-test-cases');
    expect(router.currentRoute.value.query.tab).toBe('test-suites');
    expect(wrapper.findComponent(TestSuitesListView).exists()).toBe(true);
  });

  it('keeps health cards empty when quality APIs 404 instead of inventing charts', async () => {
    stubFetch('quality-404');
    const { wrapper } = await mountLanding();
    expect(wrapper.find('[data-testid="dq-health-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dq-health-empty"]').text()).toMatch(/empty|Add a test|no test/i);
    expect(wrapper.find('[data-testid="dq-residual-residualCases"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('20897');
  });

  it('shows an honest residual when governance filters are used without search/list', async () => {
    const { wrapper } = await mountLanding();
    const ownerSelect = wrapper.findAllComponents({ name: 'ASelect' })[0];
    ownerSelect.vm.$emit('change', 'alice');
    await flushPromises();
    expect(wrapper.find('[data-testid="dq-landing-filter-residual"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="dq-landing-filter-residual"]').text()).toMatch(/search index|unfiltered/i);
  });
});
