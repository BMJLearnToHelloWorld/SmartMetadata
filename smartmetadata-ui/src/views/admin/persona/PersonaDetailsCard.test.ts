/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Persona } from '@/types/persona';
import PersonaDetailsCard from './PersonaDetailsCard.vue';

const MESSAGES = {
  en: {
    label: { default: 'Default', 'no-description': 'No description' },
  },
};

async function mountCard(persona: Persona) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/persona/:fqn', name: 'admin-settings-persona-detail', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const i18n = createI18n({ legacy: false, locale: 'en', messages: MESSAGES });
  const wrapper = mount(PersonaDetailsCard, {
    global: { plugins: [Antd, router, i18n] },
    props: { persona },
  });
  return { wrapper, router };
}

describe('PersonaDetailsCard', () => {
  it('shows the Default badge only for the default persona', async () => {
    const { wrapper } = await mountCard({
      id: 'p1',
      name: 'Analyst',
      fullyQualifiedName: 'Analyst',
      default: true,
    });
    expect(wrapper.find('[data-testid="default-persona-tag"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Default');
    wrapper.unmount();

    const second = await mountCard({ id: 'p2', name: 'Auditor', fullyQualifiedName: 'Auditor' });
    expect(second.wrapper.find('[data-testid="default-persona-tag"]').exists()).toBe(false);
    second.wrapper.unmount();
  });

  it('renders the description preview, or the no-description text when empty', async () => {
    const { wrapper } = await mountCard({
      id: 'p1',
      name: 'Analyst',
      fullyQualifiedName: 'Analyst',
      description: 'Sees the governed catalog.',
    });
    expect(wrapper.text()).toContain('Sees the governed catalog.');
    expect(wrapper.text()).not.toContain('No description');
    wrapper.unmount();

    const second = await mountCard({ id: 'p2', name: 'Auditor', fullyQualifiedName: 'Auditor' });
    expect(second.wrapper.text()).toContain('No description');
    second.wrapper.unmount();
  });

  it('navigates to the detail page with the customize-ui hash on click', async () => {
    const { wrapper, router } = await mountCard({
      id: 'p1',
      name: 'Analyst',
      fullyQualifiedName: 'Analyst',
      displayName: 'Data Analyst',
    });
    expect(wrapper.find('[data-testid="persona-details-card-Analyst"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Analyst');
    await wrapper.find('[data-testid="persona-details-card-Analyst"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings-persona-detail');
    expect(router.currentRoute.value.params.fqn).toBe('Analyst');
    expect(router.currentRoute.value.hash).toBe('#customize-ui');
    wrapper.unmount();
  });

  it('does not navigate without a fully qualified name and shows no users count', async () => {
    const { wrapper, router } = await mountCard({
      id: 'p1',
      name: 'Analyst',
      fullyQualifiedName: '',
    });
    await wrapper.find('[data-testid="persona-details-card-Analyst"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
    expect(wrapper.text()).not.toMatch(/\d+\s*users?/i);
    wrapper.unmount();
  });
});
