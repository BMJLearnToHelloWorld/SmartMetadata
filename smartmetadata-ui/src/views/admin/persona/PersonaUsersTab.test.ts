/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, nextTick } from 'vue';
import { getUserById } from '@/api/users';
import type { AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import PersonaUsersTab from './PersonaUsersTab.vue';

vi.mock('@/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/users')>()),
  getUserById: vi.fn(),
}));

const getUserByIdMock = vi.mocked(getUserById);

// Typed props: array-declared stub props get no Boolean casting.
const UserPopOverCardStub = defineComponent({
  props: {
    userName: { type: String, required: true },
    displayName: { type: String, default: '' },
    showUserName: Boolean,
    profileWidth: { type: Number, default: 24 },
  },
  template: '<span data-testid="user-popover-stub">{{ userName }}</span>',
});

const MESSAGES = {
  en: {
    label: {
      username: 'Username',
      name: 'Name',
      'team-plural': 'Teams',
      'role-plural': 'Roles',
      'action-plural': 'Actions',
      bot: 'Bot',
      user: 'User',
      team: 'Team',
      role: 'Role',
      'no-entity': 'No {entity}',
      'remove-entity': 'Remove {entity}',
      'removing-user': 'Removing User',
      confirm: 'Confirm',
      cancel: 'Cancel',
      'remove-entity-lowercase': 'remove {entity}',
    },
    message: {
      'are-you-sure-want-to-text': 'Are you sure you want to {text}?',
    },
  },
};

function userDetail(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: 'u1',
    name: 'alice',
    displayName: 'Alice',
    teams: [],
    roles: [],
    ...overrides,
  } as AdminUser;
}

async function mountTab(props: { users: EntityRef[]; onRemoveUser?: (id: string) => void }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/teams/:id', name: 'admin-team', component: { template: '<div />' } },
      { path: '/roles/:fqn', name: 'admin-role', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  return mount(PersonaUsersTab, {
    attachTo: document.body,
    global: {
      plugins: [Antd, router, i18n],
      stubs: { UserPopOverCard: UserPopOverCardStub },
    },
    props,
  });
}

async function waitFor(fn: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PersonaUsersTab', () => {
  it('fetches teams/roles per user with no include, and drops only failed rows', async () => {
    getUserByIdMock.mockImplementation(async (id: string) => {
      if (id === 'u2') {
        throw new Error('gone');
      }
      return userDetail({ id: 'u1' });
    });
    const wrapper = await mountTab({
      users: [
        { id: 'u1', name: 'alice', type: 'user' },
        { id: 'u2', name: 'mallory', type: 'user' },
      ],
    });
    await flushPromises();
    await nextTick();
    expect(getUserByIdMock).toHaveBeenCalledWith('u1', { fields: ['teams', 'roles'] });
    expect(getUserByIdMock).toHaveBeenCalledWith('u2', { fields: ['teams', 'roles'] });
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).not.toContain('mallory');
    wrapper.unmount();
  });

  it('shows loading skeletons while details load, then team and role links', async () => {
    let resolveFetch: (value: AdminUser) => void = () => {};
    getUserByIdMock.mockImplementation(
      () =>
        new Promise<AdminUser>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const wrapper = await mountTab({ users: [{ id: 'u1', name: 'alice', type: 'user' }] });
    await nextTick();
    expect(wrapper.find('.ant-skeleton').exists()).toBe(true);
    resolveFetch(
      userDetail({
        teams: [{ id: 't1', name: 'Engineering', type: 'team', fullyQualifiedName: 'Engineering' }],
        roles: [],
      }),
    );
    await flushPromises();
    await nextTick();
    expect(wrapper.find('.ant-skeleton').exists()).toBe(false);
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.text()).toContain('No Role');
    const popover = wrapper.findComponent(UserPopOverCardStub);
    expect(popover.props('userName')).toBe('alice');
    expect(popover.props('showUserName')).toBe(true);
    expect(popover.props('profileWidth')).toBe(16);
    wrapper.unmount();
  });

  it('renders a bot icon for bot users', async () => {
    getUserByIdMock.mockResolvedValue(userDetail({ isBot: true }));
    const wrapper = await mountTab({ users: [{ id: 'u1', name: 'ingestion-bot', type: 'user' }] });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="bot-icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('collapses teams beyond one behind a +N more popover', async () => {
    getUserByIdMock.mockResolvedValue(
      userDetail({
        teams: [
          { id: 't1', name: 'Engineering', type: 'team', fullyQualifiedName: 'Engineering' },
          { id: 't2', name: 'Data', type: 'team', fullyQualifiedName: 'Data' },
          { id: 't3', name: 'Platform', type: 'team', fullyQualifiedName: 'Platform' },
        ],
      }),
    );
    const wrapper = await mountTab({ users: [{ id: 'u1', name: 'alice', type: 'user' }] });
    await flushPromises();
    await nextTick();
    const more = wrapper.find('[data-testid="plus-more-count"]');
    expect(more.exists()).toBe(true);
    expect(more.text()).toContain('+2 more');
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.text()).not.toContain('Platform');
    await more.trigger('click');
    await waitFor(() => document.body.textContent?.includes('Platform') ?? false, 'popover content');
    expect(document.body.textContent).toContain('Data');
    expect(document.body.textContent).toContain('Platform');
    wrapper.unmount();
  });

  it('renders the empty placeholder with no create action when there are no users', async () => {
    const wrapper = await mountTab({ users: [] });
    await flushPromises();
    await nextTick();
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="assign-error-placeholder-User"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-persona-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('confirms removal with the user name; cancel does nothing, confirm calls back with the id', async () => {
    getUserByIdMock.mockResolvedValue(userDetail({ displayName: 'Alice A' }));
    const onRemoveUser = vi.fn();
    const wrapper = await mountTab({
      users: [{ id: 'u1', name: 'alice', type: 'user' }],
      onRemoveUser,
    });
    await flushPromises();
    await nextTick();
    await wrapper.find('[data-testid="remove-user-btn"]').trigger('click');
    await nextTick();
    const modal = document.body.querySelector('[data-testid="remove-confirmation-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('alice');
    expect(modal?.textContent).not.toContain('Alice A');
    (document.body.querySelector('.ant-modal-footer .ant-btn:not(.ant-btn-primary)') as HTMLElement).click();
    await nextTick();
    expect(onRemoveUser).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="remove-user-btn"]').trigger('click');
    await nextTick();
    (document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement).click();
    await nextTick();
    expect(onRemoveUser).toHaveBeenCalledWith('u1');
    wrapper.unmount();
  });

  it('renders no remove button when no removal handler is passed', async () => {
    getUserByIdMock.mockResolvedValue(userDetail({}));
    const wrapper = await mountTab({ users: [{ id: 'u1', name: 'alice', type: 'user' }] });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="remove-user-btn"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
