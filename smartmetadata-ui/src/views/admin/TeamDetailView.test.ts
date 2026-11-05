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
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import TeamDetailView from './TeamDetailView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let teamGrant: 'deny' | 'grant' = 'deny';

async function mountTeam(asAdmin: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div>teams</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: TeamDetailView, props: true },
    ],
  });
  await router.push({ name: 'admin-team', params: { id: 't1' } });
  await router.isReady();
  const wrapper = mount(TeamDetailView, {
    props: { id: 't1' },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TeamDetailView P1 dual line', () => {
  beforeEach(() => {
    teamGrant = 'deny';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/team/t1')) {
          if (teamGrant === 'grant') {
            return jsonResponse({
              resource: 'team',
              permissions: [{ operation: 'EditAll', access: 'allow' }],
            });
          }
          return new Response('not found', { status: 404 });
        }
        if (url.includes('/api/v1/teams/t1')) {
          return jsonResponse({ id: 't1', name: 'Engineering', teamType: 'Group', users: [] });
        }
        if (url.includes('/api/v1/roles')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/api/v1/users')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the edit button for an admin', async () => {
    const wrapper = await mountTeam(true);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(true);
  });

  it('hides the edit button for a non-admin without a grant', async () => {
    const wrapper = await mountTeam(false);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(false);
  });

  it('shows the edit button for a non-admin with an EditAll grant', async () => {
    teamGrant = 'grant';
    const wrapper = await mountTeam(false);
    expect(wrapper.find('[data-testid="edit-team"]').exists()).toBe(true);
  });
});
