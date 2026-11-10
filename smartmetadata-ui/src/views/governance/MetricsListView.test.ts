/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import { createTestI18n } from '@/test/i18n';
import MetricCreateDrawer from '@/components/governance/MetricCreateDrawer.vue';
import { useBulkEditScopeStore } from '@/stores/bulkEditScope';
import MetricsListView from './MetricsListView.vue';

const getMetricHierarchy = vi.fn();
const getMetricGroupMetrics = vi.fn();
const listMetrics = vi.fn();
const getMetricSearchPaths = vi.fn();
const getMetricAncestorFqns = vi.fn();
const getMetricObservability = vi.fn();
const searchAssets = vi.fn();
const exportMetricsCsvAsync = vi.fn();
const deleteMetricAsync = vi.fn();
const getMetricParentIds = vi.fn();
const getMetricByFqn = vi.fn();
const markCsvJobOwned = vi.fn();

const permState = vi.hoisted(() => ({
  isAdmin: false,
  ops: {} as Record<string, boolean>,
  reject: false,
}));

vi.mock('@/api/metrics', () => ({
  getMetricHierarchy: (...args: unknown[]) => getMetricHierarchy(...args),
  getMetricGroupMetrics: (...args: unknown[]) => getMetricGroupMetrics(...args),
  listMetrics: (...args: unknown[]) => listMetrics(...args),
  getMetricSearchPaths: (...args: unknown[]) => getMetricSearchPaths(...args),
  getMetricAncestorFqns: (...args: unknown[]) => getMetricAncestorFqns(...args),
  getMetricObservability: (...args: unknown[]) => getMetricObservability(...args),
  exportMetricsCsvAsync: (...args: unknown[]) => exportMetricsCsvAsync(...args),
  deleteMetricAsync: (...args: unknown[]) => deleteMetricAsync(...args),
  getMetricParentIds: (...args: unknown[]) => getMetricParentIds(...args),
  getMetricByFqn: (...args: unknown[]) => getMetricByFqn(...args),
  buildMetricStatusQueryFilter: (status: string) =>
    JSON.stringify({ query: { bool: { must: [{ term: { entityStatus: status } }] } } }),
  METRIC_STATUS_VALUES: [
    'Approved',
    'Archived',
    'Deprecated',
    'Draft',
    'In Review',
    'Rejected',
    'Unprocessed',
  ],
  METRIC_TREE_FIELDS: 'owners,tags,domains,parent,childrenCount,metricGroup',
}));

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

vi.mock('@/api/csvJobs', () => ({
  markCsvJobOwned: (...args: unknown[]) => markCsvJobOwned(...args),
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    isAdminUser: permState.isAdmin,
    getResourcePermission: vi.fn(async () => {
      if (permState.reject) {
        throw new Error('permission service down');
      }
      return permState.ops;
    }),
  }),
}));

const parentMetric = {
  id: 'm1',
  name: 'mau',
  displayName: 'Monthly Active Users',
  fullyQualifiedName: 'kpi.mau',
  entityType: 'metric',
  entityStatus: 'Approved',
  metricType: 'NUMBER',
  granularity: 'MONTHLY',
  childrenCount: 2,
  owners: [],
  tags: [],
  domains: [],
};

const childMetric = {
  id: 'm2',
  name: 'mau-eu',
  fullyQualifiedName: 'kpi.mau.eu',
  entityType: 'metric',
  entityStatus: 'Approved',
  childrenCount: 0,
  owners: [],
  tags: [],
  domains: [],
};

const childMetric2 = {
  id: 'm4',
  name: 'mau-us',
  fullyQualifiedName: 'kpi.mau.us',
  entityType: 'metric',
  entityStatus: 'Approved',
  childrenCount: 0,
  owners: [],
  tags: [],
  domains: [],
};

const memberMetric = {
  id: 'm3',
  name: 'margin',
  fullyQualifiedName: 'profitability.margin',
  entityType: 'metric',
  entityStatus: 'Draft',
  childrenCount: 0,
  owners: [],
  tags: [],
  domains: [],
};

const groupItem = {
  kind: 'metricGroup',
  group: {
    id: 'g1',
    name: 'profitability',
    displayName: 'Profitability',
    fullyQualifiedName: 'profitability',
    metricCount: 2,
  },
};

function hierarchyPage(data: unknown[], total: number) {
  return { data, total, after: undefined, before: undefined };
}

async function mountView(query: Record<string, string> = {}, attach = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/governance/metrics', name: 'governance-metrics', component: MetricsListView },
      { path: '/governance/metrics/:fqn', name: 'governance-metric', component: { template: '<div>metric</div>' } },
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
      { path: '/bulk/edit/:entityType/:fqn', name: 'bulk-edit', component: { template: '<div>bulk-edit</div>' } },
      { path: '/bulk/import/:entityType/:fqn', name: 'bulk-import', component: { template: '<div>bulk-import</div>' } },
    ],
  });
  await router.push({ name: 'governance-metrics', query });
  await router.isReady();
  const wrapper = mount(MetricsListView, {
    attachTo: attach ? document.body : undefined,
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: {
        LimitWrapper: { template: '<span><slot :limit-reached="false" /></span>' },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MetricsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    permState.isAdmin = false;
    permState.reject = false;
    permState.ops = { ViewAll: true, Create: true, EditAll: true, Delete: true };
    getMetricHierarchy.mockReset();
    getMetricGroupMetrics.mockReset();
    listMetrics.mockReset();
    getMetricSearchPaths.mockReset();
    getMetricAncestorFqns.mockReset();
    getMetricObservability.mockReset();
    searchAssets.mockReset();
    exportMetricsCsvAsync.mockReset();
    deleteMetricAsync.mockReset();
    getMetricParentIds.mockReset();
    getMetricByFqn.mockReset();
    markCsvJobOwned.mockReset();
    exportMetricsCsvAsync.mockResolvedValue({ jobId: 'job-1' });
    deleteMetricAsync.mockResolvedValue(undefined);
    getMetricParentIds.mockResolvedValue(new Map());
    getMetricByFqn.mockRejectedValue(new ApiError(404, '', 'Not found'));
    getMetricHierarchy.mockResolvedValue(
      hierarchyPage([groupItem, { kind: 'metric', metric: parentMetric }], 2),
    );
    getMetricGroupMetrics.mockResolvedValue(hierarchyPage([memberMetric], 1));
    listMetrics.mockResolvedValue({ data: [childMetric], after: 'cursor-2', total: 2 });
    getMetricSearchPaths.mockResolvedValue({
      matchIds: new Set<string>(),
      ancestorIds: new Set<string>(),
      complete: true,
    });
    getMetricAncestorFqns.mockResolvedValue([]);
    getMetricObservability.mockResolvedValue({ health: 'Healthy', score: 92 });
    searchAssets.mockResolvedValue({ total: 1, hits: [parentMetric], facets: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    // Teleported overlays (Dropdown menu, Modal, Drawer) live in
    // document.body; drop them so the next test's body queries only
    // ever see its own overlay.
    document.body.innerHTML = '';
  });

  it('renders the tree by default with group banner and parent expand button', { timeout: 15000 }, async () => {
    const { wrapper } = await mountView();
    expect(getMetricHierarchy).toHaveBeenCalled();
    expect(searchAssets).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Profitability');
    expect(wrapper.text()).toContain('2 metrics');
    expect(wrapper.text()).toContain('Monthly Active Users');
    expect(wrapper.find('[data-testid="metric-row-profitability.margin"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-expand-kpi.mau"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-health-m1"]').exists()).toBe(true);
  });

  it('expands a parent and pages children with Load more', async () => {
    listMetrics.mockImplementation(async (query: { after?: string }) => {
      if (query.after === 'cursor-2') {
        return { data: [childMetric2], after: undefined, total: 2 };
      }
      return { data: [childMetric], after: 'cursor-2', total: 2 };
    });
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-expand-kpi.mau"]').trigger('click');
    await flushPromises();
    expect(listMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ parent: 'kpi.mau', limit: 50 }),
    );
    expect(wrapper.find('[data-testid="metric-row-kpi.mau.eu"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-load-more-load-more:children:m1"]').exists()).toBe(true);
    await wrapper.get('[data-testid="metric-load-more-load-more:children:m1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="metric-row-kpi.mau.us"]').exists()).toBe(true);
  });

  it('switching to a status filter loads the flat search mode with the official term value', async () => {
    const { wrapper } = await mountView();
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'In Review');
    await flushPromises();
    expect(searchAssets).toHaveBeenCalled();
    const options = searchAssets.mock.calls[0]?.[3] as { query_filter?: string };
    const filter = JSON.parse(options.query_filter ?? '') as {
      query: { bool: { must: Array<{ term: Record<string, string> }> } };
    };
    expect(filter.query.bool.must).toEqual([{ term: { entityStatus: 'In Review' } }]);
    expect(wrapper.text()).toContain('Monthly Active Users');
  });

  it('debounces search input by 500ms and sends q to the hierarchy', async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountView();
    getMetricHierarchy.mockClear();
    await wrapper.find('[data-testid="metric-search"]').setValue('mau');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(getMetricHierarchy).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'mau' }),
    );
  });

  it('shows the no-permission state and sends no list request without view access', async () => {
    permState.ops = { Create: true };
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-no-permission"]').exists()).toBe(true);
    expect(getMetricHierarchy).not.toHaveBeenCalled();
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it('fails closed on a permission fetch failure and retries', async () => {
    permState.reject = true;
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-permission-error"]').exists()).toBe(true);
    expect(getMetricHierarchy).not.toHaveBeenCalled();
    permState.reject = false;
    await wrapper.get('[data-testid="metrics-permission-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Monthly Active Users');
  });

  it('shows the three-feature intro empty state with a New metric button when creation is allowed', async () => {
    getMetricHierarchy.mockResolvedValue(hierarchyPage([], 0));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-empty-intro"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Define it');
    expect(wrapper.text()).toContain('Define the action');
    expect(wrapper.text()).toContain('Assign an owner');
    expect(wrapper.find('[data-testid="metrics-empty-new-metric"]').exists()).toBe(true);
  });

  it('hides the empty-state New metric button without Create', async () => {
    permState.ops = { ViewAll: true, EditAll: true, Delete: true };
    getMetricHierarchy.mockResolvedValue(hierarchyPage([], 0));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-empty-intro"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metrics-empty-new-metric"]').exists()).toBe(false);
  });

  it('shows the search empty state when a search finds nothing', async () => {
    vi.useFakeTimers();
    getMetricHierarchy.mockResolvedValue(hierarchyPage([], 0));
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="metric-search"]').setValue('zzz');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(wrapper.find('[data-testid="metrics-empty-search"]').exists()).toBe(true);
  });

  it('shows the filter empty state when a status finds nothing', async () => {
    searchAssets.mockResolvedValue({ total: 0, hits: [], facets: [] });
    const { wrapper } = await mountView();
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'Approved');
    await flushPromises();
    expect(wrapper.find('[data-testid="metrics-empty-filter"]').exists()).toBe(true);
  });

  it('shows an error card with a working retry when the hierarchy fails', async () => {
    getMetricHierarchy.mockRejectedValueOnce(new Error('hierarchy down'));
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-error"]').exists()).toBe(true);
    getMetricHierarchy.mockResolvedValue(
      hierarchyPage([{ kind: 'metric', metric: parentMetric }], 1),
    );
    await wrapper.get('[data-testid="metrics-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Monthly Active Users');
  });

  it('opens the metric detail page when a row is clicked', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metric-row-kpi.mau"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-metric');
    expect(router.currentRoute.value.params).toMatchObject({ fqn: 'kpi.mau' });
  });

  it('persists the card view choice and renders checkboxes in card mode', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-card-view-button"]').trigger('click');
    await flushPromises();
    expect(localStorage.getItem('metricsList.viewMode.v1')).toBe('card');
    expect(wrapper.find('[data-testid="metric-select-kpi.mau"]').exists()).toBe(true);
  });

  it('defaults to card view on a narrow screen', async () => {
    vi.stubGlobal(
      'matchMedia',
      () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    );
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metric-select-kpi.mau"]').exists()).toBe(true);
  });

  it('carries the real search text and status filter into the bulk-edit scope', async () => {
    const { wrapper, router } = await mountView();
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('update:value', 'Approved');
    await flushPromises();
    await wrapper.find('[data-testid="metrics-bulk-edit-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('bulk-edit');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'metric', fqn: '*' });
    expect(useBulkEditScopeStore().scope).toEqual({
      mode: 'filtered',
      filters: { statusFilter: 'Approved' },
    });
  });

  it('carries selected ids and names into the bulk-edit scope', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metric-card-view-button"]').trigger('click');
    await flushPromises();
    const checkbox = wrapper.find('[data-testid="metric-select-kpi.mau"]');
    (checkbox.element as HTMLInputElement).checked = true;
    await checkbox.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="metrics-bulk-bar"]').exists()).toBe(true);
    await wrapper.find('[data-testid="metrics-bulk-edit-selected-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('bulk-edit');
    expect(useBulkEditScopeStore().scope).toEqual({
      mode: 'selected',
      metricIds: ['m1'],
      metricNames: ['mau'],
      filters: {},
    });
  });

  it('hides the bulk-edit entry without EditAll', async () => {
    permState.ops = { ViewAll: true };
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="metrics-bulk-edit-button"]').exists()).toBe(false);
  });

  it('expands the ancestor chain and scrolls to a highlighted row', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      getMetricAncestorFqns.mockResolvedValue(['kpi.mau']);
      const { wrapper } = await mountView({ highlight: 'kpi.mau.eu' }, true);
      expect(getMetricAncestorFqns).toHaveBeenCalledWith('kpi.mau.eu');
      expect(listMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ parent: 'kpi.mau' }),
      );
      expect(wrapper.find('[data-testid="metric-row-kpi.mau.eu"]').exists()).toBe(true);
      expect(scrollIntoView).toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      if (original) {
        Element.prototype.scrollIntoView = original;
      } else {
        delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });

  it('respects a stored column preference', async () => {
    localStorage.setItem('metricList', JSON.stringify(['owners']));
    const { wrapper } = await mountView();
    expect(wrapper.text()).not.toContain('Description');
    expect(wrapper.find('[data-testid="metrics-customize-columns"]').exists()).toBe(true);
  });

  it('shows the create button with Create and opens the create drawer', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="create-metric"]').exists()).toBe(true);
    await wrapper.get('[data-testid="create-metric"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="metric-create-drawer-save"]')).not.toBeNull();
    });
  });

  it('hides the create button without Create', async () => {
    permState.ops = { ViewAll: true, EditAll: true, Delete: true };
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="create-metric"]').exists()).toBe(false);
  });

  it('navigates to the new metric detail page when the drawer reports created', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="create-metric"]').trigger('click');
    await flushPromises();
    const drawer = wrapper.findComponent(MetricCreateDrawer);
    drawer.vm.$emit('created', 'kpi.mau');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('governance-metric');
    expect(router.currentRoute.value.params).toMatchObject({ fqn: 'kpi.mau' });
  });

  it('exports metrics and marks the job owned', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metrics-actions-menu"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="metrics-export"]')).not.toBeNull();
    });
    (document.body.querySelector('[data-testid="metrics-export"]') as HTMLElement).click();
    await flushPromises();
    expect(exportMetricsCsvAsync).toHaveBeenCalledWith('*');
    expect(markCsvJobOwned).toHaveBeenCalledWith('job-1');
  });

  it('navigates to the bulk-import wizard for metrics', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="metrics-actions-menu"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="metrics-import"]')).not.toBeNull();
    });
    (document.body.querySelector('[data-testid="metrics-import"]') as HTMLElement).click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('bulk-import');
    expect(router.currentRoute.value.params).toMatchObject({ entityType: 'metric', fqn: '*' });
  });

  it('bulk deletes the selected metrics, clears the selection, and reloads once they are gone', async () => {
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-card-view-button"]').trigger('click');
    await flushPromises();
    const checkbox = wrapper.find('[data-testid="metric-select-kpi.mau"]');
    (checkbox.element as HTMLInputElement).checked = true;
    await checkbox.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="metrics-bulk-bar"]').exists()).toBe(true);
    await wrapper.get('[data-testid="metrics-bulk-delete-button"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="metrics-delete-confirm"]')).not.toBeNull();
    });
    const hierarchyCallsBeforeConfirm = getMetricHierarchy.mock.calls.length;
    (document.body.querySelector('[data-testid="metrics-delete-confirm"]') as HTMLElement).click();
    await flushPromises();
    await vi.waitFor(() => {
      expect(getMetricHierarchy.mock.calls.length).toBe(hierarchyCallsBeforeConfirm + 1);
    });
    expect(deleteMetricAsync).toHaveBeenCalledWith('m1', true);
    expect(getMetricByFqn).toHaveBeenCalledWith('kpi.mau');
    expect(wrapper.find('[data-testid="metrics-bulk-bar"]').exists()).toBe(false);
  });

  it('keeps the selection, dialog, and page when a bulk delete submit fails', async () => {
    deleteMetricAsync.mockRejectedValueOnce(new Error('delete failed'));
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-card-view-button"]').trigger('click');
    await flushPromises();
    const checkbox = wrapper.find('[data-testid="metric-select-kpi.mau"]');
    (checkbox.element as HTMLInputElement).checked = true;
    await checkbox.trigger('change');
    await flushPromises();
    await wrapper.get('[data-testid="metrics-bulk-delete-button"]').trigger('click');
    await flushPromises();
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="metrics-delete-confirm"]')).not.toBeNull();
    });
    const hierarchyCallsBeforeConfirm = getMetricHierarchy.mock.calls.length;
    (document.body.querySelector('[data-testid="metrics-delete-confirm"]') as HTMLElement).click();
    await flushPromises();
    expect(deleteMetricAsync).toHaveBeenCalledWith('m1', true);
    // No reload: the list stays where it was.
    expect(getMetricHierarchy.mock.calls.length).toBe(hierarchyCallsBeforeConfirm);
    expect(wrapper.find('[data-testid="metrics-bulk-bar"]').exists()).toBe(true);
    expect(document.body.querySelector('[data-testid="metrics-delete-confirm"]')).not.toBeNull();
  });

  it('hides the bulk-delete button without Delete', async () => {
    permState.ops = { ViewAll: true, Create: true, EditAll: true };
    const { wrapper } = await mountView();
    await wrapper.get('[data-testid="metric-card-view-button"]').trigger('click');
    await flushPromises();
    const checkbox = wrapper.find('[data-testid="metric-select-kpi.mau"]');
    (checkbox.element as HTMLInputElement).checked = true;
    await checkbox.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="metrics-bulk-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metrics-bulk-delete-button"]').exists()).toBe(false);
  });
});
