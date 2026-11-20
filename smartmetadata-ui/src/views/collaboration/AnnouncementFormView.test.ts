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
import SystemAnnouncementForm from '@/components/notifications/SystemAnnouncementForm.vue';
import { createTestI18n } from '@/test/i18n';
import type { Announcement } from '@/types/collaboration';
import AnnouncementFormView from './AnnouncementFormView.vue';

const getAnnouncementById = vi.fn();

vi.mock('@/api/announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/announcements')>();
  return { ...actual, getAnnouncementById: (...args: unknown[]) => getAnnouncementById(...args) };
});

const START = new Date(2026, 10, 10).getTime();
const END = new Date(2026, 10, 12, 23, 59, 59, 999).getTime();

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    name: 'announcement-1',
    displayName: 'Downtime window',
    description: 'The cluster restarts.',
    startTime: START,
    endTime: END,
    type: 'Notice',
    createdBy: 'admin',
    ...overrides,
  } as Announcement;
}

const stub = { template: '<div />' };
const editorStub = {
  props: ['initialValue', 'placeHolder'],
  emits: ['text-change'],
  template: '<textarea data-testid="description" :value="initialValue" />',
};

async function mountView(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'admin-settings', component: stub },
      { path: '/settings/:category', name: 'settings-category', component: stub },
      {
        path: '/settings/notifications/announcements',
        name: 'announcements',
        component: stub,
      },
      {
        path: '/settings/notifications/announcements/add',
        name: 'settings-announcements-add',
        component: AnnouncementFormView,
      },
      {
        path: '/settings/notifications/announcements/edit/:id',
        name: 'settings-announcements-edit',
        component: AnnouncementFormView,
      },
      {
        path: '/settings/notifications/announcements/duplicate/:id',
        name: 'settings-announcements-duplicate',
        component: AnnouncementFormView,
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(AnnouncementFormView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { SmRichTextEditor: editorStub },
    },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe('AnnouncementFormView', () => {
  beforeEach(() => {
    getAnnouncementById.mockReset();
    getAnnouncementById.mockResolvedValue(announcement());
  });

  it('mounts the create form at once, without fetching', async () => {
    const { wrapper } = await mountView('/settings/notifications/announcements/add');
    expect(getAnnouncementById).not.toHaveBeenCalled();
    const form = wrapper.findComponent(SystemAnnouncementForm);
    expect(form.exists()).toBe(true);
    expect(form.props('mode')).toBe('create');
    expect(form.props('announcement')).toBeUndefined();
  });

  it('loads the source by id for edit, then mounts the form with it', async () => {
    const { wrapper } = await mountView('/settings/notifications/announcements/edit/a1');
    expect(getAnnouncementById).toHaveBeenCalledWith('a1');
    const form = wrapper.findComponent(SystemAnnouncementForm);
    expect(form.exists()).toBe(true);
    expect(form.props('mode')).toBe('edit');
    expect(form.props('announcement')).toMatchObject({ id: 'a1' });
  });

  it('loads the source by id for duplicate, with the add title', async () => {
    const { wrapper } = await mountView('/settings/notifications/announcements/duplicate/a1');
    expect(getAnnouncementById).toHaveBeenCalledWith('a1');
    const form = wrapper.findComponent(SystemAnnouncementForm);
    expect(form.props('mode')).toBe('duplicate');
    expect(form.props('announcement')).toMatchObject({ id: 'a1' });
  });

  it('shows the not-found placeholder when the load fails', async () => {
    getAnnouncementById.mockRejectedValue(new Error('gone'));
    const { wrapper } = await mountView('/settings/notifications/announcements/edit/a1');
    expect(wrapper.find('[data-testid="announcement-not-found"]').exists()).toBe(true);
    expect(wrapper.findComponent(SystemAnnouncementForm).exists()).toBe(false);
  });

  it('shows the not-found placeholder for an announcement that is not system-wide', async () => {
    getAnnouncementById.mockResolvedValue(
      announcement({ entityLink: '<#E::table::svc.db.schema.tbl>' }),
    );
    const { wrapper } = await mountView('/settings/notifications/announcements/edit/a1');
    expect(wrapper.find('[data-testid="announcement-not-found"]').exists()).toBe(true);
    expect(wrapper.findComponent(SystemAnnouncementForm).exists()).toBe(false);
  });

  it('returns to the list on cancel and on save', async () => {
    const { wrapper, router } = await mountView('/settings/notifications/announcements/add');
    const form = wrapper.findComponent(SystemAnnouncementForm);
    await form.vm.$emit('cancel');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/settings/notifications/announcements');

    const second = await mountView('/settings/notifications/announcements/edit/a1');
    await second.wrapper
      .findComponent(SystemAnnouncementForm)
      .vm.$emit('saved', announcement());
    await flushPromises();
    expect(second.router.currentRoute.value.path).toBe(
      '/settings/notifications/announcements',
    );
  });
});
