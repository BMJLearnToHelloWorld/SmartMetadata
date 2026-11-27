/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import TestDefinitionsListView from './TestDefinitionsListView.vue';

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
      { path: '/quality/test-definitions', name: 'quality-test-definitions', component: TestDefinitionsListView },
      { path: '/quality/test-definitions/:id', name: 'quality-test-definition', component: { template: '<div>td</div>' } },
    ],
  });
  await router.push('/quality/test-definitions');
  await router.isReady();
  const wrapper = mount(TestDefinitionsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n('zh-CN')] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('TestDefinitionsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testDefinitions')) {
          return jsonResponse({
            data: [
              {
                id: 'td1',
                name: 'tableRowCountToBeBetween',
                displayName: 'Row count between',
                description: 'Row count test',
                entityType: 'TABLE',
                testPlatforms: ['OpenMetadata'],
                enabled: true,
                provider: 'system',
              },
              {
                id: 'td2',
                name: 'customRule',
                displayName: 'Custom rule',
                entityType: 'COLUMN',
                testPlatforms: ['dbt'],
                enabled: true,
                provider: 'user',
              },
            ],
            paging: { total: 16, after: 'c1' },
          });
        }
        if (url.includes('/api/v1/dataQuality/dimensions')) {
          return jsonResponse({ data: [{ id: 'd1', name: 'Accuracy', displayName: 'Accuracy' }], paging: { total: 1 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders official list chrome: heading, subtitle, CTA, columns, and filters', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('数据质量规则');
    expect(wrapper.text()).toContain('管理和配置数据质量规则的测试定义。');
    expect(wrapper.get('[data-testid="create-test-definition"]').text()).toContain('添加测试定义');
    expect(wrapper.find('[data-testid="test-library-filter-entity"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-library-filter-platform"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Row count between');
    expect(wrapper.text()).toContain('OpenMetadata');
    expect(wrapper.text()).not.toContain('IQVIA');
    expect(wrapper.find('[data-testid="enable-switch-tableRowCountToBeBetween"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-library-pagination"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-library-page-indicator"]').text()).toContain('页面');
  });

  it('disables the enabled toggle for external platforms and delete for system rows', async () => {
    const { wrapper } = await mountView();
    const systemToggle = wrapper.get('[data-testid="enable-switch-tableRowCountToBeBetween"]');
    const externalToggle = wrapper.get('[data-testid="enable-switch-customRule"]');
    expect(systemToggle.attributes('disabled') !== undefined || systemToggle.classes().join(' ').includes('disabled') || (systemToggle.element as HTMLInputElement).disabled === false).toBe(true);
    // external (dbt only) is disabled
    expect(externalToggle.html()).toMatch(/disabled|ant-switch-disabled/);
    expect(wrapper.get('[data-testid="delete-test-definition-tableRowCountToBeBetween"]').attributes('disabled') !== undefined || wrapper.get('[data-testid="delete-test-definition-tableRowCountToBeBetween"]').html().includes('disabled')).toBe(true);
  });

  it('opens the official add-definition drawer with the English help panel', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="create-test-definition"]').trigger('click');
    await flushPromises();
    const body = document.body;
    expect(body.querySelector('[data-testid="test-definition-form-drawer"]')).not.toBeNull();
    expect(body.querySelector('[data-testid="test-definition-form-body"]')).not.toBeNull();
    expect(body.querySelector('[data-testid="test-definition-help-panel"]')?.textContent).toContain('Test Definition');
    expect(body.querySelector('[data-testid="test-definition-help-panel"]')?.textContent).toContain('OpenMetadata');
    expect(body.querySelector('[data-testid="test-definition-help-panel"]')?.textContent).not.toContain('IQVIA');
    expect(body.querySelector('[data-testid="data-quality-dimension"]')).not.toBeNull();
    expect(body.querySelector('[data-testid="add-parameter-button"]')).not.toBeNull();
    expect(body.querySelector('[data-testid="test-definition-save"]')).not.toBeNull();
  });
});
