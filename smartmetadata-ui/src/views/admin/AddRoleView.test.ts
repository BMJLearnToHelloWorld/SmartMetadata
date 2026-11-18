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
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { createTestI18n } from '@/test/i18n';
import AddRoleView from './AddRoleView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const POLICIES = [
  { id: 'p1', name: 'PolicyA', fullyQualifiedName: 'PolicyA', displayName: 'Policy A', rules: [] },
  { id: 'p2', name: 'PolicyB', fullyQualifiedName: 'PolicyB', rules: [] },
];

const EditorStub = defineComponent({
  props: { initialValue: { type: String, default: '' } },
  emits: ['text-change'],
  setup() {
    return () => h('div', { 'data-testid': 'editor-stub' });
  },
});

async function mountAddRole(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/roles', name: 'admin-roles', component: { template: '<div>roles</div>' } },
      { path: '/admin/roles/add', name: 'admin-role-add', component: AddRoleView },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
    ],
  });
  await router.push('/admin/roles/add');
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(AddRoleView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { SmRichTextEditor: EditorStub },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/v1/policies') && method === 'GET') {
      return jsonResponse({ data: POLICIES, paging: { total: 2 } });
    }
    if (url.includes('/api/v1/roles') && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name: string };
      return jsonResponse({
        id: 'r9',
        name: body.name,
        fullyQualifiedName: body.name,
        policies: [],
        users: [],
        teams: [],
      });
    }
    return new Response('not found', { status: 404 });
  };
}

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('AddRoleView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the three-segment breadcrumb without an Access Control segment', async () => {
    const { wrapper } = await mountAddRole(defaultFetch());
    const items = wrapper.getComponent(SmBreadcrumb).props('items') as Array<{ label: string }>;
    expect(items.map((item) => item.label)).toEqual([
      'Settings',
      'Roles',
      'Add New Role',
    ]);
    expect(wrapper.find('[data-testid="form-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-role-container"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Roles are assigned to Users.');
  });

  it('offers policies keyed by FQN with display-name labels', async () => {
    const { wrapper } = await mountAddRole(defaultFetch());
    const options = wrapper.getComponent(Select).props('options') as Array<{
      value: string;
      label: string;
    }>;
    expect(options).toEqual([
      { value: 'PolicyA', label: 'Policy A' },
      { value: 'PolicyB', label: 'PolicyB' },
    ]);
    const policiesUrl = vi.mocked(fetch).mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/policies'),
    );
    expect(decodeURIComponent(String(policiesUrl![0]))).toContain('limit=100');
  });

  it('blocks submit until the name passes and at least one policy is chosen', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountAddRole(fetchMock);
    await submitForm(wrapper);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
    await wrapper.get('[data-testid="name"]').setValue('Bad>Name');
    await wrapper.getComponent(Select).vm.$emit('update:value', ['PolicyA']);
    await submitForm(wrapper);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
    await wrapper.get('[data-testid="name"]').setValue('Good Name');
    await wrapper.getComponent(Select).vm.$emit('update:value', []);
    await submitForm(wrapper);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });

  it('creates the role with a trimmed name, editor description and FQN strings', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper, router } = await mountAddRole(fetchMock);
    await wrapper.get('[data-testid="name"]').setValue('  New Role  ');
    await wrapper.getComponent(EditorStub).vm.$emit('text-change', '<p>about</p>');
    await wrapper.getComponent(Select).vm.$emit('update:value', ['PolicyA', 'PolicyB']);
    await submitForm(wrapper);
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({
      name: 'New Role',
      description: '<p>about</p>',
      policies: ['PolicyA', 'PolicyB'],
    });
    expect(router.currentRoute.value.name).toBe('admin-role');
    expect(router.currentRoute.value.params.fqn).toBe('New Role');
  });

  it('matches already-exists by message and shows the pin toast without navigating', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    const { wrapper, router } = await mountAddRole(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/policies')) {
        return jsonResponse({ data: POLICIES, paging: { total: 2 } });
      }
      return jsonResponse({ message: 'Role "Dup" already exists' }, 409);
    });
    await wrapper.get('[data-testid="name"]').setValue('Dup');
    await wrapper.getComponent(Select).vm.$emit('update:value', ['PolicyA']);
    await submitForm(wrapper);
    expect(errorSpy).toHaveBeenCalledWith('Role "Dup" already exists. Duplicated roles are not allowed.');
    expect(successSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('admin-role-add');
  });

  it('shows the server text for non-conflict failures', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountAddRole(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/policies')) {
        return jsonResponse({ data: POLICIES, paging: { total: 2 } });
      }
      return jsonResponse({ message: 'boom' }, 500);
    });
    await wrapper.get('[data-testid="name"]').setValue('RoleX');
    await wrapper.getComponent(Select).vm.$emit('update:value', ['PolicyA']);
    await submitForm(wrapper);
    expect(errorSpy).toHaveBeenCalledWith('boom');
  });

  it('toasts when the policy list fails and still renders the form', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountAddRole(async () => new Response('boom', { status: 500 }));
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="name"]').exists()).toBe(true);
    expect(wrapper.getComponent(Select).props('options')).toEqual([]);
  });

  it('cancels back to the roles list', async () => {
    const { wrapper, router } = await mountAddRole(defaultFetch());
    await wrapper.get('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-roles');
  });
});
