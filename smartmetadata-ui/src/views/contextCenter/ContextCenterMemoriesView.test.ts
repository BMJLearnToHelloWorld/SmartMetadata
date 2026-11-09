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
import { useAuthStore } from '@/stores/auth';
import { createTestI18n } from '@/test/i18n';
import ContextCenterMemoriesView from './ContextCenterMemoriesView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function allowPermissions(resource: string): Response {
  return jsonResponse({
    resource,
    permissions: [
      { operation: 'Create', access: 'allow' },
      { operation: 'EditAll', access: 'allow' },
      { operation: 'Delete', access: 'allow' },
    ],
  });
}

function memoryPayload(
  owners: Array<{ id: string; name: string }> = [],
  total = 1,
): unknown {
  return {
    data: [
      {
        id: 'm1',
        name: 'churn-rate',
        question: 'What is churn?',
        entityStatus: 'Approved',
        pinned: true,
        owners,
      },
    ],
    paging: { total },
  };
}

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/context-center/memories', name: 'context-center-memories', component: ContextCenterMemoriesView },
      { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
      { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
      { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
      { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
      { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
      { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
      { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
    ],
  });
}

async function mountMemories() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = buildRouter();
  await router.push('/context-center/memories');
  await router.isReady();
  const wrapper = mount(ContextCenterMemoriesView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, pinia };
}

function setInputValue(selector: string, value: string): void {
  const el = document.querySelector(selector) as HTMLTextAreaElement | HTMLInputElement | null;
  if (!el) {
    throw new Error(`missing element ${selector}`);
  }
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function click(selector: string): void {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) {
    throw new Error(`missing element ${selector}`);
  }
  el.click();
}

describe('ContextCenterMemoriesView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        return jsonResponse(memoryPayload());
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders memories with status and pin control', { timeout: 15000 }, async () => {
    const { wrapper } = await mountMemories();
    expect(wrapper.find('[data-testid="memories-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('What is churn?');
    expect(wrapper.find('[data-testid="memory-pin-m1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="memories-create"]').exists()).toBe(true);
  });

  it('hides create and pin when the permission request fails (fail-closed)', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return new Response('forbidden', { status: 403 });
        }
        return jsonResponse(memoryPayload());
      }),
    );
    const { wrapper } = await mountMemories();
    expect(wrapper.find('[data-testid="memories-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="memories-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="memory-pin-m1"]').exists()).toBe(false);
  });

  it('shows row delete to the memory owner', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        return jsonResponse(memoryPayload([{ id: 'u-alice', name: 'alice' }]));
      }),
    );
    const { wrapper } = await mountMemories();
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    await wrapper.get('[data-testid="row-overflow-m1"]').trigger('click');
    await flushPromises();
    const del = [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-delete"]')].at(-1);
    expect(del).not.toBeUndefined();
  });

  it('hides row delete from a non-owner non-admin', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        return jsonResponse(memoryPayload([{ id: 'u-alice', name: 'alice' }]));
      }),
    );
    const { wrapper } = await mountMemories();
    const auth = useAuthStore();
    auth.user = { id: 'u-bob', name: 'bob' };
    await wrapper.get('[data-testid="row-overflow-m1"]').trigger('click');
    await flushPromises();
    const del = [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-delete"]')].at(-1);
    expect(del).toBeUndefined();
  });

  it('shows row delete to an admin who is not the owner', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        return jsonResponse(memoryPayload([{ id: 'u-alice', name: 'alice' }]));
      }),
    );
    const { wrapper } = await mountMemories();
    const auth = useAuthStore();
    auth.user = { id: 'u-root', name: 'admin', isAdmin: true };
    await wrapper.get('[data-testid="row-overflow-m1"]').trigger('click');
    await flushPromises();
    const del = [...document.querySelectorAll<HTMLElement>('[data-testid="row-overflow-delete"]')].at(-1);
    expect(del).not.toBeUndefined();
  });

  it('pages by offset: page 2 requests offset=25 and never a cursor (R-W13-1)', { timeout: 15000 }, async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        return jsonResponse(memoryPayload([], 27));
      }),
    );
    const { wrapper } = await mountMemories();
    const listUrls = () => urls.filter((url) => url.includes('/v1/contextCenter/memories') && url.includes('limit=25'));
    expect(listUrls().length).toBeGreaterThanOrEqual(1);
    expect(listUrls()[0]).toContain('offset=0');
    await wrapper.get('[data-testid="entity-list-next"]').trigger('click');
    await flushPromises();
    expect(listUrls().length).toBeGreaterThanOrEqual(2);
    expect(listUrls().at(-1)).toContain('offset=25');
    for (const url of listUrls()) {
      expect(url).not.toContain('after=');
      expect(url).not.toContain('before=');
    }
  });

  it('shows the three tab counts', { timeout: 15000 }, async () => {
    const { wrapper } = await mountMemories();
    expect(wrapper.text()).toContain('All (1)');
    expect(wrapper.text()).toContain('Created by me (0)');
    expect(wrapper.text()).toContain('Needs review (1)');
  });

  it('renders the conflict review list on the needs-review tab and hides the shell', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        if (url.includes('/v1/tasks')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return jsonResponse(memoryPayload());
      }),
    );
    const { wrapper } = await mountMemories();
    const tab = wrapper
      .findAll('.ant-tabs-tab')
      .find((node) => node.text().includes('Needs review'));
    expect(tab).not.toBeUndefined();
    await tab!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="memory-reviews"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="memories-table"]').exists()).toBe(false);
  });

  it('creates a memory with a slug name and question equal to answer', { timeout: 15000 }, async () => {
    const calls: Array<{ url: string; method: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : '' });
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        if (init?.method === 'POST' && url.includes('/v1/contextCenter/memories')) {
          return jsonResponse({ id: 'm-new', name: 'churn', question: 'What is churn rate?' }, 201);
        }
        return jsonResponse(memoryPayload());
      }),
    );
    const { wrapper } = await mountMemories();
    await wrapper.get('[data-testid="memories-create"]').trigger('click');
    await flushPromises();
    // The FormModal test-id does not land on a DOM node (antd Modal drops
    // it); the form fields inside the teleported modal do carry testids.
    expect(document.querySelector('[data-testid="memory-form-memory"]')).not.toBeNull();
    setInputValue('[data-testid="memory-form-title"]', 'Churn');
    setInputValue('[data-testid="memory-form-memory"]', 'What is churn rate?');
    await flushPromises();
    click('.ant-modal-footer .ant-btn-primary');
    await flushPromises();
    const post = calls.find(
      (call) => call.method === 'POST' && call.url.includes('/v1/contextCenter/memories'),
    );
    expect(post).not.toBeUndefined();
    const body = JSON.parse(post!.body) as Record<string, unknown>;
    expect(body.name).toBe('churn');
    expect(body.question).toBe('What is churn rate?');
    expect(body.answer).toBe('What is churn rate?');
  });

  it('deletes soft from the edit modal (no hardDelete), unlike the list row', { timeout: 15000 }, async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET' });
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('contextMemory');
        }
        if (init?.method === 'DELETE' && url.includes('/v1/contextCenter/memories/')) {
          return new Response(null, { status: 200 });
        }
        return jsonResponse(memoryPayload([{ id: 'u-alice', name: 'alice' }]));
      }),
    );
    const { wrapper } = await mountMemories();
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    await wrapper.get('[data-testid="row-overflow-m1"]').trigger('click');
    await flushPromises();
    const edit = [...document.querySelectorAll<HTMLElement>('[data-testid="memory-edit-m1"]')].at(-1);
    expect(edit).not.toBeUndefined();
    edit!.click();
    await flushPromises();
    expect(document.querySelector('[data-testid="memory-form-memory"]')).not.toBeNull();
    click('[data-testid="memory-form-delete"]');
    await flushPromises();
    expect(document.querySelector('.ant-modal-confirm-btns .ant-btn-primary')).not.toBeNull();
    click('.ant-modal-confirm-btns .ant-btn-primary');
    await flushPromises();
    const del = calls.find(
      (call) => call.method === 'DELETE' && call.url.includes('/v1/contextCenter/memories/m1'),
    );
    expect(del).not.toBeUndefined();
    expect(del!.url).not.toContain('hardDelete');
  });

  it('copies the ?memory= deep link to the clipboard', { timeout: 15000 }, async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { wrapper } = await mountMemories();
    await wrapper.get('[data-testid="row-overflow-m1"]').trigger('click');
    await flushPromises();
    const copy = [...document.querySelectorAll<HTMLElement>('[data-testid="memory-copy-link-m1"]')].at(-1);
    expect(copy).not.toBeUndefined();
    copy!.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain('?memory=churn-rate');
  });
});
