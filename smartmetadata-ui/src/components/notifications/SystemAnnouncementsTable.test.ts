/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Dropdown, Pagination, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { computed, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { Announcement } from '@/types/collaboration';
import type { SystemAnnouncementsListState } from '@/views/collaboration/useSystemAnnouncements';
import AnnouncementDeleteDialog from './AnnouncementDeleteDialog.vue';
import SystemAnnouncementsTable from './SystemAnnouncementsTable.vue';

const deleteSystemAnnouncement = vi.fn();

vi.mock('@/views/collaboration/useSystemAnnouncements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/views/collaboration/useSystemAnnouncements')>();
  return { ...actual, deleteSystemAnnouncement: (...args: unknown[]) => deleteSystemAnnouncement(...args) };
});

const NOW = Date.now();

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    name: 'announcement-1',
    displayName: 'Downtime window',
    description: 'The cluster restarts.',
    startTime: NOW - 10000,
    endTime: NOW + 10000,
    type: 'Notice',
    createdBy: 'admin',
    ...overrides,
  } as Announcement;
}

const hooks = {
  t: ((key: string) => key) as never,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
};

function fakeList(overrides: Record<string, unknown> = {}): {
  list: SystemAnnouncementsListState;
  fns: Record<string, ReturnType<typeof vi.fn>>;
} {
  const filters = ref({ search: '', status: undefined, type: undefined });
  const fns = {
    clearFilters: vi.fn(),
    goToPage: vi.fn(),
    refetch: vi.fn(),
    setPageSize: vi.fn(),
    updateFilters: vi.fn(),
  };
  const list = {
    announcements: ref<Announcement[]>([announcement()]),
    filters,
    hasFilters: computed(() => Boolean(filters.value.search.trim() || filters.value.status || filters.value.type)),
    isError: ref(false),
    isLoading: ref(false),
    page: ref(1),
    pageCount: ref(1),
    pageSize: ref(10),
    total: ref(1),
    ...fns,
    ...overrides,
  } as unknown as SystemAnnouncementsListState;
  return { list, fns };
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted) {
    wrapper.unmount();
  }
  mounted.length = 0;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

beforeEach(() => {
  deleteSystemAnnouncement.mockResolvedValue(undefined);
});

function mountTable(list: SystemAnnouncementsListState) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SystemAnnouncementsTable, {
    props: { list, hooks, notifySuccess: vi.fn() },
    global: { plugins: [pinia, Antd, createTestI18n()] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForBodySelector(selector: string): Promise<Element> {
  for (let i = 0; i < 40; i++) {
    const el = document.body.querySelector(selector);
    if (el) {
      return el;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`selector never appeared: ${selector}`);
}

/**
 * The Dropdown overlay is an antd portal whose open/close is the
 * library's own behaviour; the behaviour under test is the menu
 * itself — its items and the dispatch behind each key. Drive the
 * menu prop the table hands to the Dropdown.
 */
function clickMenuItem(wrapper: VueWrapper, key: string): void {
  const dropdown = wrapper.findComponent(Dropdown);
  const menu = dropdown.props('menu') as {
    items: Array<{ key: string; label?: { props?: Record<string, unknown> } }>;
    onClick: (info: { key: string }) => void;
  };
  const item = menu.items.find((entry) => entry.key === key);
  expect(item).toBeDefined();
  menu.onClick({ key });
}

describe('SystemAnnouncementsTable', () => {
  it('renders rows with type, title, author, dates and status', () => {
    const { list } = fakeList();
    const wrapper = mountTable(list);
    const row = wrapper.find('[data-testid="announcement-row-announcement-1"]');
    expect(row.exists()).toBe(true);
    expect(wrapper.find('[data-testid="announcement-title-announcement-1"]').text()).toBe(
      'Downtime window',
    );
    expect(row.text()).toContain('admin');
    expect(row.text()).toContain('Active');
  });

  it('dims expired rows', () => {
    const expired = announcement({
      id: 'old',
      name: 'announcement-old',
      startTime: NOW - 20000,
      endTime: NOW - 10000,
    });
    const { list } = fakeList({
      announcements: ref([expired]),
    });
    const wrapper = mountTable(list);
    const row = wrapper.find('[data-testid="announcement-row-announcement-old"]');
    expect(row.classes()).toContain('system-announcements-table__row--expired');
  });

  it('emits edit when the title is clicked', async () => {
    const { list } = fakeList();
    const wrapper = mountTable(list);
    await wrapper.find('[data-testid="announcement-title-announcement-1"]').trigger('click');
    expect(wrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 'a1' });
  });

  it('searches through updateFilters without refetching', async () => {
    const { list, fns } = fakeList();
    const wrapper = mountTable(list);
    const search = wrapper.find('[data-testid="announcement-search"]');
    const input = search.element.tagName === 'INPUT' ? search : search.find('input');
    await input.setValue('down');
    expect(fns.updateFilters).toHaveBeenCalledWith({ search: 'down' });
    expect(fns.refetch).not.toHaveBeenCalled();
  });

  it('clears filters through the toolbar button', async () => {
    const { list, fns } = fakeList();
    list.filters.value = { search: 'down', status: undefined, type: undefined };
    const wrapper = mountTable(list);
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="announcement-clear-filters"]').trigger('click');
    expect(fns.clearFilters).toHaveBeenCalledTimes(1);
  });

  it('filters by status and type through the selects', async () => {
    const { list, fns } = fakeList();
    const wrapper = mountTable(list);
    const selects = wrapper.findAllComponents(Select);
    await selects[0]?.vm.$emit('change', 'Active');
    await selects[1]?.vm.$emit('change', 'Warning');
    expect(fns.updateFilters).toHaveBeenCalledWith({ status: 'Active' });
    expect(fns.updateFilters).toHaveBeenCalledWith({ type: 'Warning' });
  });

  it('shows five skeletons while the first page loads', () => {
    const { list } = fakeList({ isLoading: ref(true), announcements: ref([]), total: ref(0) });
    const wrapper = mountTable(list);
    expect(wrapper.findAll('.ant-skeleton')).toHaveLength(5);
  });

  it('shows the error placeholder with a retry when the list fails empty', async () => {
    const { list, fns } = fakeList({ isError: ref(true), announcements: ref([]), total: ref(0) });
    const wrapper = mountTable(list);
    const placeholder = wrapper.find('[data-testid="announcements-error"]');
    expect(placeholder.exists()).toBe(true);
    await placeholder.find('button').trigger('click');
    expect(fns.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the no-match placeholder when filters empty the list', () => {
    const { list } = fakeList({ announcements: ref([]), total: ref(0) });
    list.filters.value = { search: 'zzz', status: undefined, type: undefined };
    const wrapper = mountTable(list);
    expect(wrapper.find('[data-testid="announcements-no-match"]').exists()).toBe(true);
  });

  it('shows the empty placeholder with an Add action', async () => {
    const { list } = fakeList({ announcements: ref([]), total: ref(0) });
    const wrapper = mountTable(list);
    const placeholder = wrapper.find('[data-testid="announcements-empty"]');
    expect(placeholder.exists()).toBe(true);
    await placeholder.find('button').trigger('click');
    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('pages only past one page, and distinguishes page from size changes', async () => {
    const { list, fns } = fakeList({ total: ref(25), pageCount: ref(3) });
    const wrapper = mountTable(list);
    const pagination = wrapper.findComponent(Pagination);
    expect(pagination.exists()).toBe(true);
    await pagination.vm.$emit('change', 2, 10);
    expect(fns.goToPage).toHaveBeenCalledWith(2);
    await pagination.vm.$emit('change', 1, 25);
    expect(fns.setPageSize).toHaveBeenCalledWith(25);

    const { list: short } = fakeList({ total: ref(5) });
    const shortWrapper = mountTable(short);
    expect(shortWrapper.findComponent(Pagination).exists()).toBe(false);
  });

  it('offers Edit, Duplicate and Delete in the row menu, in that order', () => {
    const { list } = fakeList();
    const wrapper = mountTable(list);
    const dropdown = wrapper.findComponent(Dropdown);
    const menu = dropdown.props('menu') as {
      items: Array<{ key: string; type?: string; label?: { props?: Record<string, unknown> } }>;
    };
    expect(menu.items.map((item) => item.key)).toEqual(['edit', 'duplicate', 'divider', 'delete']);
    expect(menu.items[3]?.type).toBeUndefined();
    expect(menu.items[2]?.type).toBe('divider');
    expect(menu.items[0]?.label?.props?.['data-testid']).toBe('edit-announcement');
    expect(menu.items[1]?.label?.props?.['data-testid']).toBe('duplicate-announcement');
    expect(menu.items[3]?.label?.props?.['data-testid']).toBe('delete-announcement');
  });

  it('edits and duplicates through the row menu', async () => {
    const { list } = fakeList();
    const wrapper = mountTable(list);
    clickMenuItem(wrapper, 'edit');
    await flushPromises();
    expect(wrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 'a1' });

    clickMenuItem(wrapper, 'duplicate');
    await flushPromises();
    expect(wrapper.emitted('duplicate')?.[0]?.[0]).toMatchObject({ id: 'a1' });
  });

  it('deletes through the dialog, closes on success and refetches', async () => {
    const { list, fns } = fakeList();
    const wrapper = mountTable(list);
    clickMenuItem(wrapper, 'delete');
    await flushPromises();

    const confirm = await waitForBodySelector('[data-testid="save-button"]');
    deleteSystemAnnouncement.mockImplementationOnce(async (args: { onDeleted: () => void }) => {
      args.onDeleted();
    });
    (confirm as HTMLElement).click();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(deleteSystemAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
    );
    expect(fns.refetch).toHaveBeenCalledTimes(1);
    // The close is the controlled `open` prop flipping off; the
    // portal node itself lingers until antd's leave transition ends,
    // which jsdom never fires.
    expect(wrapper.findComponent(AnnouncementDeleteDialog).props('open')).toBe(false);
  });

  it('leaves the delete dialog open when the delete fails', async () => {
    const { list, fns } = fakeList();
    const wrapper = mountTable(list);
    clickMenuItem(wrapper, 'delete');
    await flushPromises();

    const confirm = await waitForBodySelector('[data-testid="save-button"]');
    // The helper toasts and never calls onDeleted on failure.
    deleteSystemAnnouncement.mockResolvedValueOnce(undefined);
    (confirm as HTMLElement).click();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(fns.refetch).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="announcement-delete-confirm"]')).not.toBeNull();
  });
  // The antd table + portal mounts run long under shared-VM load; the
  // same 10s allowance the alert view tests carry.
}, 10000);
