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
import PersonaDetailView from './PersonaDetailView.vue';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DETAIL = {
  id: 'p1',
  name: 'Analyst',
  fullyQualifiedName: 'Analyst',
  displayName: 'Data Analyst',
  description: 'Analysts group',
  users: [{ id: 'u1', name: 'ada', type: 'user' }],
  default: false,
};

async function mountDetail(initialPath = '/settings/persona/Analyst') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { id: 'admin', name: 'admin', isAdmin: true };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: PersonaDetailView,
        props: true,
      },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: { template: '<div>customize</div>' },
      },
      {
        path: '/settings/persona',
        name: 'admin-settings-persona',
        component: { template: '<div>list</div>' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/personas/name/')) {
        return jsonResponse({ ...DETAIL });
      }
      if (url.includes('/v1/personas/p1') && init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
        const next = { ...DETAIL };
        for (const op of patch) {
          if (op.path === '/users') {
            next.users = op.value as typeof next.users;
          }
          if (op.path === '/default') {
            next.default = op.value as boolean;
          }
          if (op.path === '/displayName') {
            next.displayName = op.value as string;
          }
        }
        return jsonResponse(next);
      }
      if (url.includes('/v1/users')) {
        return jsonResponse({
          data: [
            { id: 'u1', name: 'ada' },
            { id: 'u2', name: 'grace' },
          ],
          paging: { total: 2 },
        });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(PersonaDetailView, {
    props: { fqn: 'Analyst' },
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, requests };
}

async function openUsersTab(wrapper: Awaited<ReturnType<typeof mountDetail>>['wrapper']) {
  const tabs = wrapper.findAll('.ant-tabs-tab');
  const usersTab = tabs.find((tab) => tab.text().includes('Users'));
  expect(usersTab).toBeDefined();
  await usersTab?.trigger('click');
  await flushPromises();
}

describe('PersonaDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the detail header and customize cards', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="persona-detail-name"]').text()).toBe('Data Analyst');
    expect(wrapper.find('[data-testid="persona-customize-app-layout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-customize-DataMarketplace"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-customize-askCollateSidebar"]').exists()).toBe(
      false,
    );
  });

  it('writes the default #customize-ui hash when the URL has none', async () => {
    const { router } = await mountDetail();
    expect(router.currentRoute.value.hash).toBe('#customize-ui');
  });

  it('navigates a leaf customize card to the top-level customize route', async () => {
    const { wrapper, router } = await mountDetail();
    await wrapper.find('[data-testid="persona-customize-app-layout"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('customize-page');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst', pageFqn: 'app-layout' });
  });

  it('drilling into a parent card only changes the hash and swaps in the sub-options', async () => {
    const { wrapper, router } = await mountDetail();
    await wrapper.find('[data-testid="persona-customize-data-assets"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.hash).toBe('#customize-ui.data-assets');
    expect(wrapper.findAll('[data-testid^="persona-customize-option-"]')).toHaveLength(19);
    expect(wrapper.find('[data-testid="persona-customize-navigation"]').exists()).toBe(false);
  });

  it('honours a drilled-in hash on load', async () => {
    const { wrapper, router } = await mountDetail('/settings/persona/Analyst#customize-ui.governance');
    expect(router.currentRoute.value.hash).toBe('#customize-ui.governance');
    expect(wrapper.findAll('[data-testid^="persona-customize-option-"]')).toHaveLength(4);
  });

  it('honours the #users hash on load and switches tabs through the hash', async () => {
    const { wrapper, router } = await mountDetail('/settings/persona/Analyst#users');
    expect(wrapper.find('[data-testid="persona-user-u1"]').exists()).toBe(true);
    const tabs = wrapper.findAll('.ant-tabs-tab');
    const customizeTab = tabs.find((tab) => tab.text().includes('Customize'));
    await customizeTab?.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.hash).toBe('#customize-ui');
    expect(wrapper.find('[data-testid="persona-customize-navigation"]').exists()).toBe(true);
  });

  it('renders the row-1 breadcrumb trail without a Settings root', async () => {
    const { wrapper } = await mountDetail();
    const crumbs = wrapper.find('[data-testid="persona-breadcrumb"]');
    expect(crumbs.exists()).toBe(true);
    const links = crumbs.findAll('a');
    expect(links.map((link) => link.text())).toEqual(['Personas', 'Data Analyst']);
    expect(links[0].attributes('href')).toBe('/settings/persona');
    expect(links[1].attributes('href')).toBe('/settings/persona/Analyst#customize-ui');
    expect(crumbs.text()).not.toContain('Settings');
  });

  it('appends the drilled-in category label to the breadcrumb trail', async () => {
    const { wrapper } = await mountDetail('/settings/persona/Analyst#customize-ui.governance');
    const crumbs = wrapper.find('[data-testid="persona-breadcrumb"]');
    expect(crumbs.text()).toContain('Governance');
    // The category crumb carries no link.
    expect(crumbs.findAll('a')).toHaveLength(2);
  });

  it('toggles the default flag with a PATCH', async () => {
    const { wrapper, requests } = await mountDetail();
    await wrapper.find('[data-testid="persona-default-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    const patch = requests.find(
      (req) => req.url.includes('/v1/personas/p1') && req.init?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(String(patch?.init?.body)).toContain('"/default"');
    expect(String(patch?.init?.body)).toContain('true');
  });

  it('removes a user with a users replace PATCH', async () => {
    const { wrapper, requests } = await mountDetail();
    await openUsersTab(wrapper);
    expect(wrapper.find('[data-testid="persona-user-u1"]').exists()).toBe(true);
    await wrapper.find('[data-testid="persona-user-remove-u1"]').trigger('click');
    await flushPromises();
    const patch = requests.find(
      (req) => req.url.includes('/v1/personas/p1') && req.init?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(String(patch?.init?.body)).toContain('"/users"');
    expect(String(patch?.init?.body)).toContain('"value":[]');
  });

  it('adds a user with a merged users PATCH', async () => {
    const { wrapper, requests } = await mountDetail();
    await openUsersTab(wrapper);
    await wrapper.find('[data-testid="persona-add-users-button"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="persona-user-option-u2"]').setChecked();
    await flushPromises();
    await wrapper.find('.ant-modal-footer .ant-btn-primary').trigger('click');
    await flushPromises();
    const patch = requests.find(
      (req) => req.url.includes('/v1/personas/p1') && req.init?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(String(patch?.init?.body)).toContain('u1');
    expect(String(patch?.init?.body)).toContain('u2');
  });
});
