/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
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
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper };
}

describe('AnnouncementsListView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/announcements')) {
          if (init?.method === 'PATCH') {
            return jsonResponse({ id: 'a1', displayName: 'Maintenance', description: 'Window moved', type: 'Notice' });
          }
          if (init?.method === 'DELETE') {
            return jsonResponse({});
          }
          return jsonResponse({
            data: [
              {
                id: 'a1',
                displayName: 'Maintenance',
                description: 'Window',
                type: 'Notice',
                startTime: 1762051200000,
                endTime: 1762054800000,
              },
            ],
            paging: { total: 1 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders announcements from GET /v1/announcements', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain('Maintenance');
    expect(wrapper.text()).toContain('Notice');
    expect(wrapper.find('[data-testid="announcements-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="create-announcement"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="announcement-edit-a1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="announcement-delete-a1"]').exists()).toBe(true);
  });

  it('deletes after confirmation and reloads the list', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="announcement-delete-a1"]').trigger('click');
    await flushPromises();
    const confirmButton = document.querySelector('.ant-modal-confirm-btns .ant-btn-primary');
    expect(confirmButton).not.toBeNull();
    (confirmButton as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const calls = vi.mocked(fetch).mock.calls.map(([input, init]) => ({ url: String(input), init }));
    expect(calls.some((call) => call.url.includes('/api/v1/announcements/a1') && call.init?.method === 'DELETE')).toBe(true);
  });

  it('edits with a patch containing only changed fields', async () => {
    const { wrapper } = await mountView();
    await wrapper.find('[data-testid="announcement-edit-a1"]').trigger('click');
    await flushPromises();
    const description = document.querySelector('[data-testid="announcement-edit-description"]') as HTMLTextAreaElement | null;
    expect(description).not.toBeNull();
    await new DOMWrapper(description!).setValue('Window moved');
    await flushPromises();
    const okButton = document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement | null;
    expect(okButton).not.toBeNull();
    okButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const patch = vi
      .mocked(fetch)
      .mock.calls.map(([input, init]) => ({ url: String(input), init }))
      .find((call) => call.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch!.init?.body))).toEqual([
      { op: 'replace', path: '/description', value: 'Window moved' },
    ]);
  });
});
