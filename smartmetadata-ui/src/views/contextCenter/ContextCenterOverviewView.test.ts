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
import ContextCenterOverviewView from './ContextCenterOverviewView.vue';

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

describe('ContextCenterOverviewView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
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
    expect(wrapper.find('[data-testid="overview-create-article"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-upload-document"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-create-folder"]').exists()).toBe(true);
    // Third row (G-22): recently-viewed and most-cited cards, empty states
    // when nothing is recorded or cited yet.
    expect(wrapper.find('[data-testid="recently-viewed-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="most-cited-memories-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No recently viewed pages yet.');
    expect(wrapper.text()).toContain('Cited 0 times');
  });

  it('shows recorded recent pages and most-cited memories in appliedCount order', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return allowPermissions('page');
        }
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
            // Returned in the server's appliedCount-desc order (the view
            // renders the API order; sorting itself is the server's job,
            // requested via sortBy=appliedCount — asserted below).
            data: [
              { id: 'm1', question: 'What is churn?', appliedCount: 7 },
              { id: 'm2', question: 'Second memory?', appliedCount: 3 },
            ],
            paging: { total: 5 },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 'u-alice', name: 'alice' };
    localStorage.setItem(
      'sm.contextCenter.recentlyViewed.v1:alice',
      JSON.stringify([
        { id: 'p1', title: 'Getting Started', pageType: 'Article', fullyQualifiedName: 'getting-started', timestamp: 2000 },
        { id: 'q1', title: 'Handbook', pageType: 'QuickLink', pageUrl: 'https://example.com/handbook', fullyQualifiedName: 'q1', timestamp: 1000 },
      ]),
    );
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
    const recent = wrapper.find('[data-testid="recently-viewed-card"]').text();
    expect(recent).toContain('Getting Started');
    expect(recent).toContain('Handbook');
    expect(recent.indexOf('Getting Started')).toBeLessThan(recent.indexOf('Handbook'));
    const cited = wrapper.find('[data-testid="most-cited-memories-card"]').text();
    expect(cited).toContain('Cited 7 times');
    expect(cited).toContain('Cited 3 times');
    expect(cited.indexOf('What is churn?')).toBeLessThan(cited.indexOf('Second memory?'));
    const memoryCalls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(memoryCalls.some((url) => url.includes('sortBy=appliedCount'))).toBe(true);
  });

  it('hides the creation entries when the permission request fails (fail-closed)', { timeout: 15000 }, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/permissions/')) {
          return new Response('forbidden', { status: 403 });
        }
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
    expect(wrapper.find('[data-testid="overview-create-article"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-upload-document"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-create-folder"]').exists()).toBe(false);
    // The read-only overview itself still renders.
    expect(wrapper.find('[data-testid="overview-pillar-articles"]').exists()).toBe(true);
  });
});
