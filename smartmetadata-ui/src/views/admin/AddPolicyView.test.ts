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
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { createTestI18n } from '@/test/i18n';
import type { RuleFormValue } from './accessRuleForm';
import AddPolicyView from './AddPolicyView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let stubRuleValid = true;
let stubValidateCalls = 0;
let stubRuleValue: RuleFormValue = {
  name: 'RuleA',
  description: 'rule desc',
  effect: 'allow',
  operations: ['ViewAll'],
  resources: ['table'],
  condition: '',
};

const EditorStub = defineComponent({
  props: { initialValue: { type: String, default: '' } },
  emits: ['text-change'],
  setup() {
    return () => h('div', { 'data-testid': 'editor-stub' });
  },
});

const RuleFormStub = defineComponent({
  name: 'AccessControlRuleForm',
  setup(_props, { expose }) {
    expose({
      validate: async () => {
        stubValidateCalls += 1;
        return stubRuleValid;
      },
      getRule: () => ({ ...stubRuleValue }),
      setRule: vi.fn(),
    });
    return () => h('div', { 'data-testid': 'rule-form-stub' });
  },
});

async function mountAddPolicy(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/policies',
        name: 'admin-policies',
        component: { template: '<div>policies</div>' },
      },
      { path: '/admin/policies/add', name: 'admin-policy-add', component: AddPolicyView },
      {
        path: '/admin/policies/:fqn',
        name: 'admin-policy',
        component: { template: '<div>policy</div>' },
      },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
    ],
  });
  await router.push('/admin/policies/add');
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(AddPolicyView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { SmRichTextEditor: EditorStub, AccessControlRuleForm: RuleFormStub },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/policies') && String(init?.method ?? 'GET').toUpperCase() === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name: string };
      return jsonResponse({
        id: 'p9',
        name: body.name,
        fullyQualifiedName: body.name,
        rules: [],
        owners: [],
        teams: [],
        roles: [],
      });
    }
    return new Response('not found', { status: 404 });
  };
}

describe('AddPolicyView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubRuleValid = true;
    stubValidateCalls = 0;
    stubRuleValue = {
      name: 'RuleA',
      description: 'rule desc',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: '',
    };
  });

  it('renders the breadcrumb, title, divider and policy name field', async () => {
    const { wrapper } = await mountAddPolicy(defaultFetch());
    const items = wrapper.getComponent(SmBreadcrumb).props('items') as Array<{ label: string }>;
    expect(items.map((item) => item.label)).toEqual([
      'Settings',
      'Policies',
      'Add New Policy',
    ]);
    expect(wrapper.find('[data-testid="form-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-policy-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-rule-divider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="policy-name"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Policies are assigned to teams.');
  });

  it('validates both forms before saving and shows errors from both', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValid = false;
    const { wrapper } = await mountAddPolicy(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(stubValidateCalls).toBe(1);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
    // The name form shows its required error too.
    expect(wrapper.text()).toContain('Name is required');
  });

  it('does not save when only the rule form is invalid', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValid = false;
    const { wrapper } = await mountAddPolicy(fetchMock);
    await wrapper.get('[data-testid="policy-name"]').setValue('PolicyX');
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });

  it('does not save when only the name form is invalid', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountAddPolicy(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(stubValidateCalls).toBe(1);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });

  it('creates the policy with one serialized rule and no displayName/enabled fields', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper, router } = await mountAddPolicy(fetchMock);
    await wrapper.get('[data-testid="policy-name"]').setValue('  PolicyX  ');
    await wrapper.getComponent(EditorStub).vm.$emit('text-change', '<p>policy desc</p>');
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String(posts[0]![1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      name: 'PolicyX',
      description: '<p>policy desc</p>',
      rules: [
        {
          name: 'RuleA',
          description: 'rule desc',
          effect: 'allow',
          operations: ['ViewAll'],
          resources: ['table'],
        },
      ],
    });
    expect(body).not.toHaveProperty('displayName');
    expect(body).not.toHaveProperty('enabled');
    expect(router.currentRoute.value.name).toBe('admin-policy');
    expect(router.currentRoute.value.params.fqn).toBe('PolicyX');
  });

  it('keeps a non-empty condition and trims only the rule name', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValue = {
      name: '  Spaced  ',
      description: '',
      effect: 'deny',
      operations: [],
      resources: ['All'],
      condition: '  isOwner()  ',
    };
    const { wrapper } = await mountAddPolicy(fetchMock);
    await wrapper.get('[data-testid="policy-name"]').setValue('PolicyY');
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    const body = JSON.parse(String(posts[0]![1]?.body)) as {
      rules: Array<Record<string, unknown>>;
    };
    expect(body.rules[0]).toEqual({
      name: 'Spaced',
      description: '',
      effect: 'deny',
      operations: [],
      resources: ['All'],
      condition: '  isOwner()  ',
    });
  });

  it('matches already-exists by message and shows the pin toast without navigating', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    const { wrapper, router } = await mountAddPolicy(async () =>
      jsonResponse({ message: 'Policy "Dup" already exists' }, 409),
    );
    await wrapper.get('[data-testid="policy-name"]').setValue('Dup');
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Policy "Dup" already exists. Duplicated policies are not allowed.');
    expect(successSpy).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('admin-policy-add');
  });

  it('shows the server text for non-conflict failures', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountAddPolicy(async () => jsonResponse({ message: 'boom' }, 500));
    await wrapper.get('[data-testid="policy-name"]').setValue('PolicyZ');
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('boom');
  });

  it('cancels back to the policies list', async () => {
    const { wrapper, router } = await mountAddPolicy(defaultFetch());
    await wrapper.get('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policies');
  });
});
