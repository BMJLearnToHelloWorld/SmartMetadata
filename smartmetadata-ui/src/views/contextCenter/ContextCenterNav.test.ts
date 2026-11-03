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
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import ContextCenterNav from './ContextCenterNav.vue';

describe('ContextCenterNav', () => {
  it('links all eight context-center routes', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const names = [
      'context-center-overview',
      'context-center-articles',
      'context-center-documents',
      'context-center-memories',
      'context-center-filter',
      'context-center-integrations',
      'context-center-ai-context',
      'context-center-archive',
    ];
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/context-center', name: 'context-center-overview', component: { template: '<div />' } },
        { path: '/context-center/articles', name: 'context-center-articles', component: { template: '<div />' } },
        { path: '/context-center/documents', name: 'context-center-documents', component: { template: '<div />' } },
        { path: '/context-center/memories', name: 'context-center-memories', component: { template: '<div />' } },
        { path: '/context-center/filter', name: 'context-center-filter', component: { template: '<div />' } },
        { path: '/context-center/integrations', name: 'context-center-integrations', component: { template: '<div />' } },
        { path: '/context-center/ai-context', name: 'context-center-ai-context', component: { template: '<div />' } },
        { path: '/context-center/archive', name: 'context-center-archive', component: { template: '<div />' } },
      ],
    });
    await router.push('/context-center');
    await router.isReady();
    const wrapper = mount(ContextCenterNav, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    await flushPromises();
    for (const name of names) {
      expect(wrapper.find(`[data-testid="context-center-nav-${name}"]`).exists()).toBe(true);
    }
  });
});
