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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import SystemAnnouncementsTable from '@/components/notifications/SystemAnnouncementsTable.vue';
import { createTestI18n } from '@/test/i18n';
import type { Announcement } from '@/types/collaboration';
import AnnouncementsListView from './AnnouncementsListView.vue';

const listAnnouncements = vi.fn();

vi.mock('@/api/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/announcements')>();
  return { ...actual, listAnnouncements: (...args: unknown[]) => listAnnouncements(...args) };
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

const stub = { template: '<div />' };

async function mountView(): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub },
      { path: '/settings/notifications', name: 'settings-notifications', component: stub },
      {
        path: '/settings/notifications/announcements',
        name: 'settings-announcements',
        component: AnnouncementsListView,
      },
      {
        path: '/settings/notifications/announcements/add',
        name: 'settings-announcements-add',
        component: stub,
      },
      {
        path: '/settings/notifications/announcements/edit/:id',
        name: 'settings-announcements-edit',
        component: stub,
      },
      {
        path: '/settings/notifications/announcements/duplicate/:id',
        name: 'settings-announcements-duplicate',
        component: stub,
      },
    ],
  });
  await router.push('/settings/notifications/announcements');
  await router.isReady();
  const wrapper = mount(AnnouncementsListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe('AnnouncementsListView', () => {
  beforeEach(() => {
    listAnnouncements.mockReset();
    listAnnouncements.mockResolvedValue({ data: [announcement()], total: 1 });
  });

  it('renders the page with its table, fed by the system-wide list fetch', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-testid="system-announcements-page"]').exists()).toBe(true);
    expect(listAnnouncements).toHaveBeenCalledWith({
      system: true,
      status: undefined,
      type: undefined,
      limit: 1000,
    });
    expect(
      wrapper.find('[data-testid="announcement-title-announcement-1"]').exists(),
    ).toBe(true);
  });

  it('navigates to the add form from the header button', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.find('[data-testid="add-announcement"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/notifications/announcements/add');
  });

  it('navigates to the edit and duplicate forms by id', async () => {
    const { wrapper, router } = await mountView();
    const table = wrapper.findComponent(SystemAnnouncementsTable);
    await table.vm.$emit('edit', announcement());
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(
      '/settings/notifications/announcements/edit/a1',
    );
    await table.vm.$emit('duplicate', announcement());
    await flushPromises();
    expect(router.currentRoute.value.path).toBe(
      '/settings/notifications/announcements/duplicate/a1',
    );
  });

  it('navigates to the add form from the table empty-state action', async () => {
    listAnnouncements.mockResolvedValue({ data: [], total: 0 });
    const { wrapper, router } = await mountView();
    const table = wrapper.findComponent(SystemAnnouncementsTable);
    await table.vm.$emit('add');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/notifications/announcements/add');
  });
});
