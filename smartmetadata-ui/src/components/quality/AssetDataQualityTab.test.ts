import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssetDataQualityTab from '@/components/quality/AssetDataQualityTab.vue';
import { createTestI18n } from '@/test/i18n';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

async function mountTab() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(AssetDataQualityTab, {
    props: { entityFqn: 'svc.db.schema.orders', testSuiteFqn: 'suite.orders' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AssetDataQualityTab', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/dataQuality/testCases/search')) {
          return jsonResponse({
            data: [
              { id: 'tc1', name: 'row_count', testCaseResult: { testCaseStatus: 'Failed' } },
              { id: 'tc2', name: 'ok', testCaseResult: { testCaseStatus: 'Success' } },
            ],
            paging: { total: 2 },
          });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          expect(url).toContain('testSuite=');
          expect(url).toContain('pipelineType=TestSuite');
          return jsonResponse({
            data: [{ id: 'p1', name: 'orders-dq', pipelineType: 'TestSuite', airflowConfig: { scheduleInterval: '0 * * * *' } }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders official summary cards and 数据质控 / 事件 tabs', async () => {
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-dq-total"]').text()).toContain('2');
    expect(wrapper.find('[data-testid="asset-dq-success"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="asset-dq-failed"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="asset-dq-incidents-tab"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('lists TestSuite workflows when the inner 工作流 tab is opened', async () => {
    const wrapper = await mountTab();
    const workflowsTab = wrapper.find('[data-testid="asset-dq-workflows-tab"]');
    expect(workflowsTab.exists()).toBe(true);
    await workflowsTab.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-dq-workflows"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders-dq');
    wrapper.unmount();
  });
});
