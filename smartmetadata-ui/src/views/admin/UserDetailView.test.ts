/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd, { Checkbox, Select } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import UserDetailView from './UserDetailView.vue';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  patchUser: vi.fn(),
  listPersonalTokens: vi.fn(),
  createPersonalToken: vi.fn(),
  revokePersonalTokens: vi.fn(),
  generateUserToken: vi.fn(),
  debugMyPermissions: vi.fn(),
}));

vi.mock('@/api/users', async () => {
  const actual = await vi.importActual<typeof import('@/api/users')>('@/api/users');
  return {
    ...actual,
    getUser: mocks.getUser,
    patchUser: mocks.patchUser,
    listPersonalTokens: mocks.listPersonalTokens,
    createPersonalToken: mocks.createPersonalToken,
    revokePersonalTokens: mocks.revokePersonalTokens,
    generateUserToken: mocks.generateUserToken,
  };
});

vi.mock('@/api/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/api/permissions')>('@/api/permissions');
  return { ...actual, debugMyPermissions: mocks.debugMyPermissions };
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
      { path: '/admin/roles/:id', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/policies/:id', name: 'admin-policy', component: { template: '<div>policy</div>' } },
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

describe('UserDetailView my permissions tab', () => {
  const myInfo = {
    user: { id: 'u1', name: 'alice', type: 'user' },
    directRoles: [
      {
        role: { id: 'r1', name: 'DataConsumer', type: 'role' },
        source: 'DIRECT_ASSIGNMENT',
        policies: [
          {
            policy: { id: 'p1', name: 'DataConsumerPolicy', type: 'policy' },
            effect: 'ALLOW',
            rules: [{ name: 'ViewData', effect: 'ALLOW', operations: ['ViewAll'], resources: ['table'], matches: true }],
          },
        ],
      },
    ],
    teamPermissions: [],
    inheritedPermissions: [],
    summary: {
      totalRoles: 1,
      totalPolicies: 1,
      totalRules: 1,
      directRoles: 1,
      inheritedRoles: 0,
      teamCount: 0,
      maxHierarchyDepth: 0,
      effectiveOperations: ['ViewAll'],
      deniedOperations: [],
    },
  };

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
    mocks.debugMyPermissions.mockResolvedValue(myInfo);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openPermissionsTab(wrapper: ReturnType<typeof mount>) {
    const tabs = wrapper.findAll('.ant-tabs-tab');
    const tab = tabs.find((item) => item.text().includes('My permissions'));
    expect(tab).toBeTruthy();
    await tab!.trigger('click');
    await flushPromises();
  }

  function hasPermissionsTab(wrapper: ReturnType<typeof mount>) {
    return wrapper
      .findAll('.ant-tabs-tab')
      .some((item) => item.text().includes('My permissions'));
  }

  it('shows the tab on the own profile and loads debug/me without any admin gate', async () => {
    const wrapper = await mountDetail('u1', { id: 'u1', name: 'alice' });
    expect(hasPermissionsTab(wrapper)).toBe(true);
    await openPermissionsTab(wrapper);
    expect(mocks.debugMyPermissions).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="my-permissions-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('DataConsumer');
  });

  it('hides the tab when an admin views another user', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    expect(hasPermissionsTab(wrapper)).toBe(false);
  });

  it('hides the tab when a non-admin views another user', async () => {
    const wrapper = await mountDetail('u2', { id: 'u1', name: 'alice' });
    expect(hasPermissionsTab(wrapper)).toBe(false);
  });
});

describe('UserDetailView P1 dual line', () => {
  let userGrant: 'deny' | 'grant' = 'deny';

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    userGrant = 'deny';
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/user/u1')) {
          if (userGrant === 'grant') {
            return jsonResponse({
              resource: 'user',
              permissions: [{ operation: 'EditAll', access: 'allow' }],
            });
          }
          return new Response('not found', { status: 404 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('hides the edit button for a non-admin without a grant', async () => {
    const wrapper = await mountDetail('u1', { id: 'u9', name: 'bob' });
    expect(wrapper.find('[data-testid="edit-user"]').exists()).toBe(false);
  });

  it('shows the edit button for a non-admin with an EditAll grant', async () => {
    userGrant = 'grant';
    const wrapper = await mountDetail('u1', { id: 'u9', name: 'bob' });
    expect(wrapper.find('[data-testid="edit-user"]').exists()).toBe(true);
  });
});

describe('UserDetailView edit saves with JSON Patch', () => {
  const userFixture = {
    id: 'u1',
    name: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    description: 'About Alice',
    isAdmin: false,
    isBot: false,
    roles: [
      { id: 'r1', name: 'DataConsumer', type: 'role' },
      { id: 'r2', name: 'DataSteward', type: 'role' },
    ],
    teams: [
      { id: 't1', name: 'Engineering', type: 'team' },
      { id: 't2', name: 'Data', type: 'team' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue(userFixture);
    mocks.patchUser.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function openEdit(wrapper: Awaited<ReturnType<typeof mountDetail>>) {
    await wrapper.find('[data-testid="edit-user"]').trigger('click');
    await flushPromises();
  }

  async function saveModal() {
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
  }

  function modalInput(currentValue: string) {
    const input = Array.from(document.body.querySelectorAll('.ant-modal input')).find(
      (element) => (element as HTMLInputElement).value === currentValue,
    );
    expect(input).toBeDefined();
    return new DOMWrapper(input as HTMLInputElement);
  }

  function modalDescription() {
    const textarea = document.body.querySelector('.ant-modal textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    return new DOMWrapper(textarea!);
  }

  async function setSelectIds(
    wrapper: Awaited<ReturnType<typeof mountDetail>>,
    currentIds: string[],
    nextIds: string[],
  ) {
    const selects = wrapper
      .findAllComponents(Select)
      .filter((select) => JSON.stringify(select.props('value')) === JSON.stringify(currentIds));
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      await select.vm.$emit('update:value', nextIds);
    }
    await flushPromises();
  }

  function lastPatchArgs(): [string, unknown[]] {
    const call = mocks.patchUser.mock.calls.at(-1);
    expect(call).toBeDefined();
    return call as [string, unknown[]];
  }

  it('sends only the changed display name as a patch op', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('Alice').setValue('Alicia');
    await saveModal();
    expect(mocks.patchUser).toHaveBeenCalledTimes(1);
    expect(lastPatchArgs()).toEqual([
      'u1',
      [{ op: 'replace', path: '/displayName', value: 'Alicia' }],
    ]);
  });

  it('sends remove ops when display name and description are cleared', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('Alice').setValue('');
    await modalDescription().setValue('');
    await saveModal();
    expect(lastPatchArgs()).toEqual([
      'u1',
      [
        { op: 'remove', path: '/displayName' },
        { op: 'remove', path: '/description' },
      ],
    ]);
  });

  it('sends team, role, and admin ops with entity refs when they change', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await setSelectIds(wrapper, ['t1', 't2'], ['t2']);
    await setSelectIds(wrapper, ['r1', 'r2'], ['r2']);
    const checkbox = wrapper.findComponent(Checkbox);
    expect(checkbox.exists()).toBe(true);
    await checkbox.vm.$emit('update:checked', true);
    await flushPromises();
    await saveModal();
    expect(lastPatchArgs()).toEqual([
      'u1',
      [
        { op: 'replace', path: '/isAdmin', value: true },
        { op: 'replace', path: '/teams', value: [{ id: 't2', type: 'team' }] },
        { op: 'replace', path: '/roles', value: [{ id: 'r2', type: 'role' }] },
      ],
    ]);
  });

  it('never sends email or unowned-field ops, even when the email input changes', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('alice@example.com').setValue('new@example.com');
    await modalInput('Alice').setValue('Alicia');
    await saveModal();
    const [, ops] = lastPatchArgs();
    expect(ops).toEqual([{ op: 'replace', path: '/displayName', value: 'Alicia' }]);
    const paths = (ops as Array<{ path: string }>).map((op) => op.path);
    expect(paths).not.toContain('/email');
    expect(paths).not.toContain('/personas');
    expect(paths).not.toContain('/defaultPersona');
    expect(paths).not.toContain('/profile');
    expect(paths).not.toContain('/timezone');
    expect(paths).not.toContain('/domains');
  });

  it('sends an empty patch array when nothing changed', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await saveModal();
    expect(mocks.patchUser).toHaveBeenCalledTimes(1);
    expect(lastPatchArgs()).toEqual(['u1', []]);
  });

  it('sends no op for whitespace-only text edits or reordered teams and roles', async () => {
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('Alice').setValue('  Alice  ');
    await modalDescription().setValue('  About Alice  ');
    await setSelectIds(wrapper, ['t1', 't2'], ['t2', 't1']);
    await setSelectIds(wrapper, ['r1', 'r2'], ['r2', 'r1']);
    await saveModal();
    expect(lastPatchArgs()).toEqual(['u1', []]);
  });

  it('sends no op when clearing a text field that was already absent', async () => {
    mocks.getUser.mockResolvedValue({
      id: 'u1',
      name: 'alice',
      email: 'alice@example.com',
      isBot: false,
      roles: [],
      teams: [],
    });
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('').setValue('   ');
    await saveModal();
    expect(lastPatchArgs()).toEqual(['u1', []]);
  });

  it('sends no op when the stored value only differs by surrounding whitespace', async () => {
    mocks.getUser.mockResolvedValue({
      ...userFixture,
      displayName: '  Alice  ',
      description: '  About Alice  ',
    });
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('  Alice  ').setValue('Alice');
    await modalDescription().setValue('About Alice');
    await saveModal();
    expect(mocks.patchUser).toHaveBeenCalledTimes(1);
    expect(lastPatchArgs()).toEqual(['u1', []]);
  });

  it('sends the trimmed form value when a stored padded value really changes', async () => {
    mocks.getUser.mockResolvedValue({
      ...userFixture,
      displayName: '  Alice  ',
      description: '  About Alice  ',
    });
    const wrapper = await mountDetail('u1', { id: 'admin', name: 'admin', isAdmin: true });
    await openEdit(wrapper);
    await modalInput('  Alice  ').setValue('  Alicia  ');
    await modalDescription().setValue('  About Alicia  ');
    await saveModal();
    expect(lastPatchArgs()).toEqual([
      'u1',
      [
        { op: 'replace', path: '/displayName', value: 'Alicia' },
        { op: 'replace', path: '/description', value: 'About Alicia' },
      ],
    ]);
  });
});
