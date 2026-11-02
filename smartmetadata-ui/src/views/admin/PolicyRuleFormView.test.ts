/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PolicyRuleFormView from './PolicyRuleFormView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const policyPayload = {
  id: 'p1',
  name: 'DataConsumerPolicy',
  displayName: 'Data Consumer',
  enabled: true,
  owners: [],
  roles: [],
  teams: [],
  rules: [
    {
      name: 'DataConsumerPolicy-Rule',
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['all'],
      condition: 'isOwner()',
    },
  ],
};

async function mountForm(props: { id: string; ruleName?: string }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/policies', name: 'admin-policies', component: { template: '<div>list</div>' } },
      { path: '/admin/policies/:id', name: 'admin-policy', component: { template: '<div>detail</div>' } },
      {
        path: '/admin/policies/:id/rules/add',
        name: 'admin-policy-rule-add',
        component: PolicyRuleFormView,
        props: true,
      },
      {
        path: '/admin/policies/:id/rules/:ruleName/edit',
        name: 'admin-policy-rule-edit',
        component: PolicyRuleFormView,
        props: true,
      },
    ],
  });
  await router.push(
    props.ruleName
      ? `/admin/policies/${props.id}/rules/${props.ruleName}/edit`
      : `/admin/policies/${props.id}/rules/add`,
  );
  await router.isReady();
  const wrapper = mount(PolicyRuleFormView, {
    props,
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PolicyRuleFormView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/policies/p1') && init?.method === 'PATCH') {
          return jsonResponse({ ...policyPayload });
        }
        if (url.includes('/api/v1/policies/p1')) {
          return jsonResponse(policyPayload);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('adds a rule on its own page with a /rules replace patch', async () => {
    const { wrapper } = await mountForm({ id: 'p1' });
    expect(wrapper.find('[data-testid="add-rule-title"]').exists()).toBe(true);
    const nameInput = wrapper.find('[data-testid="policy-rule-name"]');
    expect((nameInput.element as HTMLInputElement).value).toBe('DataConsumerPolicyRule');
    await wrapper.find('[data-testid="policy-rule-save"]').trigger('click');
    await flushPromises();
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(String(patchCall?.[0])).toContain('/api/v1/policies/p1');
    const body = JSON.parse(String(patchCall?.[1]?.body ?? '[]')) as Array<{ op: string; path: string; value: unknown }>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ op: 'replace', path: '/rules' });
    expect((body[0].value as Array<{ name: string }>).map((rule) => rule.name)).toEqual([
      'DataConsumerPolicy-Rule',
      'DataConsumerPolicyRule',
    ]);
  });

  it('edits a rule by name and replaces only that rule', async () => {
    const { wrapper } = await mountForm({ id: 'p1', ruleName: 'DataConsumerPolicy-Rule' });
    expect(wrapper.find('[data-testid="edit-rule-title"]').exists()).toBe(true);
    const nameInput = wrapper.find('[data-testid="policy-rule-name"]');
    expect((nameInput.element as HTMLInputElement).value).toBe('DataConsumerPolicy-Rule');
    expect((nameInput.element as HTMLInputElement).disabled).toBe(true);
    await wrapper.find('[data-testid="policy-rule-save"]').trigger('click');
    await flushPromises();
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH');
    const body = JSON.parse(String(patchCall?.[1]?.body ?? '[]')) as Array<{ value: unknown }>;
    expect((body[0].value as Array<{ name: string }>)).toHaveLength(1);
    expect((body[0].value as Array<{ name: string }>)[0].name).toBe('DataConsumerPolicy-Rule');
  });

  it('shows an error when the edited rule is not on the policy', async () => {
    const { wrapper } = await mountForm({ id: 'p1', ruleName: 'Missing-Rule' });
    expect(wrapper.text()).toContain('Rule not found');
  });
});
