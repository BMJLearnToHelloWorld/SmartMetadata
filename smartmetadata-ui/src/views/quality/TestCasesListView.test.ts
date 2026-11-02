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
import TestCasesListView from './TestCasesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quality/test-cases', name: 'quality-test-cases', component: TestCasesListView },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>tc</div>' } },
    ],
  });
  await router.push('/quality/test-cases');
  await router.isReady();
  const wrapper = mount(TestCasesListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestCasesListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({
            data: [
              {
                id: 'tc1',
                name: 'row_count',
                entityFQN: 'svc.db.schema.orders',
                testCaseResult: { testCaseStatus: 'Success' },
              },
            ],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({ data: [] });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders test cases and latest status from GET /v1/dataQuality/testCases', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('row_count');
    expect(wrapper.text()).toContain('Success');
    expect(wrapper.find('[data-testid="entity-list-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-cases-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-test-case"]').exists()).toBe(true);
  });

  it('opens test case detail on name click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="test-case-row-tc1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quality-test-case');
  });

  it('exposes status and search filters', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="test-cases-status-filter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="entity-list-search"]').exists()).toBe(true);
  });
});

describe('TestCasesListView definition-driven parameters (Fix5)', () => {
  let postedBody: Record<string, unknown> | null = null;

  beforeEach(() => {
    localStorage.clear();
    postedBody = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.includes('/api/v1/dataQuality/testCases')) {
          postedBody = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
          return jsonResponse({ id: 'tc2', name: 'col_range', testDefinition: 'tableColumnValueLengthsToBeBetween' });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({
            data: [
              {
                id: 'td1',
                name: 'tableColumnValueLengthsToBeBetween',
                fullyQualifiedName: 'tableColumnValueLengthsToBeBetween',
                parameterDefinition: [
                  { name: 'minValue', displayName: 'Min value', required: true },
                  { name: 'maxValue', displayName: 'Max value' },
                ],
              },
              {
                id: 'td2',
                name: 'tableRowCountToBeBetween',
                fullyQualifiedName: 'tableRowCountToBeBetween',
                parameterDefinition: [
                  { name: 'minCount', displayName: 'Min count', required: true },
                  { name: 'maxCount', displayName: 'Max count' },
                ],
              },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  async function openCreateAndSelectDefinition(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
    await wrapper.get('[data-testid="create-test-case"]').trigger('click');
    await flushPromises();
    // The create FormModal renders into document.body (Ant portal), so the
    // definition select lives outside the wrapper tree.
    const definitionSelect = document.body.querySelector(
      '[data-testid="create-test-case-definition"]',
    ) as HTMLElement | null;
    expect(definitionSelect).not.toBeNull();
    // Ant Select listens on its inner selector, not the root element.
    const selector = definitionSelect?.querySelector('.ant-select-selector') as HTMLElement | null;
    expect(selector).not.toBeNull();
    selector?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const option = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((el) =>
      el.textContent?.includes('tableColumnValueLengthsToBeBetween'),
    ) as HTMLElement | undefined;
    expect(option).toBeDefined();
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
  }

  function setDomInput(testid: string, value: string): void {
    const input = document.body.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    if (input) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  it('renders one input per declared parameter and posts their values', async () => {
    const { wrapper } = await mountView();
    await openCreateAndSelectDefinition(wrapper);
    expect(document.body.querySelector('[data-testid="create-test-case-param-minValue"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="create-test-case-param-maxValue"]')).not.toBeNull();
    // Free-text fallback must not render once parameters are declared.
    expect(wrapper.text()).not.toContain('minValue=1');
    setDomInput('create-test-case-name', 'col_range');
    setDomInput('create-test-case-fqn', 'svc.db.schema.orders');
    setDomInput('create-test-case-param-minValue', '1');
    setDomInput('create-test-case-param-maxValue', '100');
    await flushPromises();
    const okButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    );
    expect(okButton).toBeDefined();
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(postedBody?.parameterValues).toEqual([
      { name: 'minValue', value: '1' },
      { name: 'maxValue', value: '100' },
    ]);
  });

  it('clears the previous definition values when switching definitions', async () => {
    const { wrapper } = await mountView();
    await openCreateAndSelectDefinition(wrapper);
    setDomInput('create-test-case-param-minValue', '1');
    await flushPromises();
    // Switch to the second definition, whose parameters have different names.
    const definitionSelect = document.body.querySelector(
      '[data-testid="create-test-case-definition"]',
    ) as HTMLElement | null;
    const selector = definitionSelect?.querySelector('.ant-select-selector') as HTMLElement | null;
    selector?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const option = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find((el) =>
      el.textContent?.includes('tableRowCountToBeBetween'),
    ) as HTMLElement | undefined;
    expect(option).toBeDefined();
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="create-test-case-param-minValue"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="create-test-case-param-minCount"]')).not.toBeNull();
    setDomInput('create-test-case-name', 'row_range');
    setDomInput('create-test-case-fqn', 'svc.db.schema.orders');
    setDomInput('create-test-case-param-minCount', '5');
    await flushPromises();
    const okButton = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create'),
    );
    okButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(postedBody?.parameterValues).toEqual([{ name: 'minCount', value: '5' }]);
  });
});
