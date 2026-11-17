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
import type { ServicePageData } from '@/api/servicePageData';
import DriveAssetTable from './DriveAssetTable.vue';

// Module-level mocks. The vi.mock factories below only create lazy
// arrows, so they never read these bindings at factory evaluation
// time; the bindings are read when the mocked functions are called.
const searchServiceIndexMock = vi.fn();
const buildSchemaQueryFilterMock = vi.fn((..._args: unknown[]) => ({ filter: 'built' }));
const itemsRef = ref<ServicePageData[]>([]);
const isLoadingRef = ref(false);
const pagingRef = ref<{ total: number; after?: string; before?: string }>({ total: 0 });
const currentPageRef = ref(1);
const pageSizeRef = ref(15);
const showPaginationRef = ref(true);
const setItemsMock = vi.fn((next: ServicePageData[]) => {
  itemsRef.value = next;
});
const setIsLoadingMock = vi.fn((next: boolean) => {
  isLoadingRef.value = next;
});
const handlePageChangeMock = vi.fn();
const handlePageSizeChangeMock = vi.fn();
const handlePagingChangeMock = vi.fn((next: { total: number; after?: string; before?: string }) => {
  pagingRef.value = next;
});
const onPageChangeMock = vi.fn();
const useDriveAssetsMock = vi.fn((..._args: unknown[]) => ({
  items: itemsRef,
  setItems: setItemsMock,
  isLoading: isLoadingRef,
  setIsLoading: setIsLoadingMock,
  pagingInfo: {
    paging: pagingRef,
    handlePagingChange: handlePagingChangeMock,
    currentPage: currentPageRef,
    handlePageChange: handlePageChangeMock,
    pageSize: pageSizeRef,
    handlePageSizeChange: handlePageSizeChangeMock,
    showPagination: showPaginationRef,
    pagingCursor: ref({ currentPage: '1', pageSize: 15 }),
  },
  onPageChange: onPageChangeMock,
}));

vi.mock('@/api/serviceSearch', () => ({
  searchServiceIndex: (...args: unknown[]) => searchServiceIndexMock(...args),
  buildSchemaQueryFilter: (...args: unknown[]) => buildSchemaQueryFilterMock(...args),
}));

vi.mock('@/ingestion/useDriveAssets', () => ({
  useDriveAssets: (...args: unknown[]) => useDriveAssetsMock(...args),
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

function row(overrides: Partial<ServicePageData> = {}): ServicePageData {
  return {
    id: 'f-1',
    name: 'budget.xlsx',
    displayName: 'Budget',
    description: 'Quarterly budget',
    fullyQualifiedName: 'drive.budget',
    owners: [],
    domains: [],
    dataProducts: [],
    tags: [{ tagFQN: 'PII.Sensitive', source: 'Classification' }],
    ...overrides,
  };
}

async function mountTable(options: {
  entityType?: 'file' | 'spreadsheet';
  query?: Record<string, string>;
  showDeleted?: boolean;
  onShowDeletedChange?: (checked: boolean) => void;
} = {}) {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: defineComponent({ render: () => h('div') }) }],
  });
  await router.push({ path: '/', query: options.query ?? {} });
  await router.isReady();
  const onShowDeletedChange = options.onShowDeletedChange ?? vi.fn();
  const wrapper = mount(DriveAssetTable, {
    attachTo: document.body,
    global: {
      plugins: [Antd, createTestI18n(), router],
    },
    props: {
      entityType: options.entityType ?? 'file',
      serviceFqn: 'drive-svc',
      showDeleted: options.showDeleted ?? false,
      onShowDeletedChange,
    },
  });
  await flush();
  return { wrapper, router, onShowDeletedChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  itemsRef.value = [];
  isLoadingRef.value = false;
  pagingRef.value = { total: 0 };
  currentPageRef.value = 1;
  pageSizeRef.value = 15;
  showPaginationRef.value = true;
  searchServiceIndexMock.mockResolvedValue({ hits: [], total: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DriveAssetTable', () => {
  it('renders hook items without links and calls the hook with entity type and service', async () => {
    itemsRef.value = [row()];
    pagingRef.value = { total: 1 };
    const { wrapper } = await mountTable();
    expect(useDriveAssetsMock).toHaveBeenCalledWith(
      'file',
      'drive-svc',
      expect.objectContaining({ value: false }),
    );
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="file-Budget"]').exists()).toBe(true);
    });
    expect(wrapper.text()).toContain('Budget');
    expect(wrapper.text()).toContain('Quarterly budget');
    expect(wrapper.text()).toContain('Sensitive');
    // No detail pages: the name is plain text, not a link.
    expect(wrapper.find('[data-testid="file-Budget"]').element.tagName).toBe('SPAN');
    expect(wrapper.find('[data-testid="files-table"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses the spreadsheets testid and empty label for spreadsheet type', async () => {
    const { wrapper } = await mountTable({ entityType: 'spreadsheet' });
    expect(wrapper.find('[data-testid="spreadsheets-table"]').exists()).toBe(true);
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Spreadsheets data available.');
    });
    wrapper.unmount();
  });

  it('shows the files empty label for file type', async () => {
    const { wrapper } = await mountTable();
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Files data available.');
    });
    wrapper.unmount();
  });

  it('searches the file index with the service filter and writes hits through the hook', async () => {
    searchServiceIndexMock.mockResolvedValue({
      hits: [
        {
          id: 'f-2',
          name: 'notes.txt',
          displayName: 'Notes',
          description: 'n',
          fullyQualifiedName: 'drive.notes',
          tags: [],
        },
      ],
      total: 1,
    });
    const { wrapper } = await mountTable({ query: { file: 'not' } });
    await vi.waitFor(() => {
      expect(searchServiceIndexMock).toHaveBeenCalled();
    });
    expect(buildSchemaQueryFilterMock).toHaveBeenCalledWith(
      'service.fullyQualifiedName.keyword',
      'drive-svc',
      'not',
    );
    expect(searchServiceIndexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '',
        pageNumber: 1,
        pageSize: 15,
        queryFilter: { filter: 'built' },
        searchIndex: 'file',
        includeDeleted: false,
        trackTotalHits: true,
      }),
    );
    expect(setItemsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'f-2', name: 'notes.txt', displayName: 'Notes' }),
    ]);
    expect(handlePagingChangeMock).toHaveBeenCalledWith({ total: 1 });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="file-Notes"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-highlight="true"]').text()).toBe('Not');
    wrapper.unmount();
  });

  it('searches the spreadsheet index under the ?spreadsheet= param', async () => {
    searchServiceIndexMock.mockResolvedValue({ hits: [], total: 0 });
    const { wrapper } = await mountTable({ entityType: 'spreadsheet', query: { spreadsheet: 'bud' } });
    await vi.waitFor(() => {
      expect(searchServiceIndexMock).toHaveBeenCalledWith(
        expect.objectContaining({ searchIndex: 'spreadsheet' }),
      );
    });
    wrapper.unmount();
  });

  it('debounces search input and writes the entity-typed query param', async () => {
    const { wrapper, router } = await mountTable();
    const input = wrapper.find('.drive-asset-table__search input');
    await input.setValue('bud');
    await new Promise((resolve) => setTimeout(resolve, 650));
    await flush();
    expect(router.currentRoute.value.query.file).toBe('bud');
    expect(handlePageChangeMock).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined });
    wrapper.unmount();
  });

  it('showDeleted toggle calls the callback and resets the cursor WITHOUT a page-size reset', async () => {
    const onShowDeletedChange = vi.fn();
    const { wrapper } = await mountTable({ onShowDeletedChange });
    await wrapper.find('[data-testid="show-deleted"]').trigger('click');
    expect(onShowDeletedChange).toHaveBeenCalledWith(true);
    expect(handlePageChangeMock).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined });
    expect(handlePageChangeMock.mock.calls[0]).toHaveLength(2);
    wrapper.unmount();
  });

  it('search failure toasts but keeps the hook items', async () => {
    itemsRef.value = [row()];
    const { wrapper, router } = await mountTable();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="file-Budget"]').exists()).toBe(true);
    });
    searchServiceIndexMock.mockRejectedValueOnce(new Error('search boom'));
    await router.replace({ path: '/', query: { file: 'bud' } });
    await flush();
    await flush();
    expect(itemsRef.value).toHaveLength(1);
    expect(wrapper.find('[data-testid="file-Budget"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('delegates footer page changes to the hook onPageChange', async () => {
    itemsRef.value = [row()];
    pagingRef.value = { total: 40, after: 'c1' };
    const { wrapper } = await mountTable();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    expect(onPageChangeMock).toHaveBeenCalledWith({ currentPage: 2, cursorType: 'after' });
    wrapper.unmount();
  });

  it('excludes tier and certification tags from the tags cell', async () => {
    itemsRef.value = [
      row({
        tags: [
          { tagFQN: 'Tier.Tier1', source: 'Classification' },
          { tagFQN: 'Certification.Gold', source: 'Classification' },
          { tagFQN: 'PII.Sensitive', source: 'Classification' },
        ],
      }),
    ];
    const { wrapper } = await mountTable();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="tag-PII.Sensitive"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="tag-Tier.Tier1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tag-Certification.Gold"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
