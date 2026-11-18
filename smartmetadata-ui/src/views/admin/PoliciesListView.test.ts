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
import Antd, { Modal } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { createTestI18n } from '@/test/i18n';
import PoliciesListView from './PoliciesListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function permissionResponse(resource: string, operations: string[]) {
  return {
    resource,
    permissions: operations.map((operation) => ({ operation, access: 'allow' })),
  };
}

function policyRow(id: string, name: string, displayName: string) {
  return {
    id,
    name,
    fullyQualifiedName: name,
    displayName,
    description: 'Policy description',
    enabled: true,
    owners: [],
    roles: [{ id: 'r1', name: 'DataConsumer', fullyQualifiedName: 'DataConsumer' }],
    teams: [],
    rules: [{ name: `${name}-Rule`, effect: 'allow', operations: ['ViewAll'], resources: ['all'] }],
  };
}

async function mountPolicies(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/policies', name: 'admin-policies', component: PoliciesListView },
      { path: '/admin/policies/:fqn', name: 'admin-policy', component: { template: '<div>policy</div>' } },
      { path: '/admin/policies/add', name: 'admin-policy-add', component: { template: '<div>add</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
    ],
  });
  await router.push('/admin/policies');
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(PoliciesListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch(grants: { policy?: string[]; role?: string[] } = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/permissions/policy')) {
      return jsonResponse(permissionResponse('policy', grants.policy ?? ['Create', 'Delete', 'ViewAll']));
    }
    if (url.includes('/api/v1/permissions/role')) {
      return jsonResponse(permissionResponse('role', grants.role ?? ['ViewAll']));
    }
    if (url.includes('/api/v1/policies') && init?.method === 'DELETE') {
      return new Response(null, { status: 200 });
    }
    if (url.includes('/api/v1/policies')) {
      return jsonResponse({
        data: [policyRow('p1', 'DataConsumerPolicy', 'Data Consumer')],
        paging: { total: 1 },
      });
    }
    return new Response('not found', { status: 404 });
  };
}

describe('PoliciesListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders exactly four columns with the roles column kept and rowKey id', async () => {
    const { wrapper } = await mountPolicies(defaultFetch());
    const shell = wrapper.getComponent(EntityListShell);
    const columns = shell.props('columns') as Array<{ key: string }>;
    expect(columns.map((column) => column.key)).toEqual(['name', 'description', 'roles', 'actions']);
    expect(shell.props('rowKey')).toBe('id');
    expect(shell.props('showRowActions')).toBe(false);
    expect(shell.props('showEditAction')).toBe(false);
    expect(shell.props('showDeleteAction')).toBe(false);
    expect(wrapper.find('[data-testid="row-overflow-p1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Consumer');
    expect(wrapper.text()).toContain('DataConsumer');
  });

  it('fetches fields=roles with the default page size 15', async () => {
    const fetchMock = vi.fn(defaultFetch());
    await mountPolicies(fetchMock);
    const listCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/policies') && !url.includes('/permissions'));
    expect(listCalls.length).toBeGreaterThanOrEqual(1);
    const url = decodeURIComponent(listCalls[0]!);
    expect(url).toContain('fields=roles');
    expect(url).toContain('limit=15');
  });

  it('opens policy detail on name click with the FQN param', async () => {
    const { wrapper, router } = await mountPolicies(defaultFetch());
    const link = wrapper.find('[data-testid="policy-name"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy');
    expect(router.currentRoute.value.params.fqn).toBe('DataConsumerPolicy');
  });

  it('shows the add button only with Create and navigates to the add page', async () => {
    const denied = await mountPolicies(defaultFetch({ policy: ['ViewAll'] }));
    expect(denied.wrapper.find('[data-testid="add-policy"]').exists()).toBe(false);
    denied.wrapper.unmount();
    const granted = await mountPolicies(defaultFetch());
    await granted.wrapper.get('[data-testid="add-policy"]').trigger('click');
    await flushPromises();
    expect(granted.router.currentRoute.value.name).toBe('admin-policy-add');
  });

  it('shows Empty when GET /v1/policies returns no data, with the gated create action', async () => {
    const { wrapper } = await mountPolicies(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/permissions/')) {
        const resource = url.includes('/policy') ? 'policy' : 'role';
        return jsonResponse(permissionResponse(resource, ['Create', 'Delete', 'ViewAll']));
      }
      return jsonResponse({ data: [], paging: { total: 0 } });
    });
    expect(wrapper.find('[data-testid="entity-list-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-policies-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-policy-empty"]').exists()).toBe(true);
  });

  it('deletes through the hardDelete wire and reloads from the first page', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const configs: Array<{ onOk?: () => unknown }> = [];
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      configs.push(config as { onOk?: () => unknown });
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const { wrapper } = await mountPolicies(fetchMock);
    await wrapper.get('[data-testid="delete-action-Data Consumer"]').trigger('click');
    await flushPromises();
    expect(configs).toHaveLength(1);
    await configs[0]!.onOk?.();
    await flushPromises();
    const deleteCalls = fetchMock.mock.calls.filter(
      (call) => String(call[1]?.method).toUpperCase() === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
    const parsed = new URL(String(deleteCalls[0]![0]));
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/policies/p1?hardDelete=true&recursive=false');
  });

  it('never opens the delete confirm without the Delete grant (03 §6.2 gate)', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm');
    const { wrapper } = await mountPolicies(defaultFetch({ policy: ['Create', 'ViewAll'] }));
    const button = wrapper.find('[data-testid="delete-action-Data Consumer"]');
    expect(button.attributes('disabled')).toBeDefined();
    // A disabled button cannot be clicked; the gate is the handler guard,
    // so the spy must stay silent even after the (no-op) trigger attempt.
    await button.trigger('click');
    await flushPromises();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('requests the next cursor page from GET /v1/policies', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/permissions/')) {
        const resource = url.includes('/policy') ? 'policy' : 'role';
        return jsonResponse(permissionResponse(resource, ['Create', 'Delete', 'ViewAll']));
      }
      if (url.includes('/api/v1/policies')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            after === 'c1'
              ? policyRow('p2', 'OrganizationPolicy', 'Organization')
              : policyRow('p1', 'DataConsumerPolicy', 'Data Consumer'),
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    const { wrapper } = await mountPolicies(fetchMock);
    expect(wrapper.text()).toContain('Data Consumer');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const policyCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/policies') && !url.includes('/permissions'));
    expect(policyCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Organization');
  });
});
