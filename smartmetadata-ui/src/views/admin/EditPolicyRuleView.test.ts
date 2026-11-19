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
import { INITIAL_RULE, type RuleFormValue } from './accessRuleForm';
import EditPolicyRuleView from './EditPolicyRuleView.vue';

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
      effect: 'deny',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: 'isOwner()',
    },
    {
      name: 'RuleB',
      fullyQualifiedName: 'Data Consumer.RuleB',
      effect: 'allow',
      operations: ['Create'],
      resources: ['database'],
    },
  ],
  owners: [],
  teams: [],
  roles: [],
};

let stubRuleValid = true;
let stubRuleValue: RuleFormValue = {
  name: 'RuleA',
  description: 'existing',
  effect: 'deny',
  operations: ['ViewAll'],
  resources: ['table'],
  condition: 'isOwner()',
  fullyQualifiedName: 'Data Consumer.RuleA',
};
let capturedInitialRule: RuleFormValue | undefined;

const RuleFormStub = defineComponent({
  name: 'AccessControlRuleForm',
  props: { initialRule: { type: Object, default: undefined } },
  setup(props, { expose }) {
    capturedInitialRule = props.initialRule as RuleFormValue | undefined;
    expose({
      validate: async () => stubRuleValid,
      getRule: () => ({ ...stubRuleValue }),
      setRule: vi.fn(),
    });
    return () => h('div', { 'data-testid': 'rule-form-stub' });
  },
});

async function mountEditRule(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ruleName = 'RuleA',
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
        path: '/admin/policies/:fqn/rules/:ruleName/edit',
        name: 'admin-policy-rule-edit',
        component: EditPolicyRuleView,
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
  await router.push(`/admin/policies/Data%20Consumer/rules/${encodeURIComponent(ruleName)}/edit`);
  await router.isReady();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const wrapper = mount(EditPolicyRuleView, {
    props: { fqn: 'Data Consumer', ruleName },
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

describe('EditPolicyRuleView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubRuleValid = true;
    capturedInitialRule = undefined;
    stubRuleValue = {
      name: 'RuleA',
      description: 'existing',
      effect: 'deny',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: 'isOwner()',
      fullyQualifiedName: 'Data Consumer.RuleA',
    };
  });

  it('renders the hardcoded-English breadcrumb segments and the quoted title', async () => {
    const { wrapper } = await mountEditRule(defaultFetch());
    const items = wrapper.getComponent(SmBreadcrumb).props('items') as Array<{ label: string }>;
    // Pin literals, not translation keys (EditRulePage.tsx:57-66).
    expect(items.map((item) => item.label)).toEqual([
      'Settings',
      'Policies',
      'Data Consumer',
      'RuleA',
    ]);
    expect(wrapper.find('[data-testid="edit-rule-title"]').text()).toContain('"RuleA"');
    expect(wrapper.get('[data-testid="submit-btn"]').text()).toContain('Save');
  });

  it('initialises the form with the selected rule merged over the empty rule', async () => {
    await mountEditRule(defaultFetch());
    expect(capturedInitialRule).toEqual({
      ...INITIAL_RULE,
      name: 'RuleA',
      description: 'existing',
      effect: 'deny',
      operations: ['ViewAll'],
      resources: ['table'],
      condition: 'isOwner()',
      fullyQualifiedName: 'Data Consumer.RuleA',
    });
  });

  it('replaces by the old name so renaming works, preserving the FQN', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValue = { ...stubRuleValue, name: 'RuleRenamed' };
    const { wrapper, router } = await mountEditRule(fetchMock);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const patches = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    const ops = JSON.parse(String(patches[0]![1]?.body)) as Array<{ op: string; path: string; value: unknown }>;
    expect(ops[0]!.op).toBe('replace');
    expect(ops[0]!.path).toBe('/rules');
    expect(ops[0]!.value).toEqual([
      {
        name: 'RuleRenamed',
        description: 'existing',
        effect: 'deny',
        operations: ['ViewAll'],
        resources: ['table'],
        condition: 'isOwner()',
        fullyQualifiedName: 'Data Consumer.RuleA',
      },
      {
        name: 'RuleB',
        fullyQualifiedName: 'Data Consumer.RuleB',
        effect: 'allow',
        operations: ['Create'],
        resources: ['database'],
      },
    ]);
    expect(router.currentRoute.value.name).toBe('admin-policy');
  });

  it('shows the empty form for a missing rule and PATCHes the rules unchanged', async () => {
    const fetchMock = vi.fn(defaultFetch());
    stubRuleValue = { ...INITIAL_RULE };
    const { wrapper } = await mountEditRule(fetchMock, 'Nope');
    expect(capturedInitialRule).toEqual(INITIAL_RULE);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    const patches = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    const ops = JSON.parse(String(patches[0]![1]?.body)) as Array<{ value: unknown }>;
    expect(ops[0]!.value).toEqual([
      {
        name: 'RuleA',
        fullyQualifiedName: 'Data Consumer.RuleA',
        description: 'existing',
        effect: 'deny',
        operations: ['ViewAll'],
        resources: ['table'],
        condition: 'isOwner()',
      },
      {
        name: 'RuleB',
        fullyQualifiedName: 'Data Consumer.RuleB',
        effect: 'allow',
        operations: ['Create'],
        resources: ['database'],
      },
    ]);
  });

  it('judges conflicts by HTTP status', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountEditRule(async (input, init) => {
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
    expect(errorSpy).toHaveBeenCalledWith('Rule "RuleA" already exists. Duplicated rules are not allowed.');
  });

  it('falls back to the updating-error text when the server sends nothing', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountEditRule(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/policies/name/')) {
        return jsonResponse(POLICY);
      }
      if (String(init?.method ?? '').toUpperCase() === 'PATCH') {
        return new Response('', { status: 500 });
      }
      return new Response('not found', { status: 404 });
    });
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('Error while updating rule');
  });

  it('toasts on fetch failure and submit is a no-op without a loaded policy', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('boom', { status: 500 }),
    );
    const { wrapper } = await mountEditRule(fetchMock);
    expect(errorSpy).toHaveBeenCalled();
    expect(capturedInitialRule).toEqual(INITIAL_RULE);
    await wrapper.get('[data-testid="submit-btn"]').trigger('click');
    await flushPromises();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
  });

  it('cancels back to the policy detail page', async () => {
    const { wrapper, router } = await mountEditRule(defaultFetch());
    await wrapper.get('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-policy');
    expect(router.currentRoute.value.params.fqn).toBe('Data Consumer');
  });
});
