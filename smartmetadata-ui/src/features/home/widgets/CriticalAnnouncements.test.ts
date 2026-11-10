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
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import CriticalAnnouncements from './CriticalAnnouncements.vue';

const listAnnouncements = vi.fn();

vi.mock('@/api/announcements', () => ({
  listAnnouncements: (...args: unknown[]) => listAnnouncements(...args),
}));

const NOW = Date.now();

function critical(id: string, startTime: number) {
  return {
    id,
    name: id,
    displayName: `Critical ${id}`,
    description: 'Outage',
    type: 'Critical',
    startTime,
    endTime: NOW + 100000,
    createdBy: 'admin',
  };
}

function mountBanner() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'u-1', name: 'admin', displayName: 'admin' };
  return mount(CriticalAnnouncements, {
    slots: { fallback: '<div data-testid="greeting-fallback">Hi admin</div>' },
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('CriticalAnnouncements', () => {
  it('pages through every live critical and sorts newest first', async () => {
    listAnnouncements
      .mockResolvedValueOnce({
        data: [critical('old', NOW - 5000)],
        total: 3, after: 'c1',
      })
      .mockResolvedValueOnce({
        data: [critical('new', NOW - 1000), critical('mid', NOW - 3000)],
        total: 3,
      });
    const wrapper = mountBanner();
    await flushPromises();
    await flushPromises();
    expect(listAnnouncements).toHaveBeenCalledTimes(2);
    expect(listAnnouncements.mock.calls[0][0]).toMatchObject({
      active: true,
      system: true,
      type: 'Critical',
      limit: 25,
    });
    const titles = wrapper
      .findAll('[data-testid="critical-announcement-title"]')
      .map((node) => node.text());
    expect(titles).toEqual(['Critical new', 'Critical mid', 'Critical old']);
    expect(wrapper.find('[data-testid="critical-announcement-position"]').text()).toBe('1 of 3');
  });

  it('renders the fallback when no critical is live', async () => {
    listAnnouncements.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountBanner();
    await flushPromises();
    expect(wrapper.find('[data-testid="critical-announcements"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="greeting-fallback"]').exists()).toBe(true);
  });

  it('dismisses a banner into its own storage key and hides it', async () => {
    listAnnouncements.mockResolvedValue({
      data: [critical('c1', NOW - 1000)],
      total: 1,
    });
    const wrapper = mountBanner();
    await flushPromises();
    await wrapper.get('[data-testid="critical-announcement-dismiss"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="critical-announcements"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="greeting-fallback"]').exists()).toBe(true);
    expect(localStorage.getItem('om-home-dismissed-critical-announcements:u-1')).toBe('["c1"]');
  });
});
