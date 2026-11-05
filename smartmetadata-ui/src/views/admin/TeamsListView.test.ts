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
import EntityListShell from '@/features/crud/EntityListShell.vue';
import TeamsListView from './TeamsListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let teamGrant: 'deny' | 'grant' = 'deny';

async function mountTeams(asAdmin: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/teams', name: 'admin-teams', component: TeamsListView },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
    ],
  });
  await router.push('/admin/teams');
  await router.isReady();
  const wrapper = mount(TeamsListView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return wrapper;
}

describe('TeamsListView P1 dual line', () => {
  beforeEach(() => {
    teamGrant = 'deny';
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/permissions/team')) {
          if (teamGrant === 'grant') {
            return jsonResponse({
              resource: 'team',
              permissions: [
                { operation: 'Create', access: 'allow' },
                { operation: 'EditAll', access: 'allow' },
              ],
            });
          }
          return new Response('not found', { status: 404 });
        }
        if (url.includes('/api/v1/teams')) {
          return jsonResponse({
            data: [{ id: 't1', name: 'Engineering', teamType: 'Group' }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/api/v1/roles')) {
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

  it('shows create and edit entry points for an admin', async () => {
    const view = await mountTeams(true);
    expect(view.find('[data-testid="create-team"]').exists()).toBe(true);
    expect(view.findComponent(EntityListShell).props('showEditAction')).toBe(true);
  });

  it('hides create and edit entry points for a non-admin without a grant', async () => {
    const view = await mountTeams(false);
    expect(view.find('[data-testid="create-team"]').exists()).toBe(false);
    expect(view.findComponent(EntityListShell).props('showEditAction')).toBe(false);
  });

  it('shows create and edit entry points for a non-admin with a team grant', async () => {
    teamGrant = 'grant';
    const view = await mountTeams(false);
    expect(view.find('[data-testid="create-team"]').exists()).toBe(true);
    expect(view.findComponent(EntityListShell).props('showEditAction')).toBe(true);
  });
});
