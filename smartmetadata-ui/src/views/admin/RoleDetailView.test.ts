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
import Antd, { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import RoleDetailView from './RoleDetailView.vue';

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
  description: 'Role description',
  policies: [
    {
      id: 'p1',
      name: 'PolicyA',
      fullyQualifiedName: 'PolicyA',
      displayName: 'Policy A',
      type: 'policy',
      description: 'policy a',
    },
  ],
  teams: [{ id: 't1', name: 'TeamA', fullyQualifiedName: 'TeamA', type: 'team' }],
  users: [{ id: 'u1', name: 'alice', fullyQualifiedName: 'alice', type: 'user' }],
};

const TEAM_ROW = {
  id: 't1',
  name: 'TeamA',
  fullyQualifiedName: 'TeamA',
  teamType: 'Group',
  users: [],
  defaultRoles: [
    { id: 'r1', name: 'DataSteward', fullyQualifiedName: 'DataSteward', type: 'role' },
    { id: 'r2', name: 'Analyst', fullyQualifiedName: 'Analyst', type: 'role' },
  ],
  parents: [],
  policies: [],
};

let stubRenameDisplayName = 'Renamed Role';
let stubAddSelectedIds: string[] = ['p1', 'p2'];

const ManageStub = defineComponent({
  props: {
    onEditDisplayName: { type: Function, required: true },
    onDelete: { type: Function, required: true },
    afterDeleteAction: { type: Function, required: true },
  },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'manage-stub' }, [
        h(
          'button',
          {
            'data-testid': 'stub-manage-rename',
            onClick: () =>
              props.onEditDisplayName({ name: 'DataSteward', displayName: stubRenameDisplayName }),
          },
          'rename',
        ),
        h(
          'button',
          {
            'data-testid': 'stub-manage-delete',
            onClick: async () => {
              if (await props.onDelete()) {
                props.afterDeleteAction();
              }
            },
          },
          'delete',
        ),
      ]);
  },
});

const DescriptionStub = defineComponent({
  props: {
    description: { type: String, default: '' },
    onDescriptionUpdate: { type: Function, required: true },
  },
  setup(props) {
    return () =>
      h('div', { 'data-testid': 'description-stub' }, [
        h('span', props.description),
        h(
          'button',
          {
            'data-testid': 'stub-desc-save',
            onClick: () => props.onDescriptionUpdate('new description'),
          },
          'save description',
        ),
      ]);
  },
});

const AddAttributeStub = defineComponent({
  props: {
    open: Boolean,
    title: String,
    selectedKeys: { type: Array, default: () => [] },
  },
  emits: ['save', 'cancel'],
  setup(props, { emit }) {
    return () =>
      props.open
        ? h('div', { 'data-testid': 'add-attribute-stub' }, [
            h('span', { 'data-testid': 'add-attribute-title' }, props.title),
            h(
              'span',
              { 'data-testid': 'add-attribute-keys' },
              (props.selectedKeys as string[]).join(','),
            ),
            h(
              'button',
              {
                'data-testid': 'stub-add-save',
                onClick: () => emit('save', [...stubAddSelectedIds]),
              },
              'save selection',
            ),
          ])
        : null;
  },
});

const ModalStub = defineComponent({
  props: { open: Boolean, title: String },
  emits: ['cancel'],
  setup(props, { slots }) {
    return () =>
      props.open
        ? h('div', { 'data-testid': 'modal-stub' }, [
            h('div', { 'data-testid': 'modal-title' }, props.title),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null;
  },
});

async function mountRole(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  routeFqn = 'DataSteward',
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', name: 'admin-roles', component: { template: '<div>roles</div>' } },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: RoleDetailView, props: true },
      { path: '/admin/policies/:fqn', name: 'admin-policy', component: { template: '<div>policy</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/users/:id', name: 'admin-user', component: { template: '<div>user</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
    ],
  });
  await router.push({ name: 'admin-role', params: { fqn: routeFqn } });
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(RoleDetailView, {
    props: { fqn: routeFqn },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: {
        AModal: ModalStub,
        AccessManageButton: ManageStub,
        AccessDescription: DescriptionStub,
        AddAttributeModal: AddAttributeStub,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch(grants: string[] = ['ViewAll', 'EditAll', 'Delete']) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/v1/permissions/role/name/')) {
      return jsonResponse(permissionResponse('role', grants));
    }
    if (url.includes('/api/v1/roles/name/')) {
      return jsonResponse(ROLE_ROW);
    }
    if (url.includes('/api/v1/teams/name/')) {
      return jsonResponse(TEAM_ROW);
    }
    if (method === 'PATCH' && url.includes('/api/v1/roles/r1')) {
      const ops = JSON.parse(String(init?.body ?? '[]')) as Array<{ path: string; value: unknown }>;
      const next = { ...ROLE_ROW };
      for (const op of ops) {
        if (op.path === '/description') next.description = op.value as string;
        if (op.path === '/displayName') next.displayName = op.value as string;
        if (op.path === '/policies') {
          next.policies = op.value as typeof ROLE_ROW.policies;
        }
      }
      return jsonResponse(next);
    }
    if (method === 'PATCH' || method === 'DELETE') {
      return new Response(null, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
}

function patchBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter((call) => String(call[1]?.method).toUpperCase() === 'PATCH')
    .map((call) => ({ url: String(call[0]), body: JSON.parse(String(call[1]?.body ?? '[]')) }));
}

describe('RoleDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubRenameDisplayName = 'Renamed Role';
    stubAddSelectedIds = ['p1', 'p2'];
  });

  it('renders the pin tabs, breadcrumb and detail lists with the policies tab first', async () => {
    const { wrapper } = await mountRole(defaultFetch());
    expect(wrapper.find('[data-testid="role-details-container"]').exists()).toBe(true);
    const activeTab = wrapper.find('.ant-tabs-tab-active');
    expect(activeTab.text()).toContain('Policies');
    expect(wrapper.text()).toContain('Teams');
    expect(wrapper.text()).toContain('Users');
    expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').text()).toContain('Roles');
    expect(wrapper.text()).toContain('Data Steward');
    expect(wrapper.find('[data-testid="description-stub"]').text()).toContain('Role description');
    expect(wrapper.find('[data-testid="manage-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-policy"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="entity-name"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="remove-action-Policy A"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-action-TeamA"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-action-alice"]').exists()).toBe(true);
  });

  it('does not fetch the role without view permission and shows the empty placeholder', async () => {
    const fetchMock = vi.fn(defaultFetch([]));
    const { wrapper, router } = await mountRole(fetchMock);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/v1/roles/name/')),
    ).toBe(false);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    const goBack = wrapper.find('[data-testid="no-data-placeholder"]');
    expect(goBack.text()).toContain('Go Back');
    const buttons = wrapper.findAll('button');
    const back = buttons.find((button) => button.text().includes('Go Back'));
    await back!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-roles');
  });

  it('saves the description with an unconditional field PATCH and keeps the returned text', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="stub-desc-save"]').trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(new URL(patches[0]!.url).pathname).toBe('/api/v1/roles/r1');
    expect(patches[0]!.body).toEqual([
      { op: 'replace', path: '/description', value: 'new description' },
    ]);
    expect(wrapper.find('[data-testid="description-stub"]').text()).toContain('new description');
  });

  it('saves a changed display name and skips the PATCH when unchanged', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="stub-manage-rename"]').trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.body).toEqual([
      { op: 'replace', path: '/displayName', value: 'Renamed Role' },
    ]);
    expect(wrapper.text()).toContain('Renamed Role');
    stubRenameDisplayName = 'Renamed Role';
    await wrapper.get('[data-testid="stub-manage-rename"]').trigger('click');
    await flushPromises();
    expect(patchBodies(fetchMock)).toHaveLength(1);
  });

  it('removes a policy through the confirm modal with a replace /policies PATCH', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="remove-action-Policy A"]').trigger('click');
    expect(wrapper.find('[data-testid="modal-title"]').text()).toContain('Data Steward');
    const confirm = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Confirm'));
    await confirm!.trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.body).toEqual([{ op: 'replace', path: '/policies', value: [] }]);
    expect(wrapper.find('[data-testid="modal-stub"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="remove-action-Policy A"]').exists()).toBe(false);
  });

  it('removes a team through the reverse by-name PATCH and filters locally', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="remove-action-TeamA"]').trigger('click');
    const confirm = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Confirm'));
    await confirm!.trigger('click');
    await flushPromises();
    const teamGet = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/teams/name/TeamA'),
    );
    expect(teamGet).toBeDefined();
    expect(decodeURIComponent(String(teamGet![0]))).toContain('fields=defaultRoles');
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(new URL(patches[0]!.url).pathname).toBe('/api/v1/teams/t1');
    expect(patches[0]!.body).toEqual([
      {
        op: 'replace',
        path: '/defaultRoles',
        value: [{ id: 'r2', name: 'Analyst', fullyQualifiedName: 'Analyst', type: 'role' }],
      },
    ]);
    expect(wrapper.find('[data-testid="remove-action-TeamA"]').exists()).toBe(false);
  });

  it('adds policies with existing references verbatim and fresh ids as {id, type}', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="add-policy"]').trigger('click');
    expect(wrapper.find('[data-testid="add-attribute-title"]').text()).toBe('Add policy');
    expect(wrapper.find('[data-testid="add-attribute-keys"]').text()).toBe('p1');
    await wrapper.get('[data-testid="stub-add-save"]').trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.body).toEqual([
      {
        op: 'replace',
        path: '/policies',
        value: [
          {
            id: 'p1',
            type: 'policy',
            name: 'PolicyA',
            displayName: 'Policy A',
            fullyQualifiedName: 'PolicyA',
            description: 'policy a',
          },
          { id: 'p2', type: 'policy' },
        ],
      },
    ]);
  });

  it('skips the PATCH when the policy selection is unchanged', async () => {
    stubAddSelectedIds = ['p1'];
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="add-policy"]').trigger('click');
    await wrapper.get('[data-testid="stub-add-save"]').trigger('click');
    await flushPromises();
    expect(patchBodies(fetchMock)).toHaveLength(0);
    expect(wrapper.find('[data-testid="add-attribute-stub"]').exists()).toBe(false);
  });

  it('deletes through the recursive hardDelete wire and returns to the list', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper, router } = await mountRole(fetchMock);
    await wrapper.get('[data-testid="stub-manage-delete"]').trigger('click');
    await flushPromises();
    const deletes = fetchMock.mock.calls.filter(
      (call) => String(call[1]?.method).toUpperCase() === 'DELETE',
    );
    expect(deletes).toHaveLength(1);
    const parsed = new URL(String(deletes[0]![0]));
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/roles/r1?hardDelete=true&recursive=true');
    expect(router.currentRoute.value.name).toBe('admin-roles');
  });

  it('toasts and shows the placeholder when the role fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountRole(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/permissions/role/name/')) {
        return jsonResponse(permissionResponse('role', ['ViewAll']));
      }
      return new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
  });
});
