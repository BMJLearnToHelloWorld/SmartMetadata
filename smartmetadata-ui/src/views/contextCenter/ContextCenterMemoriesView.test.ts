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

function memoryPayload(owners: Array<{ id: string; name: string }> = []): unknown {
  return {
    data: [
      {
        id: 'm1',
        question: 'What is churn?',
        entityStatus: 'Approved',
        pinned: true,
        owners,
      },
    ],
    paging: { total: 1 },
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
});
