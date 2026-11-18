/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { PermissionDebugInfo } from '@/api/permissions';
import UserPermissionsPanel from './UserPermissionsPanel.vue';

const mocks = vi.hoisted(() => ({
  debugMyPermissions: vi.fn(),
  debugUserPermissions: vi.fn(),
}));

vi.mock('@/api/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/api/permissions')>('@/api/permissions');
  return {
    ...actual,
    debugMyPermissions: mocks.debugMyPermissions,
    debugUserPermissions: mocks.debugUserPermissions,
  };
});

/**
 * Full debug payload: every ref carries an FQN, and every one of the
 * four policy contexts carries a rule with operations, resources, and
 * a condition, each marked with a context-unique token so the shared
 * renderRule coverage is provable per context. The inherited section
 * covers all three source shapes the server emits: a domain source
 * (unwired in this tree, plain text), a wired table source (asset
 * link), and a sourceless ADMIN entry.
 */
const INFO: PermissionDebugInfo = {
  user: { id: 'u1', name: 'alice', type: 'user', fullyQualifiedName: 'alice' },
  directRoles: [
    {
      role: {
        id: 'r1',
        name: 'DataConsumer',
        displayName: 'Data Consumer',
        type: 'role',
        fullyQualifiedName: 'DataConsumer',
      },
      source: 'DIRECT_ASSIGNMENT',
      policies: [
        {
          policy: {
            id: 'p1',
            name: 'DataConsumerPolicy',
            type: 'policy',
            fullyQualifiedName: 'DataConsumerPolicy',
          },
          effect: 'ALLOW',
          rules: [
            {
              name: 'ViewRule',
              effect: 'ALLOW',
              operations: ['op-direct'],
              resources: ['res-direct'],
              condition: 'cond-direct',
              matches: true,
            },
          ],
        },
      ],
    },
  ],
  teamPermissions: [
    {
      team: {
        id: 't1',
        name: 'Engineering',
        type: 'team',
        fullyQualifiedName: 'Engineering',
      },
      teamHierarchy: [
        { id: 't0', name: 'Organization', type: 'team', fullyQualifiedName: 'Organization' },
        { id: 't1', name: 'Engineering', type: 'team', fullyQualifiedName: 'Engineering' },
        {
          id: 't2',
          name: 'Platform',
          displayName: 'Platform Team',
          type: 'team',
          fullyQualifiedName: 'Engineering.Platform',
        },
      ],
      teamType: 'Group',
      hierarchyLevel: 1,
      rolePermissions: [
        {
          role: {
            id: 'r2',
            name: 'TeamRole',
            type: 'role',
            fullyQualifiedName: 'TeamRole',
          },
          policies: [
            {
              policy: {
                id: 'p2',
                name: 'TeamPolicy',
                type: 'policy',
                fullyQualifiedName: 'TeamPolicy',
              },
              effect: 'DENY',
              rules: [
                {
                  name: 'TeamRule',
                  effect: 'DENY',
                  operations: ['op-teamrole'],
                  resources: ['res-teamrole'],
                  condition: 'cond-teamrole',
                  matches: false,
                },
              ],
            },
          ],
          inheritedFrom: 'Engineering',
          isDefaultRole: true,
        },
      ],
      directPolicies: [
        {
          policy: {
            id: 'p3',
            name: 'DirectTeamPolicy',
            type: 'policy',
            fullyQualifiedName: 'DirectTeamPolicy',
          },
          effect: 'CONDITIONAL',
          rules: [
            {
              name: 'DirectTeamRule',
              effect: 'DENY',
              operations: ['op-teamdirect'],
              resources: ['res-teamdirect'],
              condition: 'cond-teamdirect',
              matches: true,
            },
          ],
        },
      ],
    },
  ],
  inheritedPermissions: [
    {
      permissionType: 'DOMAIN_ACCESS',
      source: {
        id: 'd1',
        name: 'Finance',
        type: 'domain',
        fullyQualifiedName: 'Finance',
      },
      description: 'Access to domain: Finance',
      policies: [
        {
          policy: {
            id: 'p4',
            name: 'InheritedPolicy',
            type: 'policy',
            fullyQualifiedName: 'InheritedPolicy',
          },
          effect: 'ALLOW',
          rules: [
            {
              name: 'InheritedRule',
              effect: 'ALLOW',
              operations: ['op-inherited'],
              resources: ['res-inherited'],
              condition: 'cond-inherited',
              matches: true,
            },
          ],
        },
      ],
    },
    {
      permissionType: 'RESOURCE_OWNER',
      source: {
        id: 'tbl1',
        name: 'orders',
        displayName: 'orders table',
        type: 'table',
        fullyQualifiedName: 'sales.public.orders',
      },
      description: 'Owner of table orders',
      policies: [],
    },
    {
      permissionType: 'ADMIN',
      description: 'User has admin privileges',
      policies: [],
    },
  ],
  summary: {
    totalRoles: 2,
    totalPolicies: 4,
    totalRules: 4,
    directRoles: 1,
    inheritedRoles: 1,
    teamCount: 1,
    maxHierarchyDepth: 2,
    effectiveOperations: ['ViewAll'],
    deniedOperations: ['DeleteAll'],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mountPanel(props: { username: string; isLoggedInUser: boolean }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      {
        path: '/admin/policies/:fqn',
        name: 'admin-policy',
        component: { template: '<div>policy</div>' },
      },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  const wrapper = mount(UserPermissionsPanel, {
    props,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  return { wrapper, router };
}

function linkHrefs(wrapper: VueWrapper): string[] {
  return wrapper.findAll('a').map((link) => link.attributes('href') ?? '');
}

describe('UserPermissionsPanel', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('fetches debug/me for the logged-in user and renders all four sections', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    expect(mocks.debugMyPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.debugUserPermissions).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Permission summary');
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.text()).toContain('Other inherited permissions');
    expect(wrapper.text()).toContain('ViewAll');
    expect(wrapper.text()).toContain('DeleteAll');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('fetches debug/user/{username} for another user', async () => {
    mocks.debugUserPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'bob', isLoggedInUser: false });
    await flushPromises();
    expect(mocks.debugUserPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.debugUserPermissions).toHaveBeenCalledWith('bob');
    expect(mocks.debugMyPermissions).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Data Consumer');
  });

  it('shows only the loading spinner while the request is pending', async () => {
    const pending = deferred<PermissionDebugInfo>();
    mocks.debugUserPermissions.mockReturnValue(pending.promise);
    const { wrapper } = mountPanel({ username: 'bob', isLoggedInUser: false });
    await flushPromises();
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Permission summary');
    pending.resolve(INFO);
    await flushPromises();
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Permission summary');
  });

  it('surfaces a fetch failure as an error toast and renders nothing', async () => {
    mocks.debugUserPermissions.mockRejectedValue(new Error('Request failed with status code 403'));
    const { wrapper } = mountPanel({ username: 'bob', isLoggedInUser: false });
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Request failed with status code 403');
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Permission summary');
  });

  it('falls back to the load-failed message for a non-Error rejection', async () => {
    mocks.debugUserPermissions.mockRejectedValue('boom');
    mountPanel({ username: 'bob', isLoggedInUser: false });
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Failed to load user permissions');
  });

  it('renders the full rule detail in all four policy contexts', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    // Expand every policy panel so rule bodies are asserted in their
    // visible state, not only as collapsed DOM.
    for (const header of wrapper.findAll('.ant-collapse-header')) {
      await header.trigger('click');
    }
    const text = wrapper.text();
    for (const token of [
      'ViewRule',
      'op-direct',
      'res-direct',
      'cond-direct',
      'TeamRule',
      'op-teamrole',
      'res-teamrole',
      'cond-teamrole',
      'DirectTeamRule',
      'op-teamdirect',
      'res-teamdirect',
      'cond-teamdirect',
      'InheritedRule',
      'op-inherited',
      'res-inherited',
      'cond-inherited',
    ]) {
      expect(text).toContain(token);
    }
  });

  it('renders policy headers with link, effect badge, and rule count', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    const headers = wrapper.findAll('.ant-collapse-header');
    expect(headers).toHaveLength(4);
    const headerTexts = headers.map((header) => header.text());
    expect(headerTexts[0]).toContain('DataConsumerPolicy');
    expect(headerTexts[0]).toContain('ALLOW');
    expect(headerTexts[0]).toContain('1 rules');
    expect(headerTexts[1]).toContain('TeamPolicy');
    expect(headerTexts[1]).toContain('DENY');
    expect(headerTexts[2]).toContain('DirectTeamPolicy');
    expect(headerTexts[2]).toContain('CONDITIONAL');
    expect(headerTexts[3]).toContain('InheritedPolicy');
    const headerLinks = headers.map(
      (header) => header.find('a').attributes('href') ?? '',
    );
    expect(headerLinks).toEqual([
      '/admin/policies/DataConsumerPolicy',
      '/admin/policies/TeamPolicy',
      '/admin/policies/DirectTeamPolicy',
      '/admin/policies/InheritedPolicy',
    ]);
  });

  it('does not toggle the accordion when the policy header link is clicked', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    const item = wrapper.find('.ant-collapse-item');
    const headerLink = wrapper.find('.ant-collapse-header a');
    await headerLink.trigger('click');
    await flushPromises();
    expect(item.classes()).not.toContain('ant-collapse-item-active');
    await wrapper.find('.ant-collapse-header').trigger('click');
    expect(item.classes()).toContain('ant-collapse-item-active');
  });

  it('links roles, teams, hierarchy levels, and wired sources by FQN', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    const hrefs = linkHrefs(wrapper);
    expect(hrefs).toContain('/admin/roles/DataConsumer');
    expect(hrefs).toContain('/admin/roles/TeamRole');
    expect(hrefs).toContain('/admin/teams/Engineering');
    expect(hrefs).toContain('/admin/teams/Organization');
    expect(hrefs).toContain('/admin/teams/Engineering.Platform');
    expect(hrefs).toContain('/assets/table/sales.public.orders');
    // Every hierarchy level is a link: the team link plus three chain links.
    expect(hrefs.filter((href) => href.startsWith('/admin/teams/'))).toHaveLength(4);
    // Separators join the three chain levels.
    expect(wrapper.text().match(/→/g)).toHaveLength(2);
  });

  it('renders unwired sources and refs without an FQN as plain text', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    // The domain source has no FQN-addressable detail route: its name
    // renders, but no link points at it.
    expect(wrapper.text()).toContain('Finance');
    expect(linkHrefs(wrapper).some((href) => href.includes('Finance'))).toBe(false);
    expect(linkHrefs(wrapper).some((href) => href.includes('domain'))).toBe(false);
  });

  it('renders a role without an FQN as plain text', async () => {
    const noFqn: PermissionDebugInfo = {
      ...INFO,
      directRoles: [
        {
          role: { id: 'r9', name: 'Nameless', type: 'role' },
          source: 'DIRECT_ASSIGNMENT',
          policies: [],
        },
      ],
      teamPermissions: [],
      inheritedPermissions: [],
    };
    mocks.debugMyPermissions.mockResolvedValue(noFqn);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Nameless');
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it('discards a superseded request when the viewed user changes', async () => {
    const first = deferred<PermissionDebugInfo>();
    const second = deferred<PermissionDebugInfo>();
    mocks.debugUserPermissions
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: false });
    await flushPromises();
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(true);
    await wrapper.setProps({ username: 'bob' });
    await flushPromises();
    // Loading restarts and stale info is cleared for the new user.
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(true);
    const stale: PermissionDebugInfo = {
      ...INFO,
      directRoles: [
        {
          role: { id: 'rx', name: 'StaleRole', type: 'role', fullyQualifiedName: 'StaleRole' },
          source: 'DIRECT_ASSIGNMENT',
          policies: [],
        },
      ],
    };
    first.resolve(stale);
    await flushPromises();
    expect(wrapper.text()).not.toContain('StaleRole');
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(true);
    second.resolve(INFO);
    await flushPromises();
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.find('[data-testid="user-permissions-loading"]').exists()).toBe(false);
  });

  it('refetches through debug/me when the logged-in flag flips', async () => {
    mocks.debugUserPermissions.mockResolvedValue(INFO);
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const { wrapper } = mountPanel({ username: 'alice', isLoggedInUser: false });
    await flushPromises();
    expect(mocks.debugUserPermissions).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ isLoggedInUser: true });
    await flushPromises();
    expect(mocks.debugMyPermissions).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Data Consumer');
  });

  it('suppresses the error toast when unmounted before the request settles', async () => {
    const pending = deferred<PermissionDebugInfo>();
    mocks.debugUserPermissions.mockReturnValue(pending.promise);
    const { wrapper } = mountPanel({ username: 'bob', isLoggedInUser: false });
    await flushPromises();
    wrapper.unmount();
    pending.reject(new Error('gone'));
    await flushPromises();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
