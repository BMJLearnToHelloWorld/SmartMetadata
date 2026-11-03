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
import ContextCenterOverviewView from './ContextCenterOverviewView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ContextCenterOverviewView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/contextCenter/pages')) {
          return jsonResponse({
            data: [{ id: 'p1', name: 'getting-started', fullyQualifiedName: 'getting-started', displayName: 'Getting Started', pageType: 'Article', page: {} }],
            paging: { total: 4 },
          });
        }
        if (url.includes('/contextCenter/drive/files')) {
          return jsonResponse({
            data: [{ id: 'f1', name: 'guide.pdf', displayName: 'Guide', fileExtension: 'pdf' }],
            paging: { total: 2 },
          });
        }
        if (url.includes('/contextCenter/drive/folders')) {
          return jsonResponse({
            data: [{ id: 'd1', name: 'handbook', displayName: 'Handbook', childrenCount: 3 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/contextCenter/memories')) {
          return jsonResponse({
            data: [{ id: 'm1', question: 'What is churn?' }],
            paging: { total: 5 },
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

  it('renders recent articles, documents, folders, and memories', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center', name: 'context-center-overview', component: ContextCenterOverviewView },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/articles/:fqn', name: 'context-center-article', component: { template: '<div />' } },
        { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/ai-context/:fqn', name: 'context-center-ai-context-detail', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center');
    await router.isReady();
    const wrapper = mount(ContextCenterOverviewView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="context-center-overview"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Guide');
    expect(wrapper.text()).toContain('Handbook');
    expect(wrapper.text()).toContain('What is churn?');
    expect(wrapper.find('[data-testid="overview-pillar-articles"]').exists()).toBe(true);
  });
});
