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
import ContextCenterAiContextView from './ContextCenterAiContextView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ContextCenterAiContextView', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/personas/aiContext/status')) {
          return jsonResponse({
            data: [{ personaId: 'per1', entitiesIncluded: 7, tokensEst: 1200, lastGeneratedAt: 1700000000000 }],
            paging: { total: 1 },
          });
        }
        if (url.includes('/personas')) {
          return jsonResponse({
            data: [
              {
                id: 'per1',
                name: 'analyst',
                fullyQualifiedName: 'analyst',
                displayName: 'Analyst',
                users: [{ name: 'amy' }],
                contextDefinition: { enabled: true, characterBudget: 4000, rules: [{ entityType: 'table' }] },
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

  it('renders personas with users, rules, entities, and budget', { timeout: 15000 }, async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: ContextCenterAiContextView },
        { path: '/context-center/ai-context/:fqn', name: 'context-center-ai-context-detail', component: ContextCenterAiContextView },
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center/ai-context');
    await router.isReady();
    const wrapper = mount(ContextCenterAiContextView, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-context-table"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Analyst');
    expect(wrapper.text()).toContain('1200 / 4000');
    expect(wrapper.find('[data-testid="ai-context-enabled-analyst"]').exists()).toBe(true);
  });
});
