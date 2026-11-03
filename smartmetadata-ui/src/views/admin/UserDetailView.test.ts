/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import UserDetailView from './UserDetailView.vue';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listPersonalTokens: vi.fn(),
  createPersonalToken: vi.fn(),
  revokePersonalTokens: vi.fn(),
  generateUserToken: vi.fn(),
}));

vi.mock('@/api/users', async () => {
  const actual = await vi.importActual<typeof import('@/api/users')>('@/api/users');
  return {
    ...actual,
    getUser: mocks.getUser,
    listPersonalTokens: mocks.listPersonalTokens,
    createPersonalToken: mocks.createPersonalToken,
    revokePersonalTokens: mocks.revokePersonalTokens,
    generateUserToken: mocks.generateUserToken,
  };
});

vi.mock('@/api/roles', () => ({ listRoles: vi.fn(async () => ({ data: [], paging: { total: 0 } })) }));
vi.mock('@/api/teams', () => ({ listTeams: vi.fn(async () => ({ data: [], paging: { total: 0 } })) }));

async function mountDetail(viewedId: string, sessionUser: { id: string; name: string; isAdmin?: boolean }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = sessionUser;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>users</div>' } },
      { path: '/admin/users/:id', name: 'admin-user', component: UserDetailView, props: true },
    ],
  });
  await router.push({ name: 'admin-user', params: { id: viewedId } });
  await router.isReady();
  const wrapper = mount(UserDetailView, {
    props: { id: viewedId },
    attachTo: document.body,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

async function openTokensTab(wrapper: ReturnType<typeof mount>) {
  const tabs = wrapper.findAll('.ant-tabs-tab');
  const tokensTab = tabs.find((tab) => tab.text().includes('Access tokens'));
  expect(tokensTab).toBeTruthy();
  await tokensTab!.trigger('click');
  await flushPromises();
}

describe('UserDetailView tokens (P2 B5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockImplementation(async (id: string) => ({
      id,
      name: id === 'u1' ? 'alice' : 'admin',
      displayName: id === 'u1' ? 'Alice' : 'Admin',
      isAdmin: false,
      isBot: false,
      roles: [],
      teams: [],
    }));
    mocks.listPersonalTokens.mockResolvedValue({
      data: [{ token: 'tok-1', tokenName: 'cli', tokenType: 'PERSONAL', expiryDate: '2026-12-01' }],
      paging: { total: 1 },
    });
    mocks.createPersonalToken.mockResolvedValue({ token: 'tok-2', tokenName: 'mycli', secret: 'secret-xyz' });
    mocks.generateUserToken.mockResolvedValue({ token: 'tok-3', secret: 'secret-abc' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the own PAT list on the tokens tab for the own profile', async () => {
    const wrapper = await mountDetail('u1', { id: 'u1', name: 'alice' });
    await openTokensTab(wrapper);
    expect(mocks.listPersonalTokens).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="pat-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('cli');
    expect(wrapper.find('[data-testid="pat-admin-generate"]').exists()).toBe(false);
  });

  it('creates a token with the entered name and default expiry, then shows the secret once', async () => {
    const wrapper = await mountDetail('u1', { id: 'u1', name: 'alice' });
    await openTokensTab(wrapper);
    await wrapper.find('[data-testid="pat-name"]').setValue('mycli');
    await wrapper.find('[data-testid="pat-generate"]').trigger('click');
    await flushPromises();
    expect(mocks.createPersonalToken).toHaveBeenCalledWith('mycli', '30');
    expect(wrapper.find('[data-testid="pat-created-secret"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('secret-xyz');
  });

  it('shows the admin generate + revoke-all area when an admin views another user', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openTokensTab(wrapper);
    expect(wrapper.find('[data-testid="pat-admin-generate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pat-revoke-all"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pat-name"]').exists()).toBe(false);
    await wrapper.find('[data-testid="pat-admin-generate"]').trigger('click');
    await flushPromises();
    expect(mocks.generateUserToken).toHaveBeenCalledWith('u1', '30');
    expect(wrapper.find('[data-testid="pat-admin-secret"]').exists()).toBe(true);
  });
});
