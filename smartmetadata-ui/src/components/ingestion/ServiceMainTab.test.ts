/*
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { CursorPagingState } from '@/catalog/servicePaging';
import ServiceMainTab, {
  type CursorPagingInfoProp,
  type ServiceChildRow,
  type ServiceMainTabDetails,
} from './ServiceMainTab.vue';

// Module-level mocks. The vi.mock factories below only create lazy
// arrows, so they never read these bindings at factory evaluation
// time; the bindings are read when the mocked functions are called.
const searchServiceIndexMock = vi.fn();
const buildSchemaQueryFilterMock = vi.fn((..._args: unknown[]) => ({ filter: 'built' }));
const getSearchIndexForServiceMock = vi.fn((...args: unknown[]) => {
  const kind = args[0] as string;
  return kind === 'metadata' ? undefined : `${kind}Index`;
});
const COUNT_LABEL_KEY_BY_KIND: Record<string, string> = {
  database: 'database',
  messaging: 'topic',
  dashboard: 'dashboard',
  pipeline: 'pipeline',
  mlmodel: 'mlmodel',
  storage: 'container',
  search: 'searchIndex',
  api: 'apiCollection',
  drive: 'directory',
};
const getCountLabelMock = vi.fn((...args: unknown[]) => {
  const kind = args[0] as string;
  return {
    key: kind,
    labelKey: `serviceDetail.countLabels.${COUNT_LABEL_KEY_BY_KIND[kind] ?? 'database'}`,
  };
});
const patchDriveAssetMock = vi.fn();
const patchAssetMock = vi.fn();
const listDataProductsMock = vi.fn();
const loadGovernanceCatalogMock = vi.fn();
const getResourcePermissionMock = vi.fn();

vi.mock('@/api/serviceSearch', () => ({
  searchServiceIndex: (...args: unknown[]) => searchServiceIndexMock(...args),
  buildSchemaQueryFilter: (...args: unknown[]) => buildSchemaQueryFilterMock(...args),
  getSearchIndexForService: (...args: unknown[]) => getSearchIndexForServiceMock(...args),
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

vi.mock('@/catalog/serviceCountLabel', () => ({
  getCountLabel: (...args: unknown[]) => getCountLabelMock(...args),
}));

vi.mock('@/api/driveAssets', () => ({
  patchDriveAsset: (...args: unknown[]) => patchDriveAssetMock(...args),
  listDriveAssets: vi.fn(),
}));

vi.mock('@/api/entities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/entities')>()),
  patchAsset: (...args: unknown[]) => patchAssetMock(...args),
}));

vi.mock('@/api/dataProducts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/dataProducts')>()),
  listDataProducts: (...args: unknown[]) => listDataProductsMock(...args),
}));

vi.mock('@/governance/catalogOptions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/governance/catalogOptions')>()),
  loadGovernanceCatalog: (...args: unknown[]) => loadGovernanceCatalogMock(...args),
}));

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    getResourcePermission: (...args: unknown[]) => getResourcePermissionMock(...args),
  }),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function serviceDetails(overrides: Partial<ServiceMainTabDetails> = {}): ServiceMainTabDetails {
  return {
    id: 'svc-1',
    name: 'svc',
    kind: 'database',
    serviceType: 'Mysql',
    fullyQualifiedName: 'svc',
    description: 'Service description',
    tags: [
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Gloss.Term', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ],
    dataProducts: [{ id: 'dp1', name: 'dp_one', displayName: 'DP One', fullyQualifiedName: 'dp_one' }],
    ...overrides,
  };
}

function row(overrides: Partial<ServiceChildRow> = {}): ServiceChildRow {
  return {
    id: 'row-1',
    name: 'db_one',
    displayName: 'DB One',
    description: 'Row description',
    fullyQualifiedName: 'svc.db_one',
    owners: [{ id: 'u1', name: 'alice', type: 'user' }],
    tags: [
      { tagFQN: 'Tier.Tier1', source: 'Classification' },
      { tagFQN: 'Certification.Gold', source: 'Classification' },
      { tagFQN: 'PII.Sensitive', source: 'Classification' },
    ],
    certification: { tagLabel: { tagFQN: 'Certification.Gold', source: 'Classification' } },
    ...overrides,
  };
}

const FULL_PERMISSIONS = {
  EditAll: true,
  EditDescription: true,
  EditTags: true,
  EditGlossaryTerms: true,
  EditDisplayName: true,
};

async function mountTab(options: {
  query?: Record<string, string>;
  details?: ServiceMainTabDetails;
  data?: ServiceChildRow[];
  permission?: Record<string, boolean>;
  paging?: CursorPagingState | Ref<CursorPagingState>;
  currentPage?: number | Ref<number>;
  pagingInfo?: Partial<CursorPagingInfoProp>;
  showDeleted?: boolean;
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
      {
        path: '/bulk/edit/:entityType/:fqn',
        name: 'bulk-edit',
        component: defineComponent({ render: () => h('div') }),
      },
    ],
  });
  await router.push({ path: '/', query: options.query ?? {} });
  await router.isReady();
  const setFilters = vi.fn();
  const saveUpdatedServiceData = vi.fn().mockResolvedValue({});
  const onDescriptionUpdate = vi.fn().mockResolvedValue({});
  const onDataProductUpdate = vi.fn().mockResolvedValue({});
  const onShowDeletedChange = vi.fn();
  const setIsServiceLoading = vi.fn();
  const handlePageChange = vi.fn();
  const handlePageSizeChange = vi.fn();
  const handlePagingChange = vi.fn();
  const wrapper = mount(ServiceMainTab, {
    attachTo: document.body,
    global: {
      plugins: [Antd, createTestI18n(), router],
    },
    props: {
      serviceName: 'svc',
      serviceDetails: options.details ?? serviceDetails(),
      servicePermission: options.permission ?? FULL_PERMISSIONS,
      data: options.data ?? [row()],
      isServiceLoading: false,
      paging: options.paging ?? { total: 1, after: '', before: '' },
      currentPage: options.currentPage ?? 1,
      pagingInfo: {
        handlePageChange,
        handlePageSizeChange,
        handlePagingChange,
        pageSize: 15,
        showPagination: true,
        ...options.pagingInfo,
      },
      showDeleted: options.showDeleted ?? false,
      setFilters,
      saveUpdatedServiceData,
      onDescriptionUpdate,
      onDataProductUpdate,
      onShowDeletedChange,
      setIsServiceLoading,
    },
  });
  await flush();
  await flush();
  return {
    wrapper,
    router,
    setFilters,
    saveUpdatedServiceData,
    onDescriptionUpdate,
    onDataProductUpdate,
    onShowDeletedChange,
    setIsServiceLoading,
    handlePageChange,
    handlePageSizeChange,
    handlePagingChange,
  };
}

function findSelectByTestId(wrapper: ReturnType<typeof mount>, testId: string) {
  const selects = wrapper.findAllComponents({ name: 'ASelect' });
  const found = selects.find((c) => c.attributes('data-testid') === testId);
  expect(found?.exists()).toBe(true);
  return found!;
}

beforeEach(() => {
  vi.clearAllMocks();
  searchServiceIndexMock.mockResolvedValue({ hits: [], total: 0 });
  getResourcePermissionMock.mockResolvedValue({ EditDisplayName: true });
  patchAssetMock.mockResolvedValue({
    id: 'row-1',
    name: 'db_one',
    displayName: 'Echoed Name',
    description: 'Row description',
    fullyQualifiedName: 'svc.db_one',
    owners: [],
    domains: [],
    dataProducts: [],
    tags: [],
  });
  patchDriveAssetMock.mockResolvedValue({
    id: 'row-1',
    name: 'db_one',
    displayName: 'Dir Renamed',
    description: 'Row description',
    fullyQualifiedName: 'svc.dir_one',
    owners: [],
    domains: [],
    dataProducts: [],
    tags: [],
  });
  listDataProductsMock.mockResolvedValue({ data: [], total: 0 });
  loadGovernanceCatalogMock.mockResolvedValue({
    owners: [],
    tags: [
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
      {
        tagFQN: 'New.Tag',
        name: 'Tag',
        source: 'Classification',
        displayName: 'New Tag Display',
        description: 'New tag description',
      },
      { tagFQN: 'Gloss.Term', name: 'Term', source: 'Glossary' },
      { tagFQN: 'Gloss.Other', name: 'Other', source: 'Glossary' },
    ],
    domains: [],
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ServiceMainTab', () => {
  it('renders the six default-visible columns with pin cell semantics', async () => {
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-child-row-1"]').exists()).toBe(true);
    });
    const header = wrapper.find('thead').text();
    expect(header).toContain('Name');
    expect(header).toContain('Description');
    expect(header).toContain('Owners');
    expect(header).toContain('Tags');
    expect(header).toContain('Tier');
    expect(header).toContain('Certification');
    expect(header).not.toContain('Domain');
    expect(header).not.toContain('Data Products');
    expect(wrapper.find('[data-testid="service-child-row-1"]').attributes('href')).toContain(
      '/assets/database/svc.db_one',
    );
    expect(wrapper.text()).toContain('Row description');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.find('[data-testid="tag-PII.Sensitive"]').exists()).toBe(true);
    // Tier and certification appear in their own columns, not the tags cell.
    expect(wrapper.findAll('[data-testid="tag-Tier.Tier1"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="tag-Certification.Gold"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows the no-data empty state with the count label', async () => {
    const { wrapper } = await mountTab({ data: [] });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No Databases data available.');
    });
    wrapper.unmount();
  });

  it('edits the description only when changed and stays in edit mode on failure', async () => {
    const { wrapper, onDescriptionUpdate } = await mountTab();
    expect(wrapper.find('[data-testid="service-description"]').exists()).toBe(true);
    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    const input = wrapper.find('[data-testid="edit-description-input"]');
    await input.setValue('Service description');
    await wrapper.find('[data-testid="save-description"]').trigger('click');
    await flush();
    expect(onDescriptionUpdate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-description-input"]').exists()).toBe(false);

    await wrapper.find('[data-testid="edit-description"]').trigger('click');
    await wrapper.find('[data-testid="edit-description-input"]').setValue('New description');
    onDescriptionUpdate.mockRejectedValueOnce(new Error('save failed'));
    await wrapper.find('[data-testid="save-description"]').trigger('click');
    await flush();
    expect(onDescriptionUpdate).toHaveBeenCalledWith('New description');
    expect(wrapper.find('[data-testid="edit-description-input"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the description edit entry when denied', async () => {
    const { wrapper } = await mountTab({ permission: {} });
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides edit entries for a deleted service (gated derivation)', async () => {
    const { wrapper } = await mountTab({ details: serviceDetails({ deleted: true }) });
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tags"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('searches through the index, replaces rows with hits, and toggles loading', async () => {
    searchServiceIndexMock.mockResolvedValue({
      hits: [
        {
          id: 'row-2',
          name: 'db_two',
          displayName: 'DB Two',
          description: 'd2',
          fullyQualifiedName: 'svc.db_two',
          owners: [],
          tags: [],
        },
      ],
      total: 1,
    });
    const { wrapper, setIsServiceLoading, handlePagingChange } = await mountTab({
      query: { schema: 'two' },
    });
    await vi.waitFor(() => {
      expect(searchServiceIndexMock).toHaveBeenCalled();
    });
    expect(getSearchIndexForServiceMock).toHaveBeenCalledWith('database');
    expect(buildSchemaQueryFilterMock).toHaveBeenCalledWith(
      'service.fullyQualifiedName.keyword',
      'svc',
      'two',
    );
    expect(searchServiceIndexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pageNumber: 1,
        pageSize: 15,
        searchIndex: 'databaseIndex',
        query: '',
        queryFilter: { filter: 'built' },
        includeDeleted: false,
        trackTotalHits: true,
      }),
    );
    expect(setIsServiceLoading).toHaveBeenCalledWith(true);
    expect(setIsServiceLoading).toHaveBeenCalledWith(false);
    expect(handlePagingChange).toHaveBeenCalledWith({ total: 1 });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="service-child-row-2"]').exists()).toBe(true);
    });
    expect(
      wrapper.findAll('[data-highlight="true"]').map((element) => element.text()),
    ).toEqual(['two', 'Two']);
    wrapper.unmount();
  });

  it('skips the search when the kind has no search index', async () => {
    const { wrapper } = await mountTab({
      query: { schema: 'x' },
      details: serviceDetails({ kind: 'metadata' }),
    });
    await flush();
    await flush();
    expect(searchServiceIndexMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('debounces search input into setFilters plus a page-1 reset', async () => {
    const { wrapper, setFilters, handlePageChange } = await mountTab();
    await wrapper.find('.service-main-tab__search input').setValue('db');
    await new Promise((resolve) => setTimeout(resolve, 650));
    await flush();
    expect(setFilters).toHaveBeenCalledWith({ schema: 'db' });
    expect(handlePageChange).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined });
    wrapper.unmount();
  });

  it('cursor pagination passes the stored cursor; search pagination is number-based', async () => {
    const { wrapper, handlePageChange } = await mountTab({
      paging: { total: 40, after: 'c1', before: '' },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    expect(handlePageChange).toHaveBeenCalledWith(2, { cursorType: 'after', cursorValue: 'c1' }, 15);
    wrapper.unmount();

    const searched = await mountTab({ query: { schema: 'db' }, paging: { total: 40, after: '', before: '' } });
    await vi.waitFor(() => {
      expect(searched.wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await searched.wrapper.find('[data-testid="next"]').trigger('click');
    expect(searched.handlePageChange).toHaveBeenCalledWith(2);
    searched.wrapper.unmount();
  });

  it('showDeleted toggle calls the callback and resets to page 1', async () => {
    const { wrapper, onShowDeletedChange, handlePageChange } = await mountTab();
    await wrapper.find('[data-testid="show-deleted"]').trigger('click');
    expect(onShowDeletedChange).toHaveBeenCalledWith(true);
    expect(handlePageChange).toHaveBeenCalledWith(1, { cursorType: null, cursorValue: undefined });
    wrapper.unmount();
  });

  it('bulk edit navigates for database services with EditAll, and is absent otherwise', async () => {
    const { wrapper, router } = await mountTab();
    await wrapper.find('[data-testid="bulk-edit"]').trigger('click');
    await flush();
    expect(router.currentRoute.value.name).toBe('bulk-edit');
    expect(router.currentRoute.value.params).toEqual({ entityType: 'databaseService', fqn: 'svc' });
    wrapper.unmount();

    const denied = await mountTab({ permission: {} });
    expect(denied.wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(false);
    denied.wrapper.unmount();

    const messaging = await mountTab({ details: serviceDetails({ kind: 'messaging' }) });
    expect(messaging.wrapper.find('[data-testid="bulk-edit"]').exists()).toBe(false);
    messaging.wrapper.unmount();
  });

  it('gates display-name edit on the resource permission and echoes the response', async () => {
    // The echoed response replaces the whole row (pin
    // handleDisplayNameUpdate), so it carries a new description too.
    patchAssetMock.mockResolvedValue({
      id: 'row-1',
      name: 'db_one',
      displayName: 'Echoed Name',
      description: 'Echoed description',
      fullyQualifiedName: 'svc.db_one',
      owners: [],
      domains: [],
      dataProducts: [],
      tags: [],
    });
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(getResourcePermissionMock).toHaveBeenCalledWith('databaseService');
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-display-name-row-1"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="edit-display-name-row-1"]').trigger('click');
    await wrapper.find('[data-testid="display-name-input-row-1"]').setValue('New Name');
    await wrapper.find('[data-testid="save-display-name-row-1"]').trigger('click');
    await flush();
    expect(patchAssetMock).toHaveBeenCalledWith('database', 'row-1', [
      { op: 'replace', path: '/displayName', value: 'New Name' },
    ]);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="column-display-name"]').text()).toContain('Echoed Name');
    });
    expect(wrapper.text()).toContain('Echoed description');
    expect(wrapper.text()).not.toContain('Row description');
    wrapper.unmount();
  });

  it('hides the display-name edit entry when the resource permission denies it', async () => {
    getResourcePermissionMock.mockResolvedValue({});
    const { wrapper } = await mountTab();
    await flush();
    await flush();
    expect(wrapper.find('[data-testid="edit-display-name-row-1"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('routes directory display-name edits through patchDriveAsset', async () => {
    const { wrapper } = await mountTab({
      details: serviceDetails({ kind: 'drive' }),
      data: [row({ fullyQualifiedName: 'svc.dir_one' })],
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-display-name-row-1"]').exists()).toBe(true);
    });
    // Directory rows do not link (no detail page).
    expect(wrapper.find('[data-testid="service-child-row-1"]').element.tagName).toBe('SPAN');
    await wrapper.find('[data-testid="edit-display-name-row-1"]').trigger('click');
    await wrapper.find('[data-testid="display-name-input-row-1"]').setValue('Dir Renamed');
    await wrapper.find('[data-testid="save-display-name-row-1"]').trigger('click');
    await flush();
    expect(patchDriveAssetMock).toHaveBeenCalledWith('directory', 'row-1', [
      { op: 'replace', path: '/displayName', value: 'Dir Renamed' },
    ]);
    expect(patchAssetMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="column-display-name"]').text()).toContain('Dir Renamed');
    });
    wrapper.unmount();
  });

  it('skips the PATCH when the display name is unchanged', async () => {
    const { wrapper } = await mountTab();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-display-name-row-1"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="edit-display-name-row-1"]').trigger('click');
    await wrapper.find('[data-testid="save-display-name-row-1"]').trigger('click');
    await flush();
    expect(patchAssetMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renders the three right-panel faces in pin order and no custom-properties face', async () => {
    const { wrapper } = await mountTab();
    const panel = wrapper.find('[data-testid="entity-right-panel"]');
    expect(panel.exists()).toBe(true);
    const headings = panel.findAll('h3').map((heading) => heading.text());
    expect(headings).toEqual(['Data Products', 'Tags', 'Glossary Terms']);
    expect(panel.text()).toContain('DP One');
    expect(panel.text()).not.toContain('Custom Properties');
    wrapper.unmount();
  });

  it('hides the data-products face for metadata services', async () => {
    const { wrapper } = await mountTab({ details: serviceDetails({ kind: 'metadata' }) });
    const headings = wrapper
      .find('[data-testid="entity-right-panel"]')
      .findAll('h3')
      .map((heading) => heading.text());
    expect(headings).toEqual(['Tags', 'Glossary Terms']);
    wrapper.unmount();
  });

  it('tags save merges tier-first, keeps previous objects, and preserves glossary labels', async () => {
    const { wrapper, saveUpdatedServiceData } = await mountTab();
    await wrapper.find('[data-testid="edit-tags"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-tags-select"]').exists()).toBe(true);
    });
    const select = findSelectByTestId(wrapper, 'edit-tags-select');
    select.vm.$emit('update:value', ['PII.Sensitive', 'New.Tag']);
    await flush();
    await wrapper.find('[data-testid="save-tags"]').trigger('click');
    await flush();
    expect(saveUpdatedServiceData).toHaveBeenCalledTimes(1);
    const updated = saveUpdatedServiceData.mock.calls[0][0] as ServiceMainTabDetails;
    // Pin order: tier first, then previous labels in current-array
    // order, then newly built labels appended.
    expect(updated.tags).toEqual([
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Gloss.Term', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
      {
        tagFQN: 'New.Tag',
        name: 'Tag',
        displayName: 'New Tag Display',
        description: 'New tag description',
        source: 'Classification',
        labelType: 'Manual',
        state: 'Confirmed',
      },
    ]);
    wrapper.unmount();
  });

  it('glossary save merges with glossary source and preserves classification labels', async () => {
    const { wrapper, saveUpdatedServiceData } = await mountTab();
    await wrapper.find('[data-testid="edit-glossary"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-glossary-select"]').exists()).toBe(true);
    });
    const select = findSelectByTestId(wrapper, 'edit-glossary-select');
    select.vm.$emit('update:value', ['Gloss.Other']);
    await flush();
    await wrapper.find('[data-testid="save-glossary"]').trigger('click');
    await flush();
    const updated = saveUpdatedServiceData.mock.calls[0][0] as ServiceMainTabDetails;
    expect(updated.tags).toEqual([
      { tagFQN: 'Tier.Tier1', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Gloss.Other', name: 'Other', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ]);
    wrapper.unmount();
  });

  it('data-products save passes entity refs built from the options', async () => {
    listDataProductsMock.mockResolvedValue({
      data: [
        {
          id: 'dp1',
          name: 'dp_one',
          displayName: 'DP One',
          fullyQualifiedName: 'dp_one',
          domains: [],
          owners: [],
          experts: [],
          tags: [],
        },
        {
          id: 'dp2',
          name: 'dp_two',
          displayName: 'DP Two',
          fullyQualifiedName: 'dp_two',
          domains: [],
          owners: [],
          experts: [],
          tags: [],
        },
      ],
      total: 2,
    });
    const { wrapper, onDataProductUpdate } = await mountTab();
    await wrapper.find('[data-testid="edit-data-products"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="edit-data-products-select"]').exists()).toBe(true);
    });
    const select = findSelectByTestId(wrapper, 'edit-data-products-select');
    select.vm.$emit('update:value', ['dp_one', 'dp_two']);
    await flush();
    await wrapper.find('[data-testid="save-data-products"]').trigger('click');
    await flush();
    expect(onDataProductUpdate).toHaveBeenCalledWith([
      { id: 'dp1', type: 'dataProduct', name: 'dp_one', displayName: 'DP One', fullyQualifiedName: 'dp_one' },
      { id: 'dp2', type: 'dataProduct', name: 'dp_two', displayName: 'DP Two', fullyQualifiedName: 'dp_two' },
    ]);
    wrapper.unmount();
  });

  it('hides face edit entries when their gates deny', async () => {
    const { wrapper } = await mountTab({ permission: { EditDescription: true } });
    expect(wrapper.find('[data-testid="edit-data-products"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-tags"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-glossary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-description"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('accepts ref-based paging props (MaybeRef contract)', async () => {
    const paging = ref({ total: 40, after: 'c1', before: '' });
    const currentPage = ref(1);
    const { wrapper, handlePageChange } = await mountTab({
      paging,
      currentPage,
      pagingInfo: { pageSize: ref(15), showPagination: ref(true) },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="next"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="next"]').trigger('click');
    expect(handlePageChange).toHaveBeenCalledWith(2, { cursorType: 'after', cursorValue: 'c1' }, 15);
    wrapper.unmount();
  });
});
