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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import OnlineUsersView from './OnlineUsersView.vue';

const listOnlineUsers = vi.fn();
const searchUsers = vi.fn();

vi.mock('@/api/users', async () => {
  const actual = await vi.importActual<typeof import('@/api/users')>('@/api/users');
  return {
    ...actual,
    listOnlineUsers: (...args: unknown[]) => listOnlineUsers(...args),
    searchUsers: (...args: unknown[]) => searchUsers(...args),
  };
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/insights/online-users', name: 'insights-online-users', component: OnlineUsersView }],
  });
  await router.push({ name: 'insights-online-users' });
  await router.isReady();
  const wrapper = mount(OnlineUsersView, { global: { plugins: [router, Antd, createTestI18n()] } });
  await flushPromises();
  return wrapper;
}

describe('OnlineUsersView', () => {
  beforeEach(() => {
    listOnlineUsers.mockReset();
    searchUsers.mockReset();
    listOnlineUsers.mockResolvedValue({
      data: [
        {
          id: 'u1',
          name: 'alice',
          displayName: 'Alice',
          email: 'alice@example.com',
          teams: [{ id: 't1', name: 'Engineering', type: 'team' }],
          roles: [{ id: 'r1', name: 'DataConsumer', type: 'role' }],
          lastActivityTime: Date.now() - 2 * 60 * 1000,
        },
      ],
    });
    searchUsers.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('calls GET /v1/users/online with the default 24-hour window and renders the row', async () => {
    const wrapper = await mountView();
    expect(listOnlineUsers).toHaveBeenCalledWith({ timeWindow: 1440 });
    expect(wrapper.find('[data-testid="online-users-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.text()).toContain('DataConsumer');
    expect(wrapper.text()).toContain('admin-only');
  });

  it('shows an honest error, not an empty list, when the endpoint is missing', async () => {
    listOnlineUsers.mockRejectedValue(new Error('online endpoint missing'));
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="online-users-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="online-users-state-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('online endpoint missing');
  });

  it('searches through the user index and shows the search-empty state', async () => {
    const wrapper = await mountView();
    const input = wrapper.find('[data-testid="online-users-search"]');
    await input.setValue('bob');
    const button = wrapper.find('.ant-input-search-button');
    expect(button.exists()).toBe(true);
    await button.trigger('click');
    await flushPromises();
    expect(searchUsers).toHaveBeenCalledWith('bob');
    expect(wrapper.find('[data-testid="online-users-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="online-users-state-empty"]').exists()).toBe(true);
  });
});
