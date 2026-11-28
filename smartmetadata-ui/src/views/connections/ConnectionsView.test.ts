/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Pagination, Tooltip } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import ConnectionsFilterDropdown from '@/features/connections/ConnectionsFilterDropdown.vue';
import ConnectionsView from './ConnectionsView.vue';

const getServicesOverview = vi.hoisted(() => vi.fn());
const getResourcePermission = vi.hoisted(() => vi.fn());

vi.mock('@/api/services', () => ({
  getServicesOverview: (...args: unknown[]) => getServicesOverview(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));
vi.mock('@/api/limits', () => ({
  getLimitConfig: vi.fn(async () => {
    throw new Error('no limits in tests');
  }),
  getLimitByResource: vi.fn(async () => {
    throw new Error('no limits in tests');
  }),
}));

interface RowSpec {
  id: string;
  entityType?: string;
  name: string;
  serviceType?: string;
  health?: string;
}

function summary(spec: RowSpec) {
  return {
    id: spec.id,
    entityType: spec.entityType ?? 'databaseService',
    name: spec.name,
    displayName: undefined,
    fullyQualifiedName: spec.name,
    description: undefined,
    serviceType: spec.serviceType ?? 'Postgres',
    owners: [],
    tags: [],
    health: spec.health ?? 'success',
  };
}

function overviewResponse(
  rows: ReturnType<typeof summary>[],
  total?: number,
) {
  const counts: Record<string, number> = {};
  const serviceTypeCounts: Record<string, Record<string, number>> = {};
  const healthCounts: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    counts[row.entityType] = (counts[row.entityType] ?? 0) + 1;
    serviceTypeCounts[row.entityType] ??= {};
    serviceTypeCounts[row.entityType]![row.serviceType!] =
      (serviceTypeCounts[row.entityType]![row.serviceType!] ?? 0) + 1;
    if (row.health) {
      healthCounts[row.entityType] ??= {};
      healthCounts[row.entityType]![row.health] =
        (healthCounts[row.entityType]![row.health] ?? 0) + 1;
    }
  }
  return {
    total: total ?? rows.length,
    data: rows,
    counts,
    serviceTypeCounts,
    healthCounts,
    paging: { total: total ?? rows.length },
  };
}

/** Three services across two categories and three health states. */
function defaultRows() {
  return [
    summary({ id: 'db-1', name: 'warehouse', serviceType: 'Postgres', health: 'failed' }),
    summary({ id: 'db-2', name: 'events', serviceType: 'Mysql', health: 'success' }),
    summary({
      id: 'dash-1',
      entityType: 'dashboardService',
      name: 'bi',
      serviceType: 'Superset',
      health: 'notRun',
    }),
  ];
}

async function mountView(initialPath = '/connections', setup?: () => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  setup?.();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/connections', name: 'connections', component: ConnectionsView },
      {
        path: '/service/:serviceCategory/:fqn/:tab?/:subTab?',
        name: 'service-detail',
        component: { template: '<div>service</div>' },
      },
      {
        path: '/:serviceCategory/add-service',
        name: 'ingestion-service-add',
        component: { template: '<div>wizard</div>' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  const wrapper = mount(ConnectionsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

function titleOf(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="connections-page-title"]').text();
}

function cardNames(wrapper: VueWrapper) {
  return wrapper
    .findAll('[data-testid^="connections-grid-card-"]')
    .map((card) => card.attributes()['data-testid']!.replace('connections-grid-card-', ''));
}

function rowNames(wrapper: VueWrapper) {
  return wrapper
    .findAll('[data-testid^="connections-list-row-"]')
    .map((row) => row.attributes()['data-testid']!.replace('connections-list-row-', ''));
}

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

function filterDropdown(wrapper: VueWrapper, testId: string) {
  const dropdown = wrapper
    .findAllComponents(ConnectionsFilterDropdown)
    .find((item) => item.props('testId') === testId);
  expect(dropdown?.exists()).toBe(true);
  return dropdown!;
}

function dropdownOptions(wrapper: VueWrapper, testId: string): FilterOption[] {
  return filterDropdown(wrapper, testId).props('options') as FilterOption[];
}

function searchInputOf(wrapper: VueWrapper) {
  const host = wrapper.find('[data-testid="search-connections-input"]');
  expect(host.exists()).toBe(true);
  return host.element.tagName === 'INPUT' ? host : host.find('input');
}

describe('ConnectionsView', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    getServicesOverview.mockReset();
    getResourcePermission.mockReset();
    getResourcePermission.mockResolvedValue({ Create: true, ViewAll: true });
    getServicesOverview.mockResolvedValue(overviewResponse(defaultRows()));
  });

  it('renders the estate in grid by default with a counted title', async () => {
    const { wrapper } = await mountView();
    expect(titleOf(wrapper)).toBe('All Connections (3)');
    expect(wrapper.find('[data-testid="connections-grid-view"]').exists()).toBe(true);
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events', 'bi']);
    expect(getServicesOverview).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500, includeHealth: true, include: 'non-deleted' }),
    );
  });

  it('falls back to all for an illegal category', async () => {
    const { wrapper } = await mountView('/connections?category=bogus');
    expect(titleOf(wrapper)).toBe('All Connections (3)');
    expect(wrapper.get('[data-testid="connections-nav-all"]').classes()).toContain(
      'connections__nav-item--active',
    );
  });

  it('scopes rows, title and subtitle to the category tab', async () => {
    const { wrapper } = await mountView('/connections?category=database');
    expect(titleOf(wrapper)).toBe('Databases (2)');
    expect(wrapper.get('[data-testid="connections-page-subtitle"]').text()).toContain(
      'databases',
    );
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events']);
    expect(wrapper.get('[data-testid="connections-nav-database"]').classes()).toContain(
      'connections__nav-item--active',
    );
  });

  it('filters by precise health values and drops illegal ones', async () => {
    const { wrapper } = await mountView('/connections?health=failed,bogus,success');
    expect(titleOf(wrapper)).toBe('All Connections (2)');
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events']);
  });

  it('shows the pin trigger text on the health dropdown', async () => {
    const one = await mountView('/connections?health=failed');
    expect(one.wrapper.get('[data-testid="connections-health-filter"]').text()).toContain('Failed');
    const many = await mountView('/connections?health=failed,success');
    expect(many.wrapper.get('[data-testid="connections-health-filter"]').text()).toContain(
      '2 Selected',
    );
    const none = await mountView();
    expect(none.wrapper.get('[data-testid="connections-health-filter"]').text()).toContain(
      'All Statuses',
    );
  });

  it('rewrites a lone legacy health alias to precise values once', async () => {
    getServicesOverview.mockResolvedValue(
      overviewResponse([
        summary({ id: 'db-1', name: 'warehouse', health: 'failed' }),
        summary({ id: 'db-2', name: 'events', health: 'partialSuccess' }),
        summary({ id: 'db-3', name: 'archive', health: 'success' }),
      ]),
    );
    const { wrapper, router } = await mountView('/connections?health=failing');
    expect(router.currentRoute.value.query.health).toBe('failed,partialSuccess');
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events']);
  });

  it('counts sidebar badges faceted: a health filter narrows the other tab', async () => {
    const { wrapper } = await mountView('/connections?health=failed');
    const nav = wrapper.get('[data-testid="connections-nav-database"]');
    expect(nav.text()).toContain('1');
    expect(wrapper.get('[data-testid="connections-nav-dashboard"]').text()).toContain('0');
  });

  it('clear-all clears the dropdowns but keeps the search term', async () => {
    const { wrapper, router } = await mountView('/connections?search=ware&health=failed');
    expect(cardNames(wrapper)).toEqual(['warehouse']);
    await wrapper.get('[data-testid="connections-clear-filters"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ search: 'ware' });
    expect(cardNames(wrapper)).toEqual(['warehouse']);
  });

  it('asks for deleted services with ?deleted=true and toggles it off', async () => {
    const { wrapper, router } = await mountView('/connections?deleted=true');
    expect(getServicesOverview).toHaveBeenCalledWith(
      expect.objectContaining({ include: 'deleted' }),
    );
    await wrapper.get('[data-testid="connections-show-deleted"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.deleted).toBeUndefined();
  });

  it('drops rows whose entity type has no tab', async () => {
    getServicesOverview.mockResolvedValue(
      overviewResponse([
        summary({ id: 'db-1', name: 'warehouse' }),
        summary({ id: 'db-2', name: 'events' }),
        summary({ id: 'llm-1', entityType: 'llmService', name: 'chat', serviceType: 'OpenAI' }),
      ]),
    );
    const { wrapper } = await mountView();
    expect(titleOf(wrapper)).toBe('All Connections (2)');
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events']);
  });

  it('prunes a selected connector the tab has no services for', async () => {
    const { router } = await mountView('/connections?category=database&serviceType=Superset');
    await flushPromises();
    expect(router.currentRoute.value.query.serviceType).toBeUndefined();
  });

  it('shows the first-run empty state with an Add entry when the estate is empty', async () => {
    getServicesOverview.mockResolvedValue(overviewResponse([]));
    const { wrapper } = await mountView();
    expect(titleOf(wrapper)).toBe('All Connections (0)');
    const empty = wrapper.get('[data-testid="connections-list-empty"]');
    expect(empty.text()).toContain('Connect your first service');
    expect(wrapper.find('[data-testid="connections-list-empty-add-service"]').exists()).toBe(true);
  });

  it('shows the narrowed empty state for a search with no matches', async () => {
    const { wrapper } = await mountView();
    await searchInputOf(wrapper).setValue('zzz');
    await flushPromises();
    expect(wrapper.get('[data-testid="connections-list-empty"]').text()).toContain(
      'No data found. Try changing the filters.',
    );
  });

  it('shows the error state, not an empty estate, when the fetch fails', async () => {
    getServicesOverview.mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="connections-list-error"]').text()).toContain(
      'Something went wrong',
    );
  });

  it('switches to list mode, writes ?viewMode= and reads it back', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="list-view-toggle"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.viewMode).toBe('list');
    expect(wrapper.find('[data-testid="connections-list-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connections-list-table"]').exists()).toBe(true);
  });

  it('reads the stored view-mode preference when the URL has none', async () => {
    const { wrapper } = await mountView('/connections', () => {
      const auth = useAuthStore();
      auth.user = { id: 'u1', name: 'alice' } as never;
      localStorage.setItem(
        'sm.userPreferences.v1',
        JSON.stringify({ version: 1, preferences: { alice: { connectionsViewMode: 'list' } } }),
      );
    });
    expect(wrapper.find('[data-testid="connections-list-view"]').exists()).toBe(true);
  });

  it('pages [12, 24, 48] and resets to page 1 on a tab change', async () => {
    const rows = Array.from({ length: 30 }, (_v, i) =>
      summary({ id: `db-${i + 1}`, name: `db-${String(i + 1).padStart(2, '0')}` }),
    );
    for (let i = 1; i <= 5; i++) {
      rows.push(
        summary({
          id: `dash-${i}`,
          entityType: 'dashboardService',
          name: `dash-${i}`,
          serviceType: 'Superset',
        }),
      );
    }
    getServicesOverview.mockResolvedValue(overviewResponse(rows));
    const { wrapper } = await mountView();
    expect(titleOf(wrapper)).toBe('All Connections (35)');
    const pagination = wrapper.get('[data-testid="connections-pagination"]');
    expect(pagination.text()).toContain('12 / page');
    await wrapper.find('.ant-pagination-item-2').trigger('click');
    await flushPromises();
    expect(cardNames(wrapper)).toContain('db-13');
    await wrapper.get('[data-testid="connections-nav-dashboard"]').trigger('click');
    await flushPromises();
    expect(cardNames(wrapper)).toEqual(['dash-1', 'dash-2', 'dash-3', 'dash-4', 'dash-5']);
    expect(wrapper.find('.ant-pagination-item-active').text()).toBe('1');
  });

  it('opens the service detail on card click', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-testid="connections-grid-card-warehouse"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('service-detail');
    expect(router.currentRoute.value.params).toEqual({ serviceCategory: 'databaseServices', fqn: 'warehouse' });
  });

  it('opens the scoped add-service wizard from the header button', async () => {
    const { wrapper, router } = await mountView('/connections?category=database');
    await wrapper.get('[data-testid="connections-add-service"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service-add');
    expect(router.currentRoute.value.params).toEqual({ serviceCategory: 'databaseServices' });
  });

  it('switches to server mode above 500 services', async () => {
    getServicesOverview.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.limit === 500) {
        return overviewResponse([], 600);
      }
      return overviewResponse(
        [
          summary({ id: 'db-1', name: 'warehouse' }),
          summary({ id: 'db-2', name: 'events' }),
        ],
        2,
      );
    });
    const { wrapper } = await mountView();
    expect(titleOf(wrapper)).toBe('All Connections (2)');
    expect(cardNames(wrapper)).toEqual(['warehouse', 'events']);
    const pageCall = getServicesOverview.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>).limit === 12,
    );
    expect(pageCall).toBeDefined();
    expect(pageCall![0]).toMatchObject({
      limit: 12,
      offset: 0,
      entityType: expect.arrayContaining(['databaseService', 'dashboardService']),
    });
    expect((pageCall![0] as Record<string, unknown>).listEntityType).toBeUndefined();
  });

  it('keeps dropdown option counts faceted: a health filter does not shrink its own options', async () => {
    const { wrapper } = await mountView('/connections?health=failed');
    expect(dropdownOptions(wrapper, 'connections-health-filter')).toEqual([
      { count: 1, label: 'Failed', value: 'failed' },
      { count: 0, label: 'Warning', value: 'partialSuccess' },
      { count: 1, label: 'Not Ran', value: 'notRun' },
      { count: 1, label: 'Healthy', value: 'success' },
    ]);
    // The other dropdown IS narrowed by the health filter.
    expect(dropdownOptions(wrapper, 'connections-service-type-filter')).toEqual([
      { count: 1, label: 'Postgres', value: 'Postgres' },
    ]);
  });

  it('keeps health option counts faceted under a connector filter', async () => {
    const { wrapper } = await mountView('/connections?serviceType=Postgres');
    expect(dropdownOptions(wrapper, 'connections-health-filter')).toEqual([
      { count: 1, label: 'Failed', value: 'failed' },
      { count: 0, label: 'Warning', value: 'partialSuccess' },
      { count: 0, label: 'Not Ran', value: 'notRun' },
      { count: 0, label: 'Healthy', value: 'success' },
    ]);
  });

  it('sends the full filter set per page in server mode, including page 2 offset', async () => {
    getServicesOverview.mockImplementation(async (params: Record<string, unknown>) => {
      if (params.limit === 500) {
        return overviewResponse([], 600);
      }
      return overviewResponse(
        [
          summary({ id: 'db-1', name: 'warehouse' }),
          summary({ id: 'db-2', name: 'events' }),
        ],
        600,
      );
    });
    const { wrapper } = await mountView(
      '/connections?category=database&health=failed&serviceType=Postgres&search=ware&viewMode=list',
    );
    const pageCalls = () =>
      getServicesOverview.mock.calls
        .map((call) => call[0] as Record<string, unknown>)
        .filter((params) => params.limit === 12);
    expect(pageCalls()[0]).toMatchObject({
      limit: 12,
      offset: 0,
      entityType: expect.arrayContaining(['databaseService', 'dashboardService']),
      listEntityType: ['databaseService'],
      health: ['failed'],
      serviceType: ['Postgres'],
      q: 'ware',
      sortOrder: 'asc',
    });
    await wrapper.find('.ant-pagination-item-2').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(pageCalls().some((params) => params.offset === 12)).toBe(true);
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(pageCalls().some((params) => params.sortOrder === 'desc')).toBe(true);
  });

  it('lists every selected name in the "N selected" tooltip', async () => {
    const { wrapper } = await mountView('/connections?health=failed,success');
    const tooltip = filterDropdown(wrapper, 'connections-health-filter').findComponent(Tooltip);
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.props('title')).toBe('Failed, Healthy');
  });

  it('falls back to grid for an illegal ?viewMode=', async () => {
    const { wrapper } = await mountView('/connections?viewMode=bogus');
    expect(wrapper.find('[data-testid="connections-grid-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="connections-list-view"]').exists()).toBe(false);
  });

  it('toggles sort on every name-header click, including the third', async () => {
    const { wrapper } = await mountView('/connections?viewMode=list');
    expect(rowNames(wrapper)).toEqual(['warehouse', 'events', 'bi']);
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    expect(rowNames(wrapper)).toEqual(['bi', 'events', 'warehouse']);
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    expect(rowNames(wrapper)).toEqual(['warehouse', 'events', 'bi']);
    await wrapper.find('.ant-table-column-sorters').trigger('click');
    await flushPromises();
    expect(rowNames(wrapper)).toEqual(['bi', 'events', 'warehouse']);
  });

  it('restores ?pageSize= from the URL and falls back to 12 when off-scale', async () => {
    const rows = Array.from({ length: 30 }, (_v, i) =>
      summary({ id: `db-${i + 1}`, name: `db-${String(i + 1).padStart(2, '0')}` }),
    );
    getServicesOverview.mockResolvedValue(overviewResponse(rows));
    const sized = await mountView('/connections?pageSize=24');
    expect(sized.wrapper.get('[data-testid="connections-pagination"]').text()).toContain(
      '24 / page',
    );
    expect(cardNames(sized.wrapper)).toHaveLength(24);
    const illegal = await mountView('/connections?pageSize=99');
    expect(illegal.wrapper.get('[data-testid="connections-pagination"]').text()).toContain(
      '12 / page',
    );
  });

  it('writes ?pageSize= back to the URL on a size change', async () => {
    const { wrapper, router } = await mountView();
    const pagination = wrapper.findComponent(Pagination);
    expect(pagination.exists()).toBe(true);
    pagination.vm.$emit('change', 1, 24);
    await flushPromises();
    expect(router.currentRoute.value.query.pageSize).toBe('24');
    expect(wrapper.get('[data-testid="connections-pagination"]').text()).toContain('24 / page');
  });

  it('keeps repeated query params as CSV across URL writes', async () => {
    const { wrapper, router } = await mountView('/connections?health=failed&health=success');
    expect(router.currentRoute.value.query.health).toEqual(['failed', 'success']);
    // Any later URL write (here: a tab change) must not drop the second value.
    await wrapper.get('[data-testid="connections-nav-database"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.health).toBe('failed,success');
    expect(router.currentRoute.value.query.category).toBe('database');
  });

  it('offers only supported connectors in the type dropdown', async () => {
    getServicesOverview.mockResolvedValue(
      overviewResponse([
        summary({ id: 'db-1', name: 'warehouse', serviceType: 'Postgres' }),
        summary({ id: 'db-2', name: 'dbt-proj', serviceType: 'Dbt' }),
      ]),
    );
    const { wrapper } = await mountView();
    expect(dropdownOptions(wrapper, 'connections-service-type-filter')).toEqual([
      { count: 1, label: 'Postgres', value: 'Postgres' },
    ]);
  });

  it('stops the nav skeleton and shows 0 counts when the estate fails', async () => {
    getServicesOverview.mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="connections-nav-all"]').text()).toContain('0');
    expect(wrapper.find('.connections__nav-skeleton').exists()).toBe(false);
  });
});
