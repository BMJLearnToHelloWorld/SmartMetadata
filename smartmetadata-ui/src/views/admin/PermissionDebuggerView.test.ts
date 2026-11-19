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
import Antd, { Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import PermissionDebuggerView from './PermissionDebuggerView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEBUG_INFO = {
  user: { id: 'u1', name: 'bob', displayName: 'Bob', type: 'user' },
  directRoles: [
    {
      role: { id: 'r1', name: 'DataConsumer', type: 'role' },
      source: 'DIRECT_ASSIGNMENT',
      policies: [
        {
          policy: { id: 'p1', name: 'DataConsumerPolicy', type: 'policy' },
          effect: 'ALLOW',
          rules: [
            {
              name: 'ViewData',
              effect: 'ALLOW',
              operations: ['ViewAll'],
              resources: ['table'],
              matches: true,
            },
          ],
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

const EVALUATION = {
  user: { id: 'u1', name: 'bob', type: 'user' },
  resource: 'table',
  resourceId: 'svc.db.tbl',
  operation: 'ViewAll',
  allowed: true,
  finalDecision: 'ALLOWED',
  evaluationSteps: [
    {
      stepNumber: 1,
      source: 'DIRECT_ROLE',
      sourceEntity: { id: 'r1', name: 'DataConsumer', type: 'role' },
      policy: { id: 'p1', name: 'DataConsumerPolicy', type: 'policy' },
      rule: 'ViewData',
      effect: 'ALLOW',
      matched: true,
      matchReason: 'Rule matched resource and operation',
      conditionEvaluations: [],
    },
  ],
  summary: {
    totalPoliciesEvaluated: 1,
    totalRulesEvaluated: 1,
    matchingRules: 1,
    denyRules: 0,
    allowRules: 1,
    appliedPolicies: ['DataConsumerPolicy'],
    reasonsForDecision: ['Allowed by DataConsumerPolicy'],
    evaluationTimeMs: 3,
  },
};

function stubFetch(
  options: {
    debugStatus?: number;
    evaluateStatus?: number;
    searchDisplayName?: string | null;
  } = {},
): void {
  const displayName = options.searchDisplayName === undefined ? 'Bob' : options.searchDisplayName;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/search/query')) {
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _index: 'user_search_index',
                _id: 'u1',
                _source: {
                  id: 'u1',
                  name: 'bob',
                  ...(displayName === null ? {} : { displayName }),
                  entityType: 'user',
                },
              },
            ],
          },
        });
      }
      if (url.includes('/v1/permissions/debug/user/')) {
        return jsonResponse(
          options.debugStatus === 403 ? { message: 'Forbidden' } : DEBUG_INFO,
          options.debugStatus ?? 200,
        );
      }
      if (url.includes('/v1/permissions/debug/evaluate')) {
        return jsonResponse(
          options.evaluateStatus === 403 ? { message: 'Forbidden' } : EVALUATION,
          options.evaluateStatus ?? 200,
        );
      }
      return jsonResponse({});
    }),
  );
}

async function mountDebugger(
  asAdmin = true,
  fetchOptions: { debugStatus?: number; searchDisplayName?: string | null } = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'mallory' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/permission-debugger',
        name: 'admin-settings-permission-debugger',
        component: PermissionDebuggerView,
      },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/policies/:fqn', name: 'admin-policy', component: { template: '<div>policy</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
      { path: '/forbidden', name: 'forbidden', component: { template: '<div>forbidden</div>' } },
    ],
  });
  await router.push('/admin/settings/permission-debugger');
  await router.isReady();
  stubFetch(fetchOptions);
  const wrapper = mount(PermissionDebuggerView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

async function selectUser(
  wrapper: Awaited<ReturnType<typeof mountDebugger>>['wrapper'],
): Promise<void> {
  const input = wrapper.find('[data-testid="permission-debugger-user-search"]');
  await input.setValue('bob');
  await vi.advanceTimersByTimeAsync(400);
  await flushPromises();
  const option = wrapper.find('[data-testid="permission-debugger-user-option-bob"]');
  expect(option.exists()).toBe(true);
  await option.trigger('click');
  await flushPromises();
}

describe('PermissionDebuggerView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders without a view-level admin check, with the breadcrumb and no page header', async () => {
    // The admin gate lives at the router level (03 §10.8); the view no
    // longer repeats it, and the PageHeader is deleted (#14).
    const { wrapper } = await mountDebugger(false);
    expect(wrapper.find('[data-testid="permission-debugger"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="permission-debugger-title"]').exists()).toBe(false);
    const items = wrapper.getComponent(SmBreadcrumb).props('items') as Array<{ label: string }>;
    expect(items.map((item) => item.label)).toEqual([
      'Settings',
      'Access Control',
      'Permission Debugger',
    ]);
  });

  it('labels a user without a display name as "name (name)"', async () => {
    const { wrapper } = await mountDebugger(true, { searchDisplayName: null });
    const input = wrapper.find('[data-testid="permission-debugger-user-search"]');
    await input.setValue('bob');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    const option = wrapper.find('[data-testid="permission-debugger-user-option-bob"]');
    expect(option.exists()).toBe(true);
    expect(option.text()).toBe('bob (bob)');
  });

  it('searches users, selects one, and renders the debug info sections', async () => {
    const { wrapper } = await mountDebugger(true);
    await selectUser(wrapper);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/permissions/debug/user/bob'),
      expect.anything(),
    );
    const text = wrapper.text();
    expect(text).toContain('Bob');
    expect(text).toContain('DataConsumer');
    expect(text).toContain('Engineering');
    expect(text).toContain('DOMAIN_ACCESS');
    expect(text).toContain('ViewAll');
    expect(text).toContain('Delete');
  });

  it('evaluates an operation and renders the decision, steps, and reasons', async () => {
    const { wrapper } = await mountDebugger(true);
    await selectUser(wrapper);
    const selects = wrapper.findAllComponents(Select);
    expect(selects.length).toBe(2);
    await selects[0].vm.$emit('update:value', 'table');
    await selects[0].vm.$emit('change', 'table');
    await selects[1].vm.$emit('update:value', 'ViewAll');
    await selects[1].vm.$emit('change', 'ViewAll');
    await flushPromises();
    const resourceId = wrapper.find('[data-testid="permission-debugger-resource-id"]');
    await resourceId.setValue('svc.db.tbl');
    const button = wrapper.find('[data-testid="permission-debugger-evaluate"]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    const result = wrapper.find('[data-testid="permission-debugger-evaluation-result"]');
    expect(result.exists()).toBe(true);
    expect(result.text()).toContain('DataConsumerPolicy');
    expect(result.text()).toContain('ViewData');
    expect(result.text()).toContain('Allowed by DataConsumerPolicy');
    expect(result.text()).toContain('ALLOWED');
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/v1/permissions/debug/evaluate'))).toBe(true);
    expect(calls.some((url) => url.includes('user=bob') && url.includes('resourceId=svc.db.tbl'))).toBe(true);
  });

  it('keeps the evaluate button enabled and validates on click', async () => {
    const { wrapper } = await mountDebugger(true);
    await selectUser(wrapper);
    const button = wrapper.find('[data-testid="permission-debugger-evaluate"]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    const calls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes('/v1/permissions/debug/evaluate'))).toBe(false);
    expect(wrapper.text()).toContain('Resource is required');
    expect(wrapper.text()).toContain('Operation is required');
  });

  it('keeps the previous result on evaluation failure and toasts the error', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountDebugger(true);
    await selectUser(wrapper);
    const selects = wrapper.findAllComponents(Select);
    await selects[0].vm.$emit('update:value', 'table');
    await selects[0].vm.$emit('change', 'table');
    await selects[1].vm.$emit('update:value', 'ViewAll');
    await selects[1].vm.$emit('change', 'ViewAll');
    await flushPromises();
    await wrapper.find('[data-testid="permission-debugger-evaluate"]').trigger('click');
    await flushPromises();
    expect(
      wrapper.find('[data-testid="permission-debugger-evaluation-result"]').exists(),
    ).toBe(true);
    stubFetch({ evaluateStatus: 403 });
    await wrapper.find('[data-testid="permission-debugger-evaluate"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Forbidden');
    const result = wrapper.find('[data-testid="permission-debugger-evaluation-result"]');
    expect(result.exists()).toBe(true);
    expect(result.text()).toContain('DataConsumerPolicy');
    expect(wrapper.find('[data-testid="permission-debugger-evaluate-error"]').exists()).toBe(false);
  });

  it('surfaces a 403 on another user’s debug info as an error, not empty data', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountDebugger(true, { debugStatus: 403 });
    await selectUser(wrapper);
    expect(errorSpy).toHaveBeenCalledWith('Forbidden');
    expect(wrapper.find('[data-testid="permission-debugger-user-permissions"]').text()).not.toContain(
      'DataConsumer',
    );
  });
});
