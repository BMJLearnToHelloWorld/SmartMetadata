/*
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import DataModelsTab, { type DataModelRow } from './DataModelsTab.vue';

// Module-level mocks and paging state. The vi.mock factories below only
// create lazy arrows, so they never read these bindings at factory
// evaluation time (no TDZ hazard); the bindings are read when the
// mocked functions are actually called.
const listDataModelsMock = vi.fn();
const searchServiceIndexMock = vi.fn();
const buildSchemaQueryFilterMock = vi.fn((..._args: unknown[]) => ({ filter: 'built' }));
const pagingRef = ref<{ total: number; after?: string; before?: string }>({ total: 0 });
const currentPageRef = ref(1);
const pageSizeRef = ref(15);
const pagingCursorRef = ref<{ cursorType?: string; cursorValue?: string; currentPage: string; pageSize: number }>({
  currentPage: '1',
  pageSize: 15,
});
const showPaginationRef = ref(true);
const handlePageChangeMock = vi.fn();
const handlePageSizeChangeMock = vi.fn();
const handlePagingChangeMock = vi.fn((next: { total: number; after?: string; before?: string }) => {
  pagingRef.value = next;
});
const pagingState = {
  paging: pagingRef,
  currentPage: currentPageRef,
  pageSize: pageSizeRef,
  pagingCursor: pagingCursorRef,
  showPagination: showPaginationRef,
};

vi.mock('@/api/dataModels', () => ({
  listDataModels: (...args: unknown[]) => listDataModelsMock(...args),
}));

vi.mock('@/api/serviceSearch', () => ({
  searchServiceIndex: (...args: unknown[]) => searchServiceIndexMock(...args),
  buildSchemaQueryFilter: (...args: unknown[]) => buildSchemaQueryFilterMock(...args),
}));

vi.mock('@/ingestion/useCursorPaging', () => ({
  useCursorPaging: () => ({
    paging: pagingState.paging,
    handlePagingChange: handlePagingChangeMock,
    currentPage: pagingState.currentPage,
    handlePageChange: handlePageChangeMock,
    pageSize: pagingState.pageSize,
    handlePageSizeChange: handlePageSizeChangeMock,
    showPagination: pagingState.showPagination,
    pagingCursor: pagingState.pagingCursor,
  }),
}));

vi.mock('@/ingestion/tierTags', () => ({
  isTierTag: (tag: { tagFQN: string }) => tag.tagFQN.startsWith('Tier.'),
  getTierTag: (tags: Array<{ tagFQN: string }>) => tags.find((tag) => tag.tagFQN.startsWith('Tier.')),
  getTagsWithoutTier: (tags: Array<{ tagFQN: string }>) =>
    tags.filter((tag) => !tag.tagFQN.startsWith('Tier.')),
  isCertificationTag: (tag: { tagFQN: string }) => tag.tagFQN.startsWith('Certification.'),
  getCertificationTag: (tags: Array<{ tagFQN: string }>) =>
    tags.find((tag) => tag.tagFQN.startsWith('Certification.')),
  getTagsWithoutCertification: (tags: Array<{ tagFQN: string }>) =>
    tags.filter((tag) => !tag.tagFQN.startsWith('Certification.')),
  tierTagsPatch: (current: unknown[], next?: string) => [
    ...current.filter((tag: any) => !tag.tagFQN.startsWith('Tier.')),
    ...(next
      ? [{ tagFQN: next, source: 'Classification', labelType: 'Manual', state: 'Confirmed' }]
      : []),
  ],
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function row(overrides: Partial<DataModelRow> = {}): DataModelRow {
  return {
    id: 'dm-1',
    name: 'orders_model',
    displayName: 'Orders Model',
    description: 'Order facts',
    fullyQualifiedName: 'svc.orders_model',
    dataModelType: 'dbt',
    owners: [{ id: 'u1', name: 'alice', type: 'user' }],
    tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification' }],
    ...overrides,
  };
}

async function mountTab(options: {
  query?: Record<string, string>;
  showDeleted?: boolean;
  onShowDeletedChange?: (checked: boolean) => void;
} = {}) {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: defineComponent({ render: () => h('div') }) },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: defineComponent({ render: () => h('div') }),
      },
    ],
  });
  await router.push({ path: '/', query: options.query ?? {} });
  await router.isReady();
  const onShowDeletedChange = options.onShowDeletedChange ?? vi.fn();
  const wrapper = mount(DataModelsTab, {
    attachTo: document.body,
    global: {
      plugins: [Antd, createTestI18n(), router],
    },
    props: {
      serviceFqn: 'svc',
      showDeleted: options.showDeleted ?? false,
      onShowDeletedChange,
    },
  });
  await flush();
  return { wrapper, router, onShowDeletedChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  pagingState.paging.value = { total: 0, after: undefined, before: undefined };
  pagingState.currentPage.value = 1;
  pagingState.pageSize.value = 15;
  pagingState.pagingCursor.value = { currentPage: '1', pageSize: 15 };
  pagingState.showPagination.value = true;
  listDataModelsMock.mockResolvedValue({ data: [], total: 0 });
  searchServiceIndexMock.mockResolvedValue({ hits: [], total: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DataModelsTab', () => {
  it('fetches the list on mount and renders rows with pin columns', async () => {
    listDataModelsMock.mockResolvedValue({ data: [row()], total: 1, after: 'c1' });
    const { wrapper } = await mountTab();

    expect(listDataModelsMock).toHaveBeenCalledWith({
      service: 'svc',
      limit: 15,
      include: 'non-deleted',
      fields: 'tags,owners,domains,dataProducts,certification',
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="data-model-Orders Model"]').exists()).toBe(true);
    });
    expect(wrapper.text()).toContain('Orders Model');
    expect(wrapper.text()).toContain('Order facts');
    expect(wrapper.text()).toContain('dbt');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('Sensitive');
    // Link target is the data-model detail route.
    const link = wrapper.find('[data-testid="data-model-Orders Model"]');
    expect(link.attributes('href')).toContain('dashboardDataModel');
    wrapper.unmount();
  });

  it('shows the no-data empty state with the data-model plural label', async () => {
    listDataModelsMock.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Data Models data available.');
    });
    wrapper.unmount();
  });

  it('refetches with the cursor when pagingCursor changes', async () => {
    listDataModelsMock.mockResolvedValue({ data: [], total: 40, after: 'c1' });
    const { wrapper } = await mountTab();
    expect(listDataModelsMock).toHaveBeenCalledTimes(1);
    pagingState.pagingCursor.value = { cursorType: 'after', cursorValue: 'c1', currentPage: '2', pageSize: 15 };
    await flush();
    expect(listDataModelsMock).toHaveBeenCalledTimes(2);
    expect(listDataModelsMock).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'c1' }));
    wrapper.unmount();
  });

  it('cursor pagination delegates to handlePageChange with the stored cursor', async () => {
    listDataModelsMock.mockResolvedValue({ data: [row()], total: 40, after: 'c1' });
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    expect(handlePageChangeMock).toHaveBeenCalledWith(
      2,
      { cursorType: 'after', cursorValue: 'c1' },
      15,
    );
    wrapper.unmount();
  });

  it('searches through the index with the service filter and renders hits highlighted', async () => {
    searchServiceIndexMock.mockResolvedValue({
      hits: [
        {
          id: 'dm-2',
          name: 'orders',
          displayName: 'Orders',
          description: 'd',
          fullyQualifiedName: 'svc.orders',
          dataModelType: 'dbt',
          owners: [],
          tags: [],
        },
      ],
      total: 1,
    });
    const { wrapper } = await mountTab({ query: { dataModel: 'ord' } });
    await vi.waitFor(() => {
      expect(searchServiceIndexMock).toHaveBeenCalled();
    });
    expect(buildSchemaQueryFilterMock).toHaveBeenCalledWith(
      'service.fullyQualifiedName.keyword',
      'svc',
      'ord',
    );
    expect(searchServiceIndexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '',
        pageNumber: 1,
        pageSize: 15,
        queryFilter: { filter: 'built' },
        searchIndex: 'dashboardDataModel',
        includeDeleted: false,
        trackTotalHits: true,
      }),
    );
    expect(listDataModelsMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="data-model-Orders"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-highlight="true"]').text()).toBe('Ord');
    wrapper.unmount();
  });

  it('shows the search empty state with both pin strings', async () => {
    searchServiceIndexMock.mockResolvedValue({ hits: [], total: 0 });
    const { wrapper } = await mountTab({ query: { dataModel: 'zzz' } });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No matching results');
      expect(wrapper.text()).toContain('Check the spelling');
    });
    wrapper.unmount();
  });

  it('debounces search input, writes the query param, and resets to page 1', async () => {
    const { wrapper, router } = await mountTab();
    const input = wrapper.find('.data-models-tab__search input');
    await input.setValue('ord');
    await new Promise((resolve) => setTimeout(resolve, 650));
    await flush();
    expect(router.currentRoute.value.query.dataModel).toBe('ord');
    expect(handlePageChangeMock).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined });
    wrapper.unmount();
  });

  it('showDeleted toggle calls the callback and resets page size to 15 (pin F9)', async () => {
    const onShowDeletedChange = vi.fn();
    const { wrapper } = await mountTab({ onShowDeletedChange });
    await wrapper.find('[data-testid="show-deleted"]').trigger('click');
    expect(onShowDeletedChange).toHaveBeenCalledWith(true);
    expect(handlePageChangeMock).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined }, 15);
    wrapper.unmount();
  });

  it('list failure toasts, clears rows, and resets paging to zero total', async () => {
    listDataModelsMock.mockRejectedValueOnce(new Error('boom'));
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(handlePagingChangeMock).toHaveBeenCalledWith({ total: 0 });
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Data Models data available.');
    });
    wrapper.unmount();
  });

  it('search failure toasts but keeps the previous rows', async () => {
    listDataModelsMock.mockResolvedValue({ data: [row()], total: 1 });
    const { wrapper, router } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="data-model-Orders Model"]').exists()).toBe(true);
    });
    searchServiceIndexMock.mockRejectedValueOnce(new Error('search boom'));
    await router.replace({ path: '/', query: { dataModel: 'ord' } });
    await flush();
    await flush();
    expect(wrapper.find('[data-testid="data-model-Orders Model"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('excludes tier and certification tags from the tags cell', async () => {
    listDataModelsMock.mockResolvedValue({
      data: [
        row({
          tags: [
            { tagFQN: 'Tier.Tier1', source: 'Classification' },
            { tagFQN: 'Certification.Gold', source: 'Classification' },
            { tagFQN: 'PII.Sensitive', source: 'Classification' },
          ],
        }),
      ],
      total: 1,
    });
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="tag-PII.Sensitive"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="tag-Tier.Tier1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tag-Certification.Gold"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('forwards page-size changes to handlePageSizeChange', async () => {
    listDataModelsMock.mockResolvedValue({ data: [row()], total: 40 });
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="page-size-selection-dropdown"]').exists()).toBe(true);
    });
    const footer = wrapper.findComponent({ name: 'ServiceChildrenPagination' });
    expect(footer.exists()).toBe(true);
    footer.vm.$emit('page-size-change', 25);
    await flush();
    expect(handlePageSizeChangeMock).toHaveBeenCalledWith(25);
    wrapper.unmount();
  });
});
