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
import PolicyDetailView from './PolicyDetailView.vue';

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

const POLICY_ROW = {
  id: 'p1',
  name: 'DataConsumerPolicy',
  fullyQualifiedName: 'DataConsumerPolicy',
  displayName: 'Data Consumer',
  description: 'Policy description',
  enabled: true,
  owners: [],
  teams: [{ id: 't1', name: 'TeamA', fullyQualifiedName: 'TeamA', type: 'team' }],
  roles: [{ id: 'r1', name: 'DataSteward', fullyQualifiedName: 'DataSteward', type: 'role' }],
  rules: [
    {
      name: 'RuleA',
      description: 'Rule description',
      effect: 'deny',
      operations: ['ViewAll'],
      resources: ['table', 'all'],
      condition: 'isOwner()',
      fullyQualifiedName: 'DataConsumerPolicy.RuleA',
    },
    {
      name: 'RuleB',
      effect: 'allow',
      operations: ['EditAll'],
      resources: ['databaseSchema'],
      fullyQualifiedName: 'DataConsumerPolicy.RuleB',
    },
  ],
};

const ROLE_ROW = {
  id: 'r1',
  name: 'DataSteward',
  fullyQualifiedName: 'DataSteward',
  policies: [
    { id: 'p1', name: 'DataConsumerPolicy', fullyQualifiedName: 'DataConsumerPolicy', type: 'policy' },
    { id: 'p2', name: 'OtherPolicy', fullyQualifiedName: 'OtherPolicy', type: 'policy' },
  ],
  users: [],
  teams: [],
};

const TEAM_ROW = {
  id: 't1',
  name: 'TeamA',
  fullyQualifiedName: 'TeamA',
  teamType: 'Group',
  users: [],
  defaultRoles: [],
  parents: [],
  policies: [
    { id: 'p1', name: 'DataConsumerPolicy', fullyQualifiedName: 'DataConsumerPolicy', type: 'policy' },
  ],
};

let stubRenameDisplayName = 'Renamed Policy';

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
              props.onEditDisplayName({ name: 'DataConsumerPolicy', displayName: stubRenameDisplayName }),
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

const DropdownStub = defineComponent({
  props: { open: Boolean },
  emits: ['update:open'],
  setup(props, { slots, emit }) {
    return () =>
      h('div', { 'data-testid': 'dropdown-stub' }, [
        h(
          'div',
          { onClick: () => emit('update:open', true) },
          slots.default?.(),
        ),
        props.open ? slots.overlay?.() : null,
      ]);
  },
});

async function mountPolicy(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  routeFqn = 'DataConsumerPolicy',
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/policies', name: 'admin-policies', component: { template: '<div>policies</div>' } },
      { path: '/admin/policies/:fqn', name: 'admin-policy', component: PolicyDetailView, props: true },
      { path: '/admin/policies/:fqn/rules/add', name: 'admin-policy-rule-add', component: { template: '<div>add rule</div>' } },
      {
        path: '/admin/policies/:fqn/rules/:ruleName/edit',
        name: 'admin-policy-rule-edit',
        component: { template: '<div>edit rule</div>' },
      },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
    ],
  });
  await router.push({ name: 'admin-policy', params: { fqn: routeFqn } });
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(PolicyDetailView, {
    props: { fqn: routeFqn },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: {
        AModal: ModalStub,
        ADropdown: DropdownStub,
        AccessManageButton: ManageStub,
        AccessDescription: DescriptionStub,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch(grants: string[] = ['ViewAll', 'EditAll', 'Delete'], policyRow = POLICY_ROW) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/v1/permissions/policy/name/')) {
      return jsonResponse(permissionResponse('policy', grants));
    }
    if (url.includes('/api/v1/policies/name/')) {
      return jsonResponse(policyRow);
    }
    if (url.includes('/api/v1/roles/name/')) {
      return jsonResponse(ROLE_ROW);
    }
    if (url.includes('/api/v1/teams/name/')) {
      return jsonResponse(TEAM_ROW);
    }
    if (method === 'PATCH' && url.includes('/api/v1/policies/p1')) {
      const ops = JSON.parse(String(init?.body ?? '[]')) as Array<{ path: string; value: unknown }>;
      const next = JSON.parse(JSON.stringify(policyRow)) as typeof POLICY_ROW;
      for (const op of ops) {
        if (op.path === '/description') next.description = op.value as string;
        if (op.path === '/displayName') next.displayName = op.value as string;
        if (op.path === '/rules') next.rules = op.value as typeof POLICY_ROW.rules;
      }
      return jsonResponse(next);
    }
    if (method === 'PATCH' && url.includes('/api/v1/roles/r1')) {
      return jsonResponse(ROLE_ROW);
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

describe('PolicyDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubRenameDisplayName = 'Renamed Policy';
  });

  it('renders the pin tabs with rules first and no entity-name testids on the lists', async () => {
    const { wrapper } = await mountPolicy(defaultFetch());
    expect(wrapper.find('[data-testid="policy-details-container"]').exists()).toBe(true);
    expect(wrapper.find('.ant-tabs-tab-active').text()).toContain('Rules');
    expect(wrapper.text()).toContain('Roles');
    expect(wrapper.text()).toContain('Teams');
    expect(wrapper.find('[data-testid="entity-detail-crumb-0"]').text()).toContain('Policies');
    expect(wrapper.findAll('[data-testid="entity-name"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="remove-action-DataSteward"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-action-TeamA"]').exists()).toBe(true);
  });

  it('renders rule cards with the pin rows and startCase formatting', async () => {
    const { wrapper } = await mountPolicy(defaultFetch());
    const cards = wrapper.findAll('[data-testid="rule-card"]');
    expect(cards).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="rule-name"]').map((node) => node.text())).toEqual([
      'RuleA',
      'RuleB',
    ]);
    expect(wrapper.findAll('[data-testid="description"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="description"]').text()).toContain('Rule description');
    const resources = wrapper.findAll('[data-testid="resources"]');
    expect(resources[0]!.text()).toContain('Table, All');
    expect(resources[1]!.text()).toContain('Database Schema');
    expect(wrapper.findAll('[data-testid="operations"]')[0]!.text()).toContain('ViewAll');
    expect(wrapper.findAll('[data-testid="effect"]')[0]!.text()).toContain('Deny');
    expect(wrapper.findAll('[data-testid="effect"]')[1]!.text()).toContain('Allow');
    expect(wrapper.findAll('[data-testid="condition"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="condition"]').find('code').text()).toBe('isOwner()');
  });

  it('shows only the placeholder without an add button when the policy has no rules', async () => {
    const { wrapper } = await mountPolicy(defaultFetch(['ViewAll', 'EditAll', 'Delete'], { ...POLICY_ROW, rules: [] }));
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-rule"]').exists()).toBe(false);
  });

  it('navigates to the add-rule page with the policy FQN', async () => {
    const { wrapper, router } = await mountPolicy(defaultFetch());
    await wrapper.get('[data-testid="add-rule"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy-rule-add');
    expect(router.currentRoute.value.params.fqn).toBe('DataConsumerPolicy');
  });

  it('opens the rule menu to edit with the old rule name', async () => {
    const { wrapper, router } = await mountPolicy(defaultFetch());
    await wrapper.get('[data-testid="manage-button-RuleA"]').trigger('click');
    await wrapper.get('[data-testid="edit-rule"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy-rule-edit');
    expect(router.currentRoute.value.params.fqn).toBe('DataConsumerPolicy');
    expect(router.currentRoute.value.params.ruleName).toBe('RuleA');
  });

  it('deletes a rule without confirmation and preserves the remaining rule FQN', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountPolicy(fetchMock);
    await wrapper.get('[data-testid="manage-button-RuleA"]').trigger('click');
    await wrapper.get('[data-testid="delete-rule"]').trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.body).toEqual([
      {
        op: 'replace',
        path: '/rules',
        value: [
          {
            name: 'RuleB',
            operations: ['EditAll'],
            resources: ['databaseSchema'],
            effect: 'allow',
            fullyQualifiedName: 'DataConsumerPolicy.RuleB',
          },
        ],
      },
    ]);
    expect(wrapper.findAll('[data-testid="rule-card"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="rule-name"]').text()).toBe('RuleB');
  });

  it('removes a role through the reverse by-name PATCH', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountPolicy(fetchMock);
    await wrapper.get('[data-testid="remove-action-DataSteward"]').trigger('click');
    const confirm = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Confirm'));
    await confirm!.trigger('click');
    await flushPromises();
    const roleGet = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/roles/name/DataSteward'),
    );
    expect(roleGet).toBeDefined();
    expect(decodeURIComponent(String(roleGet![0]))).toContain('fields=policies');
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(new URL(patches[0]!.url).pathname).toBe('/api/v1/roles/r1');
    expect(patches[0]!.body).toEqual([
      {
        op: 'replace',
        path: '/policies',
        value: [{ id: 'p2', name: 'OtherPolicy', fullyQualifiedName: 'OtherPolicy', type: 'policy' }],
      },
    ]);
    expect(wrapper.find('[data-testid="remove-action-DataSteward"]').exists()).toBe(false);
  });

  it('removes a team through the reverse by-name PATCH', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountPolicy(fetchMock);
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
    expect(decodeURIComponent(String(teamGet![0]))).toContain('fields=policies');
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(1);
    expect(new URL(patches[0]!.url).pathname).toBe('/api/v1/teams/t1');
    expect(patches[0]!.body).toEqual([{ op: 'replace', path: '/policies', value: [] }]);
    expect(wrapper.find('[data-testid="remove-action-TeamA"]').exists()).toBe(false);
  });

  it('saves the description and display name through field PATCHes', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountPolicy(fetchMock);
    await wrapper.get('[data-testid="stub-desc-save"]').trigger('click');
    await wrapper.get('[data-testid="stub-manage-rename"]').trigger('click');
    await flushPromises();
    const patches = patchBodies(fetchMock);
    expect(patches).toHaveLength(2);
    expect(patches[0]!.body).toEqual([
      { op: 'replace', path: '/description', value: 'new description' },
    ]);
    expect(patches[1]!.body).toEqual([
      { op: 'replace', path: '/displayName', value: 'Renamed Policy' },
    ]);
  });

  it('deletes through the recursive hardDelete wire and returns to the list', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper, router } = await mountPolicy(fetchMock);
    await wrapper.get('[data-testid="stub-manage-delete"]').trigger('click');
    await flushPromises();
    const deletes = fetchMock.mock.calls.filter(
      (call) => String(call[1]?.method).toUpperCase() === 'DELETE',
    );
    expect(deletes).toHaveLength(1);
    const parsed = new URL(String(deletes[0]![0]));
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/policies/p1?hardDelete=true&recursive=true');
    expect(router.currentRoute.value.name).toBe('admin-policies');
  });

  it('shows the placeholder with a small go-back button without view permission', async () => {
    const fetchMock = vi.fn(defaultFetch([]));
    const { wrapper, router } = await mountPolicy(fetchMock);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/v1/policies/name/')),
    ).toBe(false);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    const back = wrapper.findAll('button').find((button) => button.text().includes('Go Back'));
    expect(back!.classes()).toContain('ant-btn-sm');
    await back!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policies');
  });

  it('toasts and shows the placeholder when the policy fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountPolicy(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/permissions/policy/name/')) {
        return jsonResponse(permissionResponse('policy', ['ViewAll']));
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
