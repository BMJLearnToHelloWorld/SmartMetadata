/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PersonaCustomizeGrid from './PersonaCustomizeGrid.vue';

async function mountGrid(activeCategory?: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings/persona/:fqn',
        name: 'admin-settings-persona-detail',
        component: { template: '<div>detail</div>' },
      },
      {
        path: '/customize-page/:fqn/:pageFqn',
        name: 'customize-page',
        component: { template: '<div>customize</div>' },
      },
    ],
  });
  await router.push('/settings/persona/Analyst');
  await router.isReady();
  const wrapper = mount(PersonaCustomizeGrid, {
    props: { personaFqn: 'Analyst', activeCategory },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('PersonaCustomizeGrid', () => {
  it('renders the 6 scope cards in official order and no askCollateSidebar card', async () => {
    const { wrapper } = await mountGrid();
    const cards = wrapper.findAll('[data-testid^="persona-customize-"]');
    expect(cards.map((card) => card.attributes('data-testid'))).toEqual([
      'persona-customize-navigation',
      'persona-customize-app-layout',
      'persona-customize-LandingPage',
      'persona-customize-DataMarketplace',
      'persona-customize-governance',
      'persona-customize-data-assets',
    ]);
    expect(wrapper.find('[data-testid="persona-customize-askCollateSidebar"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="persona-customize-navigation"]').text()).toContain(
      'Navigation',
    );
    expect(wrapper.find('[data-testid="persona-customize-navigation"]').text()).toContain(
      'Customize left sidebar',
    );
  });

  it('R-ENTRY-ICON: covered category cards render an icon, residual cards render none and no missing marker', async () => {
    const { wrapper } = await mountGrid();
    expect(
      wrapper.find('[data-testid="persona-customize-LandingPage"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="persona-customize-DataMarketplace"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="persona-customize-governance"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="persona-customize-navigation"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="persona-customize-app-layout"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="persona-customize-data-assets"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(false);
    expect(wrapper.find('[data-testid="sm-icon-missing"]').exists()).toBe(false);
  });

  it('R-ENTRY-ICON: covered sub-options render icons, Glossary on the shared Glossary glyph', async () => {
    const { wrapper } = await mountGrid('governance');
    expect(
      wrapper.find('[data-testid="persona-customize-option-Domain"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="persona-customize-option-GlossaryTerm"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="persona-customize-option-Glossary"]').find('[data-testid="sm-icon"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="sm-icon-missing"]').exists()).toBe(false);
  });

  it('R-ENTRY-ICON: all 19 data-assets sub-options render icons', async () => {
    const { wrapper } = await mountGrid('data-assets');
    const options = wrapper.findAll('[data-testid^="persona-customize-option-"]');
    expect(options).toHaveLength(19);
    for (const option of options) {
      expect(option.find('[data-testid="sm-icon"]').exists()).toBe(true);
    }
    expect(wrapper.find('[data-testid="sm-icon-missing"]').exists()).toBe(false);
  });

  it('navigates a leaf card to the top-level customize route', async () => {
    const { wrapper, router } = await mountGrid();
    await wrapper.find('[data-testid="persona-customize-app-layout"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('customize-page');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst', pageFqn: 'app-layout' });
  });

  it('a parent card only changes the hash', async () => {
    const { wrapper, router } = await mountGrid();
    await wrapper.find('[data-testid="persona-customize-governance"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.hash).toBe('#customize-ui.governance');
  });

  it('renders the 4 governance sub-options when drilled in', async () => {
    const { wrapper } = await mountGrid('governance');
    const options = wrapper.findAll('[data-testid^="persona-customize-option-"]');
    expect(options.map((option) => option.attributes('data-testid'))).toEqual([
      'persona-customize-option-DataProduct',
      'persona-customize-option-Domain',
      'persona-customize-option-Glossary',
      'persona-customize-option-GlossaryTerm',
    ]);
    expect(wrapper.find('[data-testid="persona-customize-option-Domain"]').text()).toContain(
      'Domain',
    );
  });

  it('renders the 19 data-assets sub-options without Tag or Classification', async () => {
    const { wrapper } = await mountGrid('data-assets');
    const options = wrapper.findAll('[data-testid^="persona-customize-option-"]');
    expect(options).toHaveLength(19);
    const keys = options.map((option) => option.attributes('data-testid'));
    expect(keys).not.toContain('persona-customize-option-Tag');
    expect(keys).not.toContain('persona-customize-option-Classification');
    expect(keys).not.toContain('persona-customize-option-LandingPage');
    expect(keys).not.toContain('persona-customize-option-DataMarketplace');
  });

  it('navigates a sub-option to the top-level customize route', async () => {
    const { wrapper, router } = await mountGrid('governance');
    await wrapper.find('[data-testid="persona-customize-option-Domain"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('customize-page');
    expect(router.currentRoute.value.params).toEqual({ fqn: 'Analyst', pageFqn: 'Domain' });
  });

  it('renders an empty grid for a leaf key or an unknown category, as official does', async () => {
    const leaf = await mountGrid('navigation');
    expect(leaf.wrapper.findAll('[data-testid^="persona-customize-"]')).toHaveLength(0);
    const unknown = await mountGrid('bogus');
    expect(unknown.wrapper.findAll('[data-testid^="persona-customize-"]')).toHaveLength(0);
  });
});
