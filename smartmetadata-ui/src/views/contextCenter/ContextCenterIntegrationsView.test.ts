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
import ContextCenterIntegrationsView from './ContextCenterIntegrationsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ContextCenterIntegrationsView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            { id: 'f1', name: 'spec.pdf', displayName: 'Spec', sourceType: 'Confluence' },
            { id: 'f2', name: 'notes.pdf', displayName: 'Notes', sourceType: 'Notion' },
          ],
          paging: { total: 2 },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('groups context files by official source type', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/integrations', name: 'context-center-integrations', component: ContextCenterIntegrationsView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/integrations');
    await router.isReady();
    const wrapper = mount(ContextCenterIntegrationsView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="integrations-group-Confluence"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="integrations-group-Notion"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Spec');
    expect(wrapper.text()).toContain('Notes');
  });
});
