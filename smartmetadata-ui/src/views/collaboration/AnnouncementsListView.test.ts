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
import AnnouncementsListView from './AnnouncementsListView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/announcements', name: 'announcements', component: AnnouncementsListView }],
  });
  await router.push('/announcements');
  await router.isReady();
  const wrapper = mount(AnnouncementsListView, {
    global: { plugins: [pinia, router, Antd] },
  });
  await flushPromises();
  return { wrapper };
}

describe('AnnouncementsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/announcements')) {
          return jsonResponse({
            data: [{ id: 'a1', displayName: 'Maintenance', description: 'Window', type: 'Notice' }],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders announcements from GET /v1/announcements', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Maintenance');
    expect(wrapper.text()).toContain('Notice');
    expect(wrapper.find('[data-testid="announcements-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-announcement"]').exists()).toBe(true);
  });
});
