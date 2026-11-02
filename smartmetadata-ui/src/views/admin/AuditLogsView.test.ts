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
import AuditLogsView from './AuditLogsView.vue';

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
    routes: [{ path: '/admin/settings/audit-logs', name: 'admin-settings-audit-logs', component: AuditLogsView }],
  });
  await router.push('/admin/settings/audit-logs');
  await router.isReady();
  const wrapper = mount(AuditLogsView, {
    global: { plugins: [pinia, router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('AuditLogsView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/audit/logs')) {
          return jsonResponse({
            data: [
              {
                id: 7,
                eventTs: 1700000000000,
                eventType: 'CREATE',
                userName: 'admin',
                actorType: 'USER',
                entityType: 'table',
                entityFQN: 'svc.db.orders',
                summary: 'Table created',
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
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders audit logs from GET /v1/audit/logs and states the export residual', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="audit-logs-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('svc.db.orders');
    expect(wrapper.find('[data-testid="audit-export-residual"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="audit-logs-table"]').exists()).toBe(true);
  });

  it('applies the user filter to the request', async () => {
    const wrapper = await mountView();
    await wrapper.find('[data-testid="audit-user"]').setValue('admin');
    await wrapper.find('[data-testid="audit-apply"]').trigger('click');
    await flushPromises();
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('userName=admin'))).toBe(true);
  });

  it('shows an honest error when the audit endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="entity-list-error"]').exists()).toBe(true);
  });
});
