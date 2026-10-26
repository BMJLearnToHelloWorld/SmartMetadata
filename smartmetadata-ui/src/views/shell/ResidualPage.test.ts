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
import { RESIDUAL_PAGES } from '@/layouts/residualPages';
import { createTestI18n } from '@/test/i18n';
import ResidualPage from './ResidualPage.vue';

async function mountPage(name: string) {
  const def = RESIDUAL_PAGES.find((page) => page.name === name);
  if (!def) {
    throw new Error(`missing residual page ${name}`);
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: `/${def.path}`,
        name: def.name,
        component: ResidualPage,
        meta: { ...def },
      },
    ],
  });
  await router.push({ name: def.name });
  await router.isReady();
  const wrapper = mount(ResidualPage, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, def };
}

describe('ResidualPage', () => {
  it('lists every residual nav shell with an honest empty and no invented rows', async () => {
    expect(RESIDUAL_PAGES.map((page) => page.name)).toEqual([
      'marketplace-overview',
      'ontology-explorer',
      'column-bulk-ops',
      'workflows',
      'context-center-overview',
      'context-center-articles',
      'context-center-documents',
      'context-center-memories',
      'context-center-archive',
    ]);
    const { wrapper, def } = await mountPage('ontology-explorer');
    expect(wrapper.find(`[data-testid="${def.testId}"]`).exists()).toBe(true);
    expect(wrapper.text()).toContain('Ontology Explorer');
    expect(wrapper.find('[data-testid="residual-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/residual|not wired|no ontology/i);
    expect(wrapper.findAll('table').length).toBe(0);
  });

  it('keeps Context Center articles empty without fake CMS copy', async () => {
    const { wrapper } = await mountPage('context-center-articles');
    expect(wrapper.text()).toContain('Articles');
    expect(wrapper.find('[data-testid="residual-empty"]').exists()).toBe(true);
    expect(wrapper.text().toLowerCase()).not.toContain('lorem');
  });
});
