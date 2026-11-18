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
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { buildOnlineUserSearchQueryFilter, listUsers, searchUsers } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import type { AdminUser } from '@/types/admin';
import UserSelectableList from './UserSelectableList.vue';

vi.mock('@/api/users', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/users')>()),
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
}));

const listUsersMock = vi.mocked(listUsers);
const searchUsersMock = vi.mocked(searchUsers);

const MESSAGES = {
  en: {
    label: {
      user: 'User',
      bot: 'Bot',
      cancel: 'Cancel',
      update: 'Update',
      'search-for-type': 'Search for {type}',
      'clear-entity': 'Clear {entity}',
      'all-lowercase': 'all',
      'remove-entity': 'Remove {entity}',
      'owner-lowercase': 'owner',
    },
    message: {
      'no-data-available': 'No data available',
      'no-permission-for-action': 'No permission for action',
    },
  },
};

function makeUser(overrides: Partial<AdminUser> & { id: string; name: string }): AdminUser {
  return { ...overrides } as AdminUser;
}

const ALICE = makeUser({ id: 'u1', name: 'alice', displayName: 'Alice' });
const BOB = makeUser({ id: 'u2', name: 'bob', displayName: 'Bob' });
const CAROL = makeUser({ id: 'u3', name: 'carol', displayName: 'Carol' });

function mountSelector(
  props: Record<string, unknown> = {},
  slots: Record<string, string> | null = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'u1', name: 'alice', displayName: 'Alice' } as LoginUser;
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  return mount(UserSelectableList, {
    attachTo: document.body,
    global: { plugins: [Antd, i18n] },
    props: {
      hasPermission: true,
      onUpdate: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    ...(slots === null
      ? {}
      : {
          slots: {
            default: '<button data-testid="custom-trigger" type="button">Add</button>',
            ...slots,
          },
        }),
  });
}

function bodyQuery(selector: string): Element | null {
  return document.body.querySelector(selector);
}

function bodyQueryAll(selector: string): Element[] {
  return [...document.body.querySelectorAll(selector)];
}

async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    await nextTick();
  }
}

async function openPopover(wrapper: ReturnType<typeof mountSelector>) {
  await wrapper.find('[data-testid="custom-trigger"]').trigger('click');
  await waitFor(
    () => bodyQuery('[data-testid="selectable-list"]') !== null,
    'selectable list to render',
  );
  await waitFor(
    () =>
      bodyQueryAll('[data-testid="owner-option"]').length > 0 ||
      (bodyQuery('[data-testid="selectable-list"]')?.textContent?.includes(
        'No data available',
      ) ?? false),
    'first page to resolve',
  );
  await flushPromises();
  await nextTick();
}

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ data: [ALICE, BOB, CAROL], total: 3 });
  searchUsersMock.mockResolvedValue({ data: [], total: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('UserSelectableList', () => {
  it('fetches the first page on open and renders options', async () => {
    const wrapper = mountSelector();
    await openPopover(wrapper);
    expect(listUsersMock).toHaveBeenCalledWith({ limit: 25, after: undefined, isBot: false });
    const options = bodyQueryAll('[data-testid="owner-option"]');
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain('Alice');
    wrapper.unmount();
  });

  it('orders selected users first when there is no search text', async () => {
    const wrapper = mountSelector({
      selectedUsers: [{ id: 'u3', name: 'carol', displayName: 'Carol', type: 'user' }],
    });
    await openPopover(wrapper);
    await waitFor(
      () => bodyQueryAll('[data-testid="owner-option"]')[0]?.textContent?.includes('Carol') ?? false,
      'selected user to sort first',
    );
    const options = bodyQueryAll('[data-testid="owner-option"]');
    expect(options[0].textContent).toContain('Carol');
    expect(options).toHaveLength(3);
    wrapper.unmount();
  });

  it('toggles selection and calls onUpdate with the selected array on Update', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountSelector({ onUpdate });
    await openPopover(wrapper);
    const options = bodyQueryAll('[data-testid="owner-option"]');
    (options[1] as HTMLElement).click();
    await nextTick();
    (bodyQuery('[data-testid="selectable-list-update-btn"]') as HTMLElement).click();
    await flushPromises();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [users] = onUpdate.mock.calls[0] as [Array<{ id?: string }>];
    expect(users.map((user) => user.id)).toEqual(['u2']);
    wrapper.unmount();
  });

  it('clear all empties the selection before Update', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountSelector({
      onUpdate,
      selectedUsers: [{ id: 'u1', name: 'alice', displayName: 'Alice', type: 'user' }],
    });
    await openPopover(wrapper);
    (bodyQuery('[data-testid="clear-all-button"]') as HTMLElement).click();
    await nextTick();
    (bodyQuery('[data-testid="selectable-list-update-btn"]') as HTMLElement).click();
    await flushPromises();
    expect(onUpdate).toHaveBeenCalledWith([]);
    wrapper.unmount();
  });

  it('cancel closes and calls onClose without updating', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const wrapper = mountSelector({ onUpdate, onClose });
    await openPopover(wrapper);
    (bodyQuery('[data-testid="cancel-button"]') as HTMLElement).click();
    await flushPromises();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('searches after the typing interval and replaces the list without reordering', async () => {
    searchUsersMock.mockResolvedValue({ data: [BOB], total: 1 });
    const wrapper = mountSelector({
      selectedUsers: [{ id: 'u1', name: 'alice', displayName: 'Alice', type: 'user' }],
    });
    await openPopover(wrapper);
    vi.useFakeTimers();
    const input = bodyQuery(
      '[data-testid="selectable-list"] input',
    ) as HTMLInputElement;
    input.value = 'bo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    await nextTick();
    expect(searchUsersMock).toHaveBeenCalledWith(
      'bo',
      0,
      25,
      buildOnlineUserSearchQueryFilter(),
    );
    const options = bodyQueryAll('[data-testid="owner-option"]');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Bob');
    wrapper.unmount();
  });

  it('fetch failure renders the empty state with no error note', async () => {
    listUsersMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountSelector();
    await openPopover(wrapper);
    expect(bodyQueryAll('[data-testid="owner-option"]')).toHaveLength(0);
    expect(bodyQuery('[data-testid="selectable-list"]')?.textContent).toContain(
      'No data available',
    );
    wrapper.unmount();
  });

  it('appends the next page on scroll when an after cursor remains', async () => {
    const dave = makeUser({ id: 'u4', name: 'dave', displayName: 'Dave' });
    listUsersMock
      .mockResolvedValueOnce({ data: [ALICE, BOB], after: 'cursor-1', total: 3 })
      .mockResolvedValueOnce({ data: [dave], total: 3 });
    const wrapper = mountSelector();
    await openPopover(wrapper);
    const list = bodyQuery('[data-testid="selectable-list"] ul') as HTMLElement;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
    await flushPromises();
    await nextTick();
    expect(listUsersMock).toHaveBeenCalledTimes(2);
    expect(listUsersMock).toHaveBeenLastCalledWith({
      limit: 25,
      after: 'cursor-1',
      isBot: false,
    });
    expect(bodyQueryAll('[data-testid="owner-option"]')).toHaveLength(3);
    wrapper.unmount();
  });

  it('single-select updates immediately on row click', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountSelector({ onUpdate, multiSelect: false });
    await openPopover(wrapper);
    expect(bodyQuery('[data-testid="selectable-list-update-btn"]')).toBeNull();
    (bodyQueryAll('[data-testid="owner-option"]')[0] as HTMLElement).click();
    await flushPromises();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [user] = onUpdate.mock.calls[0] as [{ id?: string }];
    expect(user.id).toBe('u1');
    wrapper.unmount();
  });

  it('filterCurrentUser removes the current user from results', async () => {
    const wrapper = mountSelector({ filterCurrentUser: true });
    await openPopover(wrapper);
    const options = bodyQueryAll('[data-testid="owner-option"]');
    expect(options.map((option) => option.textContent)).not.toContain('Alice');
    expect(options).toHaveLength(2);
    wrapper.unmount();
  });

  it('renders the bot indicator for bot users when includeBot is set', async () => {
    const bot = makeUser({ id: 'u9', name: 'ingestion-bot', displayName: 'Ingestion Bot', isBot: true });
    listUsersMock.mockResolvedValue({ data: [bot], total: 1 });
    const wrapper = mountSelector({ includeBot: true });
    await openPopover(wrapper);
    expect(listUsersMock).toHaveBeenCalledWith({ limit: 25, after: undefined });
    expect(bodyQuery('[data-testid="bot-indicator"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('default trigger is disabled without permission', async () => {
    const wrapper = mountSelector({ hasPermission: false }, null);
    const trigger = wrapper.find('[data-testid="add-user"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
