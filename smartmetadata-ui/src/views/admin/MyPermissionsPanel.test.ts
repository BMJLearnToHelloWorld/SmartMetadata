/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { PermissionDebugInfo } from '@/api/permissions';
import MyPermissionsPanel from './MyPermissionsPanel.vue';

const mocks = vi.hoisted(() => ({
  debugMyPermissions: vi.fn(),
}));

vi.mock('@/api/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/api/permissions')>('@/api/permissions');
  return { ...actual, debugMyPermissions: mocks.debugMyPermissions };
});

const INFO: PermissionDebugInfo = {
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
  teamPermissions: [
    {
      team: { id: 't1', name: 'Engineering', type: 'team' },
      teamHierarchy: [{ id: 't1', name: 'Engineering', type: 'team' }],
      teamType: 'Group',
      hierarchyLevel: 0,
      rolePermissions: [],
      directPolicies: [],
    },
  ],
  inheritedPermissions: [
    {
      permissionType: 'DOMAIN_ACCESS',
      source: { id: 'd1', name: 'Finance', type: 'domain' },
      description: 'Domain access for Finance',
      policies: [],
    },
  ],
  summary: {
    totalRoles: 1,
    totalPolicies: 1,
    totalRules: 1,
    directRoles: 1,
    inheritedRoles: 0,
    teamCount: 1,
    maxHierarchyDepth: 0,
    effectiveOperations: ['ViewAll'],
    deniedOperations: ['Delete'],
  },
};

function mountPanel(active: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles/:id', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/policies/:id', name: 'admin-policy', component: { template: '<div>policy</div>' } },
    ],
  });
  return mount(MyPermissionsPanel, {
    props: { active },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
}

describe('MyPermissionsPanel', () => {
  it('does not fetch while the tab is inactive', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const wrapper = mountPanel(false);
    await flushPromises();
    expect(mocks.debugMyPermissions).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="my-permissions-panel"]').exists()).toBe(false);
  });

  it('fetches debug/me on activation and renders summary, roles, teams, and inherited permissions', async () => {
    mocks.debugMyPermissions.mockResolvedValue(INFO);
    const wrapper = mountPanel(false);
    await wrapper.setProps({ active: true });
    await flushPromises();
    expect(mocks.debugMyPermissions).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="my-permissions-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('DataConsumer');
    expect(wrapper.text()).toContain('Engineering');
    expect(wrapper.text()).toContain('Finance');
    expect(wrapper.text()).toContain('ViewAll');
  });

  it('shows a 403 as an error, never as empty data', async () => {
    mocks.debugMyPermissions.mockRejectedValue(new Error('Request failed with status code 403'));
    const wrapper = mountPanel(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="my-permissions-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="my-permissions-panel"]').exists()).toBe(false);
  });
});
