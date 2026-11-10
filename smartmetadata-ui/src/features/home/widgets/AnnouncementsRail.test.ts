/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import AnnouncementsRail from './AnnouncementsRail.vue';

const listAnnouncements = vi.fn();

vi.mock('@/api/announcements', () => ({
  listAnnouncements: (...args: unknown[]) => listAnnouncements(...args),
}));

const NOW = Date.now();

function asset(id: string) {
  return {
    id,
    name: id,
    displayName: `Notice ${id}`,
    description: 'Heads up',
    type: 'Notice',
    startTime: NOW - 1000,
    endTime: NOW + 100000,
    createdBy: 'admin',
    updatedAt: NOW - 500,
    createdAt: NOW - 900,
  };
}

async function mountRail() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'u-1', name: 'admin', displayName: 'admin' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(AnnouncementsRail, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('AnnouncementsRail', () => {
  it('lists live asset announcements and dismisses one from the rail', async () => {
    listAnnouncements.mockResolvedValue({
      data: [asset('a1'), asset('a2')],
      total: 2,
    });
    const wrapper = await mountRail();
    expect(listAnnouncements).toHaveBeenCalledWith({
      active: true,
      limit: 100,
      system: false,
    });
    expect(wrapper.find('[data-testid="announcements-section"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="announcement-card-"]').length).toBe(2);
    await wrapper.findAll('[data-testid="announcement-dismiss"]')[0].trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="announcement-card-"]').length).toBe(1);
    expect(localStorage.getItem('om-home-dismissed-announcements:u-1')).toBe('["a1"]');
  });

  it('stands the whole section down when nothing is live', async () => {
    listAnnouncements.mockResolvedValue({ data: [], total: 0 });
    const wrapper = await mountRail();
    expect(wrapper.find('[data-testid="announcements-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="announcement-view-all"]').exists()).toBe(false);
  });

  it('opens the all-announcements dialog, which pages and counts the server total', async () => {
    listAnnouncements
      .mockResolvedValueOnce({ data: [asset('a1')], total: 3 })
      .mockResolvedValueOnce({
        data: [asset('a1'), asset('a2')],
        total: 3, after: 'c1',
      })
      .mockResolvedValueOnce({ data: [asset('a3')], total: 3 });
    const wrapper = await mountRail();
    await wrapper.get('[data-testid="announcement-view-all"]').trigger('click');
    await flushPromises();
    await flushPromises();
    // The rail's own fetch plus the dialog's first page.
    expect(listAnnouncements).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-testid="all-announcements-count"]')?.textContent).toBe('3');
    expect(document.querySelectorAll('[data-testid^="announcement-card-"]').length).toBe(2);
    await document
      .querySelector<HTMLElement>('[data-testid="all-announcements-load-more"]')
      ?.click();
    await flushPromises();
    expect(document.querySelectorAll('[data-testid^="announcement-card-"]').length).toBe(3);
  });
});
