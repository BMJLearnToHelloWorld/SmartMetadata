/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import PersonaListView from './PersonaListView.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountList(asAdmin = true, paged = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings/persona', name: 'admin-settings-persona', component: PersonaListView },
      {
        path: '/admin/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: { template: '<div>detail</div>' },
      },
    ],
  });
  await router.push('/admin/settings/persona');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/personas') && init?.method === 'POST') {
        return jsonResponse({ id: 'p9', name: 'Auditor', fullyQualifiedName: 'Auditor' });
      }
      if (url.includes('/v1/personas')) {
        if (paged) {
          const after = new URL(url, 'http://test').searchParams.get('after');
          return after === 'c1'
            ? jsonResponse({
              data: [{ id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' }],
              paging: { total: 2 },
            })
            : jsonResponse({
              data: [{ id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' }],
              paging: { total: 2, after: 'c1' },
            });
        }
        return jsonResponse({
          data: [
            { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst', users: [{ id: 'u1', name: 'ada', type: 'user' }] },
            { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward' },
          ],
          paging: { total: 2 },
        });
      }
      if (url.includes('/v1/users')) {
        return jsonResponse({
          data: [{ id: 'u1', name: 'ada' }, { id: 'u2', name: 'grace' }],
          paging: { total: 2 },
        });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(PersonaListView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, requests };
}

describe('PersonaListView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders persona cards from the list endpoint', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="persona-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-card-Analyst"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-card-Steward"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Users: 1');
  });

  it('hides the create button for non-admins', async () => {
    const { wrapper } = await mountList(false);
    expect(wrapper.find('[data-testid="persona-create-button"]').exists()).toBe(false);
  });

  it('creates a persona with POST including selected user ids', async () => {
    const { wrapper, requests } = await mountList();
    await wrapper.find('[data-testid="persona-create-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="persona-create-name"]').setValue('Auditor');
    const userOption = wrapper.find('[data-testid="persona-user-option-u2"]');
    expect(userOption.exists()).toBe(true);
    await wrapper.find('[data-testid="persona-user-option-u2"]').setChecked();
    await flushPromises();
    const okButton = wrapper.find('.ant-modal-footer .ant-btn-primary');
    await okButton.trigger('click');
    await flushPromises();
    const post = requests.find((req) => req.url.includes('/v1/personas') && req.init?.method === 'POST');
    expect(post).toBeDefined();
    expect(String(post?.init?.body)).toContain('"name":"Auditor"');
    expect(String(post?.init?.body)).toContain('"users":["u2"]');
  });

  it('navigates to the detail page on card click', async () => {
    const { wrapper, router } = await mountList();
    await wrapper.find('[data-testid="persona-card-Steward"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.params.fqn).toBe('Steward');
  });

  it('advances the cursor on next and walks back on previous', async () => {
    const { wrapper, requests } = await mountList(true, true);
    // The client always sends an explicit method, so list calls are GET.
    const listCalls = () => requests.filter((req) => req.url.includes('/v1/personas') && req.init?.method !== 'POST');
    expect(listCalls()).toHaveLength(1);
    expect(listCalls()[0]?.url).not.toContain('after=');
    await wrapper.find('[data-testid="persona-next"]').trigger('click');
    await flushPromises();
    expect(listCalls()).toHaveLength(2);
    expect(listCalls()[1]?.url).toContain('after=c1');
    expect(wrapper.find('[data-testid="persona-card-Steward"]').exists()).toBe(true);
    await wrapper.find('[data-testid="persona-prev"]').trigger('click');
    await flushPromises();
    expect(listCalls()).toHaveLength(3);
    expect(listCalls()[2]?.url).not.toContain('after=');
    expect(wrapper.find('[data-testid="persona-card-Analyst"]').exists()).toBe(true);
  });
});
