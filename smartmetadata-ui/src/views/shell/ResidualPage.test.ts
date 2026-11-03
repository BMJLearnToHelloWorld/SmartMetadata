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
      // Stub routes so RouterLink targets in the onward-links block resolve.
      ...(def.links ?? []).map((link) => ({
        path: `/stub/${link.routeName}`,
        name: link.routeName,
        component: { template: '<div />' },
      })),
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
    ]);
    const { wrapper, def } = await mountPage('ontology-explorer');
    expect(wrapper.find(`[data-testid="${def.testId}"]`).exists()).toBe(true);
    expect(wrapper.text()).toContain('Ontology Explorer');
    expect(wrapper.find('[data-testid="residual-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/residual|not wired|no ontology/i);
    expect(wrapper.findAll('table').length).toBe(0);
  });

  it('no longer lists Context Center shells (P2 B1 replaced them with real pages)', () => {
    const names = RESIDUAL_PAGES.map((page) => page.name);
    expect(names.some((name) => name.startsWith('context-center-'))).toBe(false);
  });
});

describe('ResidualPage onward links (Fix6)', () => {
  it('renders working links instead of leaving the residual page a dead end', async () => {
    const { wrapper, def } = await mountPage('marketplace-overview');
    expect(def.links?.length).toBeGreaterThan(0);
    const domainsLink = wrapper.get('[data-testid="residual-link-governance-domains"]');
    expect(domainsLink.text()).toBe('Domains');
    expect(wrapper.get('[data-testid="residual-link-governance-data-products"]').text()).toBe('Data Products');
    expect(wrapper.find('[data-testid="residual-links"]').exists()).toBe(true);
    await domainsLink.trigger('click');
    await flushPromises();
    expect(wrapper.vm.$router.currentRoute.value.name).toBe('governance-domains');
  });
});
