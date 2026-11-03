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
import ContextCenterArticlesView from './ContextCenterArticlesView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/context-center/articles', name: 'context-center-articles', component: ContextCenterArticlesView },
      { path: '/context-center/articles/:fqn', name: 'context-center-article', component: ContextCenterArticlesView },
      { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
      { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
      { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
      { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
      { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
      { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
      { path: '/context-center/ai-context/:fqn', name: 'context-center-ai-context-detail', component: { template: '<div />' } },
      { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
    ],
  });
}

describe('ContextCenterArticlesView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/contextCenter/pages/name/')) {
          return jsonResponse({
            id: 'p1',
            name: 'getting-started',
            fullyQualifiedName: 'getting-started',
            displayName: 'Getting Started',
            description: 'Intro.',
            pageType: 'Article',
            page: {},
            updatedBy: 'admin',
          });
        }
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({
            data: [
              { id: 'p1', name: 'getting-started', fullyQualifiedName: 'getting-started', displayName: 'Getting Started', pageType: 'Article', page: {}, updatedBy: 'admin' },
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

  it('renders the article list', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="articles-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
  });

  it('renders article detail for the fqn route', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started');
    await router.isReady();
    const wrapper = mount(ContextCenterArticlesView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Intro.');
  });
});
