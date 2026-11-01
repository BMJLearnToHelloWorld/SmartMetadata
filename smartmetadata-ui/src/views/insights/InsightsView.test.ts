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
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import InsightsView from './InsightsView.vue';

const stub = { template: '<div />' };

async function mountWithTab(tab: string | undefined) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights', name: 'insights', component: InsightsView },
      { path: '/insights/data-assets', name: 'insights-data-assets', component: stub },
      { path: '/insights/app-analytics', name: 'insights-app-analytics', component: stub },
      { path: '/insights/kpis', name: 'insights-kpis', component: stub },
      { path: '/insights/online-users', name: 'insights-online-users', component: stub },
    ],
  });
  await router.push({ name: 'insights', query: tab === undefined ? {} : { tab } });
  await router.isReady();
  mount(InsightsView, { global: { plugins: [router, Antd, createTestI18n()] } });
  await flushPromises();
  return router;
}

describe('InsightsView compatibility shell', () => {
  it('redirects a known legacy tab query to the split route', async () => {
    const router = await mountWithTab('kpis');
    expect(router.currentRoute.value.name).toBe('insights-kpis');
  });

  it('redirects an unknown or missing tab to data-assets, like the official page', async () => {
    const router = await mountWithTab('bogus');
    expect(router.currentRoute.value.name).toBe('insights-data-assets');
    const router2 = await mountWithTab(undefined);
    expect(router2.currentRoute.value.name).toBe('insights-data-assets');
  });
});
