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
import KnowledgePageVersionView from './KnowledgePageVersionView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(): void {
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
          pageType: 'Article',
          page: {},
        });
      }
      if (url.includes('/contextCenter/pages/p1/versions/0.2')) {
        return jsonResponse({
          id: 'p1',
          name: 'getting-started',
          fullyQualifiedName: 'getting-started',
          displayName: 'Getting Started',
          description: 'newer text',
          version: 0.2,
          pageType: 'Article',
          page: {},
        });
      }
      if (url.includes('/contextCenter/pages/p1/versions/')) {
        return jsonResponse({
          id: 'p1',
          name: 'getting-started',
          fullyQualifiedName: 'getting-started',
          displayName: 'Getting Started',
          description: 'new text',
          version: 0.1,
          updatedBy: 'alice',
          updatedAt: 1700000000000,
          owners: [{ id: 'u1', name: 'alice', displayName: 'Alice' }],
          tags: [
            { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
            { tagFQN: 'Glossary.Privacy', name: 'Privacy', source: 'Glossary' },
          ],
          pageType: 'Article',
          page: {},
          changeDescription: {
            fieldsUpdated: [{ name: 'description', oldValue: 'old text', newValue: 'new text' }],
          },
        });
      }
      if (url.endsWith('/contextCenter/pages/p1/versions')) {
        return jsonResponse({
          versions: [
            { version: 0.2, updatedAt: 1700000001000, updatedBy: 'bob' },
            { version: 0.1, updatedAt: 1700000000000, updatedBy: 'alice' },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/context-center/articles/:fqn/versions/:version',
        name: 'context-center-article-version',
        component: KnowledgePageVersionView,
      },
      { path: '/context-center/articles/:fqn', name: 'context-center-article', component: { template: '<div />' } },
      { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
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

describe('KnowledgePageVersionView', () => {
  beforeEach(() => {
    localStorage.clear();
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the version snapshot with its description diff and timeline', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/versions/0.1');
    await router.isReady();
    const wrapper = mount(KnowledgePageVersionView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="article-version-description"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('old text');
    expect(wrapper.text()).toContain('new text');
    expect(wrapper.text()).toContain('PII.Sensitive');
    expect(wrapper.text()).toContain('Glossary.Privacy');
    expect(wrapper.find('[data-testid="article-version-item-0.2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="article-version-item-0.1"]').attributes('disabled')).toBeDefined();
  });

  it('navigates the timeline to the selected version', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = buildRouter();
    await router.push('/context-center/articles/getting-started/versions/0.1');
    await router.isReady();
    const wrapper = mount(KnowledgePageVersionView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await flushPromises();
    await wrapper.find('[data-testid="article-version-item-0.2"]').trigger('click');
    // The click handler fires router.push without awaiting it; drain the
    // navigation before asserting the new route.
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('context-center-article-version');
    expect(router.currentRoute.value.params.version).toBe('0.2');
  });
});
