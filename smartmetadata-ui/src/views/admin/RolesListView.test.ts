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
import RolesListView from './RolesListView.vue';

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

const ROLE_ROW = {
  id: 'r1',
  name: 'DataSteward',
  fullyQualifiedName: 'DataSteward',
  displayName: 'Data Steward',
  description: 'Steward role',
  policies: [
    { id: 'p1', name: 'DataConsumerPolicy', fullyQualifiedName: 'DataConsumerPolicy' },
    { id: 'p2', name: 'DataStewardPolicy', fullyQualifiedName: 'DataStewardPolicy' },
  ],
  users: [{ id: 'u1', name: 'alice' }],
  teams: [],
};

async function mountRoles(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', name: 'admin-roles', component: RolesListView },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/roles/add', name: 'admin-role-add', component: { template: '<div>add</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      { path: '/admin/policies/:fqn', name: 'admin-policy', component: { template: '<div>policy</div>' } },
    ],
  });
  await router.push('/admin/roles');
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(RolesListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch(grants: { role?: string[]; policy?: string[] } = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/permissions/role')) {
      return jsonResponse(permissionResponse('role', grants.role ?? ['Create', 'Delete', 'ViewAll']));
    }
    if (url.includes('/api/v1/permissions/policy')) {
      return jsonResponse(permissionResponse('policy', grants.policy ?? ['ViewAll']));
    }
    if (url.includes('/api/v1/roles') && init?.method === 'DELETE') {
      return new Response(null, { status: 200 });
    }
    if (url.includes('/api/v1/roles')) {
      return jsonResponse({ data: [ROLE_ROW], paging: { total: 1 } });
    }
    return new Response('not found', { status: 404 });
  };
}

describe('RolesListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders exactly four columns with the pin keys and rowKey name', async () => {
    const { wrapper } = await mountRoles(defaultFetch());
    const shell = wrapper.getComponent(EntityListShell);
    const columns = shell.props('columns') as Array<{ key: string }>;
    expect(columns.map((column) => column.key)).toEqual(['name', 'description', 'policies', 'actions']);
    expect(shell.props('rowKey')).toBe('name');
    expect(wrapper.find('[data-testid="entity-list-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-overflow-r1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sm-breadcrumb"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Steward');
  });

  it('fetches fields=policies with the default page size 15', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRoles(fetchMock);
    expect(wrapper.text()).toContain('Data Steward');
    const listCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/roles') && !url.includes('/permissions'));
    expect(listCalls.length).toBeGreaterThanOrEqual(1);
    const url = decodeURIComponent(listCalls[0]!);
    expect(url).toContain('fields=policies');
    expect(url).toContain('limit=15');
    expect(listCalls.some((call) => call.includes('/roles/search'))).toBe(false);
  });

  it('opens role detail on name click with the FQN param', async () => {
    const { wrapper, router } = await mountRoles(defaultFetch());
    const link = wrapper.find('[data-testid="role-name"]');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-role');
    expect(router.currentRoute.value.params.fqn).toBe('DataSteward');
  });

  it('shows the add button only with Create and navigates to the add page', async () => {
    const denied = await mountRoles(defaultFetch({ role: ['ViewAll'] }));
    expect(denied.wrapper.find('[data-testid="add-role"]').exists()).toBe(false);
    denied.wrapper.unmount();
    const granted = await mountRoles(defaultFetch());
    await granted.wrapper.get('[data-testid="add-role"]').trigger('click');
    await flushPromises();
    expect(granted.router.currentRoute.value.name).toBe('admin-role-add');
  });

  it('disables delete without the Delete grant and never opens the confirm', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm');
    const { wrapper } = await mountRoles(defaultFetch({ role: ['Create', 'ViewAll'] }));
    const button = wrapper.find('[data-testid="delete-action-Data Steward"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes('disabled')).toBeDefined();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('deletes through the hardDelete wire and reloads from the first page', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const configs: Array<{ onOk?: () => unknown }> = [];
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      configs.push(config as { onOk?: () => unknown });
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const { wrapper } = await mountRoles(fetchMock);
    await wrapper.get('[data-testid="delete-action-Data Steward"]').trigger('click');
    await flushPromises();
    expect(configs).toHaveLength(1);
    await configs[0]!.onOk?.();
    await flushPromises();
    const deleteCalls = fetchMock.mock.calls.filter(
      (call) => String(call[1]?.method).toUpperCase() === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
    const parsed = new URL(String(deleteCalls[0]![0]));
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/roles/r1?hardDelete=true&recursive=false');
    const reloads = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes('/api/v1/roles') && call[1]?.method !== 'DELETE',
    );
    expect(reloads.length).toBeGreaterThanOrEqual(2);
    expect(String(reloads.at(-1)![0])).not.toContain('after=');
  });

  it('requests the next cursor page from GET /v1/roles', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/permissions/')) {
        const resource = url.includes('/policy') ? 'policy' : 'role';
        return jsonResponse(permissionResponse(resource, ['Create', 'Delete', 'ViewAll']));
      }
      if (url.includes('/api/v1/roles')) {
        const after = new URL(url, 'http://localhost').searchParams.get('after');
        return jsonResponse({
          data: [
            after === 'c1'
              ? { ...ROLE_ROW, id: 'r2', name: 'Analyst', fullyQualifiedName: 'Analyst', displayName: 'Analyst' }
              : ROLE_ROW,
          ],
          paging: { total: 2, after: after === 'c1' ? undefined : 'c1' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    const { wrapper } = await mountRoles(fetchMock);
    expect(wrapper.text()).toContain('Data Steward');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    const roleCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/v1/roles') && !url.includes('/permissions'));
    expect(roleCalls.some((url) => url.includes('after=c1'))).toBe(true);
    expect(wrapper.text()).toContain('Analyst');
  });
});
