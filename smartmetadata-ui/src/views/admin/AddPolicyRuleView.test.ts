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
import AddPolicyRuleView from './AddPolicyRuleView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const POLICY = {
  id: 'p1',
  name: 'Data Consumer',
  fullyQualifiedName: 'Data Consumer',
  rules: [
    {
      name: 'RuleA',
      fullyQualifiedName: 'Data Consumer.RuleA',
      description: 'existing',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['table'],
    },
  ],
  owners: [],
  teams: [],
  roles: [],
};

let stubRuleValid = true;
let stubRuleValue: RuleFormValue = {
  name: 'New Rule',
  description: 'fresh',
  effect: 'allow',
  operations: ['ViewAll'],
  resources: ['table'],
  condition: '',
};

const RuleFormStub = defineComponent({
  name: 'AccessControlRuleForm',
  setup(_props, { expose }) {
    expose({
      validate: async () => stubRuleValid,
      getRule: () => ({ ...stubRuleValue }),
      setRule: vi.fn(),
    });
    return () => h('div', { 'data-testid': 'rule-form-stub' });
  },
});

async function mountAddRule(
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
      {
        path: '/admin/policies/:fqn/rules/add',
        name: 'admin-policy-rule-add',
        component: AddPolicyRuleView,
        props: true,
      },
      {
        path: '/admin/policies/:fqn',
        name: 'admin-policy',
        component: { template: '<div>policy</div>' },
      },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
    ],
  });
  await router.push('/admin/policies/Data%20Consumer/rules/add');
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(AddPolicyRuleView, {
    props: { fqn: 'Data Consumer' },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { AccessControlRuleForm: RuleFormStub },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

function defaultFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    if (url.includes('/api/v1/policies/name/') && method === 'GET') {
      return jsonResponse(POLICY);
    }
    if (url.includes('/api/v1/policies/p1') && method === 'PATCH') {
      return jsonResponse({ ...POLICY, rules: JSON.parse(String(init?.body ?? '[]'))[0].value });
    }
    return new Response('not found', { status: 404 });
  };
}

describe('AddPolicyRuleView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubRuleValid = true;
    stubRuleValue = {
      name: 'New Rule',
      description: 'fresh',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: '',
    };
  });

  it('renders the four-segment breadcrumb and the Create action', async () => {
    const fetchMock = vi.fn(defaultFetch());
    const { wrapper } = await mountAddRule(fetchMock);
    const items = wrapper.getComponent(SmBreadcrumb).props('items') as Array<{ label: string }>;
    expect(items.map((item) => item.label)).toEqual([
      'Settings',
      'Policies',
      'Data Consumer',
      'Add New Rule',
    ]);
    expect(wrapper.find('[data-testid="add-rule-title"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rule-form"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="submit-btn"]').text()).toContain('Create');
    const getUrl = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/policies/name/'),
    );
    expect(decodeURIComponent(String(getUrl![0]))).toContain('fields=owners,location,teams,roles');
  });

  it('appends the serialized rule and returns to the detail page', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValue = {
      name: '  New Rule  ',
      description: 'fresh',
      effect: 'deny',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: '',
    };
    const { wrapper, router } = await mountAddRule(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const patches = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    const ops = JSON.parse(String(patches[0]![1]?.body)) as Array<{ op: string; path: string; value: unknown }>;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.op).toBe('replace');
    expect(ops[0]!.path).toBe('/rules');
    expect(ops[0]!.value).toEqual([
      {
        name: 'RuleA',
        fullyQualifiedName: 'Data Consumer.RuleA',
        description: 'existing',
        effect: 'allow',
        operations: ['ViewAll'],
        resources: ['table'],
      },
      {
        name: 'New Rule',
        description: 'fresh',
        effect: 'deny',
        operations: ['ViewAll'],
        resources: ['table'],
      },
    ]);
    expect(router.currentRoute.value.name).toBe('admin-policy');
  });

  it('keeps a non-empty condition untrimmed', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValue = { ...stubRuleValue, condition: '  isOwner()  ' };
    const { wrapper } = await mountAddRule(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const patches = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
    const ops = JSON.parse(String(patches[0]![1]?.body)) as Array<{ value: Array<Record<string, unknown>> }>;
    expect(ops[0]!.value[1]).toHaveProperty('condition', '  isOwner()  ');
  });

  it('does not PATCH when the rule form is invalid', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValid = false;
    const { wrapper } = await mountAddRule(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
  });

  it('judges conflicts by HTTP status, even without an already-exists message', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountAddRule(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/name/')) {
        return jsonResponse(POLICY);
      }
      if (String(init?.method ?? '').toUpperCase() === 'PATCH') {
        return jsonResponse({ message: 'boom' }, 409);
      }
      return new Response('not found', { status: 404 });
    });
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Rule "New Rule" already exists. Duplicated rules are not allowed.');
  });

  it('shows the server text for non-conflict failures', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountAddRule(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/name/')) {
        return jsonResponse(POLICY);
      }
      if (String(init?.method ?? '').toUpperCase() === 'PATCH') {
        return jsonResponse({ message: 'boom' }, 500);
      }
      return new Response('not found', { status: 404 });
    });
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('boom');
  });

  it('toasts on fetch failure and submit is a no-op without a loaded policy', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('boom', { status: 500 }),
    );
    const { wrapper } = await mountAddRule(fetchMock);
    expect(errorSpy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="rule-form"]').exists()).toBe(true);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
  });

  it('cancels back to the policy detail page', async () => {
    const { wrapper, router } = await mountAddRule(defaultFetch());
    await wrapper.get('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy');
    expect(router.currentRoute.value.params.fqn).toBe('Data Consumer');
  });
});
