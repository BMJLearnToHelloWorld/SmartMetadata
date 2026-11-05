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
import GovernanceVersionView from './GovernanceVersionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GovernanceVersionView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/domains/d1/versions/')) {
          return jsonResponse({ id: 'd1', name: 'Finance', description: 'new desc', version: 0.2 });
        }
        if (url.includes('/api/v1/domains/d1/versions')) {
          return jsonResponse({
            versions: [
              {
                version: 0.2,
                updatedAt: 10,
                changeDescription: {
                  fieldsUpdated: [{ name: 'description', oldValue: 'old desc', newValue: 'new desc' }],
                },
              },
              { version: 0.1, updatedAt: 5 },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows the snapshot, the change diff and the plain-text rich-text fallback', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/governance/domains/:id', name: 'governance-domain', component: { template: '<div>domain</div>' } },
        {
          path: '/governance/domains/:id/versions/:version',
          name: 'governance-domain-version',
          component: GovernanceVersionView,
          props: true,
        },
      ],
    });
    await router.push('/governance/domains/d1/versions/0.2');
    await router.isReady();
    const wrapper = mount(GovernanceVersionView, {
      props: { kind: 'domain', id: 'd1', version: '0.2' },
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Finance');
    expect(wrapper.find('[data-testid="governance-version-diff-table"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="governance-version-richtext-diff"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="governance-version-richtext-old"]').text()).toContain('old desc');
    expect(wrapper.find('[data-testid="governance-version-richtext-new"]').text()).toContain('new desc');
    expect(wrapper.find('[data-testid="governance-version-0.1"]').exists()).toBe(true);
    await wrapper.find('[data-testid="governance-version-0.1"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/governance/domains/d1/versions/0.1');
    wrapper.unmount();
  });
});
