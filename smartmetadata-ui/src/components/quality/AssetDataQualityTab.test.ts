import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssetDataQualityTab from '@/components/quality/AssetDataQualityTab.vue';
import { createTestI18n } from '@/test/i18n';
import { usePermissionStore } from '@/stores/permissions';

vi.mock('@/utils/codeMirrorUtils', () => ({
  CSMode: { SQL: 'sql' },
}));

vi.mock('@/components/shared/SmCodeEditor.vue', () => ({
  default: {
    props: ['value', 'variant', 'mode', 'showCopyButton', 'className'],
    emits: ['change'],
    template: '<textarea data-testid="sql-editor-stub" :value="value" @input="$emit(\'change\', $event.target.value)" />',
  },
}));

vi.mock('@/features/crud/ProfilerSettingsModal.vue', () => ({
  default: {
    props: ['open', 'tableId', 'columns'],
    template: '<div v-if="open" data-testid="profiler-settings-modal-stub" />',
  },
}));

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
      { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div />' } },
      { path: '/bulk/import/:entityType/:fqn', name: 'bulk-import', component: { template: '<div />' } },
      { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(AssetDataQualityTab, {
    props: { entityFqn: 'svc.db.schema.orders', testSuiteFqn: 'suite.orders', testSuiteId: 'suite-id', tableId: 'tbl-1', columns: [{ name: 'id', dataType: 'INT' }] },
    global: { plugins: [pinia, router, Antd, createTestI18n('zh-CN')] },
    attachTo: document.body,
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
        if (url.includes('/api/v1/dataQuality/testSuites/dataQualityReport')) {
          return jsonResponse({
            metadata: { keys: [], dimensions: ['entityFQN', 'testCaseResult.testCaseStatus'], metrics: ['document_count'] },
            data: [
              { document_count: '1', entityFQN: 'svc.db.schema.orders', 'testCaseResult.testCaseStatus': 'success' },
              { document_count: '1', entityFQN: 'svc.db.schema.orders', 'testCaseResult.testCaseStatus': 'failed' },
            ],
          });
        }
        if (url.includes('/api/v1/dataQuality/testCases/search')) {
          return jsonResponse({
            data: [
              { id: 'tc1', name: 'row_count', testCaseResult: { testCaseStatus: 'Failed' } },
              { id: 'tc2', name: 'ok', testCaseResult: { testCaseStatus: 'Success' } },
              { id: 'tc3', name: 'extra', testCaseResult: { testCaseStatus: 'Aborted' } },
            ],
            paging: { total: 3 },
          });
        }
        if (url.includes('/api/v1/dataQuality/testCases')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/services/ingestionPipelines')) {
          expect(url).toContain('testSuite=');
          expect(url).toContain('pipelineType=TestSuite');
          expect(url).toContain('fields=');
          return jsonResponse({
            data: [
              {
                id: 'p1',
                name: 'orders-dq',
                displayName: 'orders-dq',
                pipelineType: 'TestSuite',
                enabled: true,
                airflowConfig: { scheduleInterval: '0 * * * *' },
                pipelineStatuses: [{ runId: 'r1', timestamp: 1, status: [{ records: 2, errors: 0, warnings: 0 }] }],
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.querySelectorAll('.ant-drawer, .ant-dropdown, .ant-message').forEach((node) => node.remove());
  });

  it('renders official summary cards and 数据质控 / 事件 tabs', async () => {
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="asset-data-quality-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="asset-dq-total"]').text()).toContain('2');
    expect(wrapper.find('[data-testid="asset-dq-success"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="asset-dq-failed"]').text()).toContain('1');
    expect(wrapper.find('[data-testid="asset-dq-incidents-tab"]').exists()).toBe(true);
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/v1/dataQuality/testSuites/dataQualityReport'))).toBe(true);
    wrapper.unmount();
  });

  it('leaves official summary cards empty when the asset has no testSuite.id', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div />' } },
        { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(AssetDataQualityTab, {
      props: { entityFqn: 'svc.db.schema.orders' },
      global: { plugins: [pinia, router, Antd, createTestI18n('zh-CN')] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-dq-total"]').text()).toContain('0');
    expect(wrapper.find('[data-testid="asset-dq-success"]').text()).toContain('0');
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/v1/dataQuality/testSuites/dataQualityReport'))).toBe(false);
    wrapper.unmount();
  });

  it('exposes the official 添加 dropdown with 测试用例 and 自定义指标', async () => {
    const wrapper = await mountTab();
    const add = wrapper.find('[data-testid="asset-dq-add"]');
    expect(add.exists()).toBe(true);
    expect(add.text()).toContain('添加');
    await add.trigger('click');
    await flushPromises();
    const testCaseItem = document.body.querySelector('[data-testid="asset-dq-add-test-case"]');
    const metricItem = document.body.querySelector('[data-testid="asset-dq-add-custom-metric"]');
    expect(testCaseItem?.textContent).toContain('测试用例');
    expect(metricItem?.textContent).toContain('自定义指标');
    wrapper.unmount();
  });

  it('lists TestSuite workflows with official columns, test-case tooltip, and 添加管道', async () => {
    const wrapper = await mountTab();
    const workflowsTab = wrapper.find('[data-testid="asset-dq-workflows-tab"]');
    expect(workflowsTab.exists()).toBe(true);
    await workflowsTab.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-dq-workflows"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('orders-dq');
    expect(wrapper.find('[data-testid="test-cases-info-tooltip-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="test-case-count-orders-dq"]').text()).toContain('全部');
    expect(wrapper.find('[data-testid="add-pipeline-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-pipeline-button"]').text()).toContain('添加管道');
    expect(wrapper.find('[data-testid="asset-dq-workflow-actions"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens the official table-level custom metric form from 添加 自定义指标', async () => {
    const wrapper = await mountTab();
    await wrapper.get('[data-testid="asset-dq-add"]').trigger('click');
    await flushPromises();
    const metricItem = document.body.querySelector('[data-testid="asset-dq-add-custom-metric"]') as HTMLElement | null;
    expect(metricItem).not.toBeNull();
    const item = (metricItem?.closest('.ant-dropdown-menu-item') as HTMLElement | null) ?? metricItem;
    item?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector('[data-testid="custom-metric-form"]')).not.toBeNull();
    expect(document.body.textContent).toContain('添加数据表指标');
    wrapper.unmount();
  });

  it('shows the official profiler settings gear on the quality header', async () => {
    const wrapper = await mountTab();
    const gear = wrapper.find('[data-testid="profiler-setting-btn"]');
    expect(gear.exists()).toBe(true);
    await gear.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profiler-settings-modal-stub"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the official gear and custom-metric item when the asset is deleted', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div />' } },
        { path: '/ingestion/pipelines/:id', name: 'ingestion-pipeline', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(AssetDataQualityTab, {
      props: { entityFqn: 'svc.db.schema.orders', tableId: 'tbl-1', deleted: true },
      global: { plugins: [pinia, router, Antd, createTestI18n('zh-CN')] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="profiler-setting-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="asset-dq-add"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the official ViewTests PermissionPlaceholder only after permissions are loaded and ViewTests is false', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();
    const unknown = mount(AssetDataQualityTab, {
      props: { entityFqn: 'svc.db.schema.orders', permissionsLoaded: false, viewTests: false, showIncidents: false },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(unknown.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
    expect(unknown.find('[data-testid="asset-dq-test-cases"]').exists()).toBe(true);
    unknown.unmount();

    const denied = mount(AssetDataQualityTab, {
      props: { entityFqn: 'svc.db.schema.orders', permissionsLoaded: true, viewTests: false, showIncidents: false },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(denied.get('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(denied.text()).toMatch(/View Data Observability|Data Observability/);
    expect(denied.find('[data-testid="manage-button"]').exists()).toBe(false);
    denied.unmount();
  });

  it('shows official QualityTab ManageButton import/export/bulk-edit on the embedded path and hides the list ⋯ menu', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/bulk/import/:entityType/:fqn', name: 'bulk-import', component: { template: '<div />' } },
        { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const store = usePermissionStore();
    vi.spyOn(store, 'getResourcePermission').mockResolvedValue({
      ViewAll: true,
      EditAll: true,
    } as never);
    const wrapper = mount(AssetDataQualityTab, {
      props: {
        entityFqn: 'svc.db.schema.orders',
        testSuiteFqn: 'suite.orders',
        tableId: 'tbl-1',
        showIncidents: false,
        permissionsLoaded: true,
        viewTests: true,
      },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="asset-dq-add"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profiler-setting-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="test-cases-manage"]').exists()).toBe(false);
    const manage = wrapper.get('[data-testid="manage-button"]');
    expect(manage.attributes('title')).toBe('Manage Test Cases');
    await manage.trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="import-button"]')?.textContent).toMatch(/Import/);
    expect(document.body.querySelector('[data-testid="export-button"]')?.textContent).toMatch(/Export/);
    expect(document.body.querySelector('[data-testid="bulk-edit-button"]')?.textContent).toMatch(/Bulk Edit/);
    (document.body.querySelector('[data-testid="import-button"]') as HTMLElement | null)?.click();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/bulk/import/testCase/svc.db.schema.orders');
    expect(router.currentRoute.value.query.sourceEntityType).toBe('table');
    wrapper.unmount();
  });

  it('hides the official QualityTab ManageButton when the table is deleted', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    });
    await router.push('/');
    await router.isReady();
    const store = usePermissionStore();
    vi.spyOn(store, 'getResourcePermission').mockResolvedValue({
      ViewAll: true,
      EditAll: true,
    } as never);
    const wrapper = mount(AssetDataQualityTab, {
      props: {
        entityFqn: 'svc.db.schema.orders',
        deleted: true,
        showIncidents: false,
        permissionsLoaded: true,
        viewTests: true,
      },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="manage-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uses official QualityTab inner tab labels and TabsLabel count badges from list paging', async () => {
    const wrapper = await mountTab();
    const testCasesTab = wrapper.get('[data-testid="test-cases"]');
    expect(testCasesTab.text()).toContain('测试用例');
    expect(testCasesTab.get('[data-testid="count"]').text()).toBe('3');
    const pipelineTab = wrapper.get('[data-testid="asset-dq-workflows-tab"]');
    expect(pipelineTab.get('[data-testid="pipeline"]').text()).toBe('工作流');
    expect(pipelineTab.get('[data-testid="count"]').text()).toBe('1');
    wrapper.unmount();
  });
});
