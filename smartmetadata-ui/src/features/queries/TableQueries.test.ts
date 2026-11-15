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
import Antd, { DatePicker } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { DataQuery } from '@/api/queries';
import { createTestI18n } from '@/test/i18n';
import TableQueries from './TableQueries.vue';

const mocks = vi.hoisted(() => ({
  searchQueries: vi.fn(),
  searchAssets: vi.fn(),
  getQueryDetails: vi.fn(),
  patchQuery: vi.fn(),
  voteQuery: vi.fn(),
  deleteQuery: vi.fn(),
  getEntityPermissionById: vi.fn(),
  getResourcePermission: vi.fn(),
  confirmDelete: vi.fn(async () => true),
}));

vi.mock('@/api/search', () => ({
  searchQueries: mocks.searchQueries,
  searchAssets: mocks.searchAssets,
}));

vi.mock('@/api/queries', () => ({
  getQueryDetails: mocks.getQueryDetails,
  patchQuery: mocks.patchQuery,
  voteQuery: mocks.voteQuery,
  deleteQuery: mocks.deleteQuery,
}));

vi.mock('@/features/crud/confirmDelete', () => ({
  confirmDelete: mocks.confirmDelete,
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getEntityPermissionById: mocks.getEntityPermissionById,
    getResourcePermission: mocks.getResourcePermission,
  }),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'u1', name: 'alice' } }),
}));

const QUERY_1: DataQuery = {
  id: 'q1',
  query: 'select * from orders',
  queryDate: 1710000000000,
  duration: 1500,
  votes: { upVotes: 2, downVotes: 0, upVoters: [], downVoters: [] },
  queryUsedIn: [{ id: 'tbl-1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' }],
};

const QUERY_2: DataQuery = {
  id: 'q2',
  query: 'select count(*) from orders',
  queryDate: 1710000001000,
  votes: { upVotes: 1, downVotes: 0, upVoters: [], downVoters: [] },
  queryUsedIn: [{ id: 'tbl-1', type: 'table', name: 'orders', fullyQualifiedName: 'svc.db.schema.orders' }],
};

const HYDRATED_1: DataQuery = {
  ...QUERY_1,
  owners: [{ id: 'u1', type: 'user', name: 'alice' }],
  users: [{ id: 'u2', type: 'user', name: 'bob' }],
  usedBy: ['external-etl'],
  tags: [],
};

function filterOf(callIndex: number): Record<string, unknown> {
  const options = mocks.searchQueries.mock.calls[callIndex][3] as { query_filter: string };
  return JSON.parse(options.query_filter) as Record<string, unknown>;
}

function mustClauses(filter: Record<string, unknown>): unknown[] {
  const query = filter.query as { bool: { must: unknown[] } };
  return query.bool.must;
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
}

async function mountTab(
  props: { isTableDeleted?: boolean } = {},
  initialQuery: Record<string, string> = { tab: 'table_queries' },
) {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/asset/:entityType/:fqn', name: 'asset', component: { template: '<div />' } },
      { path: '/query/:fqn/add-query', name: 'query-add', component: { template: '<div />' } },
      { path: '/query-view/:fqn/:queryId', name: 'query-full-screen', component: { template: '<div />' } },
    ],
  });
  await router.push({
    name: 'asset',
    params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    query: initialQuery,
  });
  await router.isReady();
  const wrapper = mount(TableQueries, {
    props: { tableId: 'tbl-1', datasetFqn: 'svc.db.schema.orders', ...props },
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await settle();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEntityPermissionById.mockImplementation(async (resource: string) =>
    resource === 'table'
      ? { ViewQueries: true, ViewBasic: true }
      : { EditQueries: true, Delete: true, EditOwners: true, EditDescription: true, EditTags: true },
  );
  mocks.getResourcePermission.mockResolvedValue({ Create: true });
  mocks.searchQueries.mockResolvedValue({ total: 2, queries: [QUERY_1, QUERY_2] });
  mocks.getQueryDetails.mockImplementation(async (id: string) =>
    id === 'q2' ? { ...QUERY_2, users: [{ id: 'u2', type: 'user', name: 'bob' }] } : HYDRATED_1,
  );
  mocks.searchAssets.mockImplementation(async (_q: string, _from: number, _size: number, options: { index?: string }) => {
    if (options.index === 'tag') {
      return {
        total: 1,
        hits: [
          {
            name: 'Sensitive',
            displayName: 'Sensitive',
            fullyQualifiedName: 'PII.Sensitive',
            entityType: 'tag',
            owners: [],
            tags: [],
            domains: [],
            dataProducts: [],
          },
        ],
        facets: [],
      };
    }
    return { total: 0, hits: [], facets: [] };
  });
  mocks.voteQuery.mockImplementation(async (id: string) => ({
    ...(id === 'q1' ? QUERY_1 : QUERY_2),
    votes: { upVotes: 5, downVotes: 0, upVoters: [{ id: 'u1', type: 'user', name: 'alice' }], downVoters: [] },
  }));
  mocks.deleteQuery.mockResolvedValue(undefined);
  mocks.patchQuery.mockImplementation(async (id: string) => ({ ...(id === 'q1' ? QUERY_1 : QUERY_2) }));
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TableQueries', () => {
  it('searches the query index with the table term, selects the first query, and hydrates the panel', async () => {
    const { wrapper, router } = await mountTab();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(1);
    expect(mocks.searchQueries).toHaveBeenCalledWith(
      '*',
      0,
      15,
      expect.objectContaining({ sortField: 'queryDate', sortOrder: 'desc' }),
    );
    expect(mustClauses(filterOf(0))).toEqual([{ term: { 'queryUsedIn.id': 'tbl-1' } }]);
    expect(wrapper.find('[data-testid="query-card-q1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="query-card-q2"]').exists()).toBe(true);
    expect(mocks.getQueryDetails).toHaveBeenCalledWith('q1');
    expect(wrapper.find('[data-testid="table-query-right-panel"]').text()).toContain('bob');
    expect(wrapper.find('[data-testid="table-query-right-panel"]').text()).toContain('external-etl');
    expect(router.currentRoute.value.query.query).toBe('q1');
    expect(router.currentRoute.value.query.tab).toBe('table_queries');
    wrapper.unmount();
  });

  it('honours the selected query id from the URL', async () => {
    const { wrapper } = await mountTab({}, { tab: 'table_queries', query: 'q2' });
    expect(mocks.getQueryDetails).toHaveBeenCalledWith('q2');
    expect(wrapper.find('[data-testid="query-card-q2"]').classes()).toContain('query-card--selected');
    wrapper.unmount();
  });

  it('denies the tab without ViewQueries and never searches', async () => {
    mocks.getEntityPermissionById.mockImplementation(async (resource: string) =>
      resource === 'table' ? { ViewBasic: true } : {},
    );
    const { wrapper } = await mountTab();
    const denied = wrapper.find('[data-testid="query-view-denied"]');
    expect(denied.exists()).toBe(true);
    expect(denied.text()).toContain('Access Denied');
    expect(denied.text()).toContain(
      "You don't have necessary permissions. Please check with the admin to get the View Query permission.",
    );
    expect(mocks.searchQueries).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the deleted placeholder and skips the fetch for a deleted table', async () => {
    const { wrapper } = await mountTab({ isTableDeleted: true });
    expect(wrapper.find('[data-testid="no-data-placeholder"]').text()).toContain(
      'Queries data is not available for deleted entities.',
    );
    expect(mocks.searchQueries).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the create placeholder with the Add action and docs sentence when no queries exist', async () => {
    mocks.searchQueries.mockResolvedValue({ total: 0, queries: [] });
    const { wrapper, router } = await mountTab();
    const placeholder = wrapper.find('[data-testid="create-error-placeholder-queries"]');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('Adding a new queries is easy, just give it a spin!');
    expect(placeholder.text()).toContain('Still need help? Refer to our docs for more information.');
    expect(placeholder.find('a').attributes('href')).toBe(
      'https://docs.open-metadata.org/latest/connectors/ingestion/workflows/usage',
    );
    expect(placeholder.find('a').text()).toBe('docs');
    const addButton = wrapper.find('[data-testid="add-query-btn"]');
    expect(addButton.text()).toBe('Add');
    await addButton.trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('query-add');
    wrapper.unmount();
  });

  it('shows the access-denied placeholder naming Create Query when creation is denied', async () => {
    mocks.searchQueries.mockResolvedValue({ total: 0, queries: [] });
    mocks.getResourcePermission.mockResolvedValue({ Create: false });
    const { wrapper } = await mountTab();
    const placeholder = wrapper.find('[data-testid="create-error-placeholder-queries"]');
    expect(placeholder.exists()).toBe(true);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(placeholder.text()).toContain('Access Denied');
    expect(placeholder.text()).toContain(
      "You don't have necessary permissions. Please check with the admin to get the Create Query permission.",
    );
    expect(wrapper.find('[data-testid="add-query-btn"]').exists()).toBe(false);
    expect(placeholder.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds the tag clause on filter change and drops filters when paging (pin behavior)', async () => {
    mocks.searchQueries.mockResolvedValue({ total: 30, queries: [QUERY_1, QUERY_2] });
    const { wrapper } = await mountTab();
    const tagFilter = wrapper.find('[data-testid="tag-filter"]');
    await tagFilter.find('.ant-select-selector').trigger('mousedown');
    await tagFilter.find('.ant-select-selection-search-input').trigger('focus');
    await settle();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    const sensitive = options.find((option) => option.textContent?.includes('Sensitive'));
    (sensitive as HTMLElement).click();
    await settle();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(2);
    expect(mustClauses(filterOf(1))).toHaveLength(2);
    expect(JSON.stringify(mustClauses(filterOf(1)))).toContain('PII.Sensitive');
    // Paging refetches with page/size only: the tag clause is dropped
    // while the filter control keeps showing the selection.
    const pageItems = wrapper.findAll('.ant-pagination-item');
    await pageItems[1]?.trigger('click');
    await settle();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(3);
    expect(mocks.searchQueries.mock.calls[2][1]).toBe(15);
    expect(mustClauses(filterOf(2))).toEqual([{ term: { 'queryUsedIn.id': 'tbl-1' } }]);
    expect(wrapper.find('[data-testid="tag-filter"]').text()).toContain('Sensitive');
    wrapper.unmount();
  });

  it('toggles the sort order and refetches ascending', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-testid="sort-order-button"]').trigger('click');
    await settle();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(2);
    expect(mocks.searchQueries.mock.calls[1][3]).toMatchObject({ sortOrder: 'asc' });
    wrapper.unmount();
  });

  it('votes through the card and refreshes the counts from the refetch', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-testid="query-card-q1"]').find('[data-testid="up-vote-btn"]').trigger('click');
    await settle();
    expect(mocks.voteQuery).toHaveBeenCalledWith('q1', 'votedUp');
    expect(wrapper.find('[data-testid="query-card-q1"]').find('[data-testid="up-vote-btn"]').text()).toContain('5');
    wrapper.unmount();
  });

  it('deletes through the card menu and refetches page 1 without filters', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-testid="query-card-q1"]').find('[data-testid="query-btn"]').trigger('click');
    await settle();
    (document.body.querySelector('[data-testid="delete-query"]') as HTMLElement).click();
    await settle();
    expect(mocks.deleteQuery).toHaveBeenCalledWith('q1');
    expect(mocks.searchQueries).toHaveBeenCalledTimes(2);
    expect(mocks.searchQueries.mock.calls[1][1]).toBe(0);
    expect(mustClauses(filterOf(1))).toEqual([{ term: { 'queryUsedIn.id': 'tbl-1' } }]);
    wrapper.unmount();
  });

  it('navigates to the add-query route from the toolbar button', async () => {
    const { wrapper, router } = await mountTab();
    await wrapper.find('[data-testid="add-query-btn"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('query-add');
    wrapper.unmount();
  });

  it('starts from the queryFrom page and pageSize in the URL', async () => {
    const { wrapper } = await mountTab({}, { tab: 'table_queries', queryFrom: '2', pageSize: '25' });
    expect(mocks.searchQueries).toHaveBeenCalledWith(
      '*',
      25,
      25,
      expect.objectContaining({ sortField: 'queryDate', sortOrder: 'desc' }),
    );
    wrapper.unmount();
  });

  it('loads owner filter options from the user/team search with the bare bot filter', async () => {
    mocks.searchAssets.mockImplementation(async (_q: string, _from: number, _size: number, options: { index?: string }) => {
      if (options.index === 'user,team') {
        return {
          total: 1,
          hits: [
            {
              name: 'alice',
              displayName: 'Alice',
              fullyQualifiedName: 'alice',
              entityType: 'user',
              owners: [],
              tags: [],
              domains: [],
              dataProducts: [],
            },
          ],
          facets: [],
        };
      }
      return { total: 0, hits: [], facets: [] };
    });
    const { wrapper } = await mountTab();
    const ownerFilter = wrapper.find('[data-testid="owner-filter"]');
    await ownerFilter.find('.ant-select-selector').trigger('mousedown');
    await ownerFilter.find('.ant-select-selection-search-input').trigger('focus');
    await settle();
    expect(mocks.searchAssets).toHaveBeenCalledWith('isBot:false', 0, 15, { index: 'user,team' });
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    expect(options.some((option) => option.textContent?.includes('Alice'))).toBe(true);
    wrapper.unmount();
  });

  it('keeps the selected owner filter when tags or sort change (deviation 1)', async () => {
    mocks.searchAssets.mockImplementation(async (_q: string, _from: number, _size: number, options: { index?: string }) => {
      if (options.index === 'user,team') {
        return {
          total: 1,
          hits: [
            {
              name: 'alice',
              displayName: 'Alice',
              fullyQualifiedName: 'alice',
              entityType: 'user',
              owners: [],
              tags: [],
              domains: [],
              dataProducts: [],
            },
          ],
          facets: [],
        };
      }
      if (options.index === 'tag') {
        return {
          total: 1,
          hits: [
            {
              name: 'Sensitive',
              displayName: 'Sensitive',
              fullyQualifiedName: 'PII.Sensitive',
              entityType: 'tag',
              owners: [],
              tags: [],
              domains: [],
              dataProducts: [],
            },
          ],
          facets: [],
        };
      }
      return { total: 0, hits: [], facets: [] };
    });
    const { wrapper } = await mountTab();
    const pickOption = async (testId: string, label: string) => {
      const filter = wrapper.find(`[data-testid="${testId}"]`);
      await filter.find('.ant-select-selector').trigger('mousedown');
      await filter.find('.ant-select-selection-search-input').trigger('focus');
      await settle();
      const options = [...document.body.querySelectorAll('.ant-select-item-option')];
      const option = options.find((entry) => entry.textContent?.includes(label));
      (option as HTMLElement).click();
      await settle();
    };
    await pickOption('owner-filter', 'Alice');
    expect(mocks.searchQueries).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mustClauses(filterOf(1)))).toContain('alice');
    // A tag change keeps the owner clause: the full filter set travels
    // on every filter/sort change (the pin handlers that drop owners
    // are omissions, not designed behavior).
    await pickOption('tag-filter', 'Sensitive');
    expect(mocks.searchQueries).toHaveBeenCalledTimes(3);
    expect(mustClauses(filterOf(2))).toHaveLength(3);
    expect(JSON.stringify(mustClauses(filterOf(2)))).toContain('alice');
    expect(JSON.stringify(mustClauses(filterOf(2)))).toContain('PII.Sensitive');
    // A sort change keeps both filters as well.
    await wrapper.find('[data-testid="sort-order-button"]').trigger('click');
    await settle();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(4);
    expect(mustClauses(filterOf(3))).toHaveLength(3);
    expect(JSON.stringify(mustClauses(filterOf(3)))).toContain('alice');
    expect(JSON.stringify(mustClauses(filterOf(3)))).toContain('PII.Sensitive');
    expect(mocks.searchQueries.mock.calls[3][3]).toMatchObject({ sortOrder: 'asc' });
    wrapper.unmount();
  });

  it('sends a start/end-of-day queryDate range clause on date change', async () => {
    const { wrapper } = await mountTab();
    const picker = wrapper.findComponent(DatePicker.RangePicker);
    await picker.vm.$emit('change', [dayjs('2026-03-01T10:00:00'), dayjs('2026-03-02T15:30:00')], [
      '2026-03-01',
      '2026-03-02',
    ]);
    await settle();
    expect(mocks.searchQueries).toHaveBeenCalledTimes(2);
    expect(mustClauses(filterOf(1))).toEqual([
      { term: { 'queryUsedIn.id': 'tbl-1' } },
      {
        range: {
          queryDate: {
            gte: dayjs('2026-03-01').startOf('day').valueOf(),
            lte: dayjs('2026-03-02').endOf('day').valueOf(),
          },
        },
      },
    ]);
    wrapper.unmount();
  });

  it('shows the filtered-empty state when a filtered search returns nothing', async () => {
    const { wrapper } = await mountTab();
    mocks.searchQueries.mockResolvedValueOnce({ total: 0, queries: [] });
    const tagFilter = wrapper.find('[data-testid="tag-filter"]');
    await tagFilter.find('.ant-select-selector').trigger('mousedown');
    await tagFilter.find('.ant-select-selection-search-input').trigger('focus');
    await settle();
    const options = [...document.body.querySelectorAll('.ant-select-item-option')];
    const sensitive = options.find((option) => option.textContent?.includes('Sensitive'));
    (sensitive as HTMLElement).click();
    await settle();
    expect(wrapper.find('[data-testid="no-queries"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').text()).toContain(
      'Adding a new queries is easy, just give it a spin!',
    );
    expect(wrapper.find('[data-testid="query-card-q1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-error-placeholder-queries"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not let a stale hydrate resurrect a selection after an empty fetch', async () => {
    let resolveHydrate!: (value: DataQuery) => void;
    mocks.getQueryDetails.mockImplementation(async (id: string) => {
      if (id === 'q2') {
        return new Promise<DataQuery>((resolve) => {
          resolveHydrate = resolve;
        });
      }
      return HYDRATED_1;
    });
    const { wrapper } = await mountTab();
    await wrapper.find('[data-testid="query-card-q2"]').find('[data-testid="query-sql"]').trigger('click');
    await settle();
    expect(mocks.getQueryDetails).toHaveBeenCalledWith('q2');
    mocks.searchQueries.mockResolvedValueOnce({ total: 0, queries: [] });
    await wrapper.find('[data-testid="sort-order-button"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-testid="create-error-placeholder-queries"]').exists()).toBe(true);
    resolveHydrate({ ...QUERY_2, users: [{ id: 'u2', type: 'user', name: 'bob' }] });
    await settle();
    expect(wrapper.find('[data-testid="table-query-right-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-error-placeholder-queries"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
