/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AppAnalyticsView from './AppAnalyticsView.vue';

describe('AppAnalyticsView', () => {
  it('renders the four official blocks as honest residuals, with no charts', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/insights/app-analytics', name: 'insights-app-analytics', component: AppAnalyticsView }],
    });
    await router.push({ name: 'insights-app-analytics' });
    await router.isReady();
    const wrapper = mount(AppAnalyticsView, { global: { plugins: [router, Antd, createTestI18n()] } });
    for (const block of ['top-view-entities', 'page-views-by-entities', 'daily-active-users', 'top-active-users']) {
      expect(wrapper.find(`[data-testid="app-analytics-${block}-empty"]`).exists()).toBe(true);
    }
    expect(wrapper.text()).toContain('web-analytics');
  });
});
