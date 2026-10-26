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
import { createTestI18n } from '@/test/i18n';
import HomeHero from './HomeHero.vue';

function mountHero(props: Record<string, unknown> = {}) {
  return mount(HomeHero, {
    props: {
      userName: 'admin',
      domains: [{ value: 'finance', label: 'Finance' }],
      selectedDomain: '',
      serviceChips: [{ key: 'try_min2', count: 3 }],
      ...props,
    },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('HomeHero', () => {
  it('greets the user and emits search, domain, and service-chip actions', async () => {
    const wrapper = mountHero();
    expect(wrapper.get('[data-testid="home-hero-welcome"]').text()).toBe('Welcome, admin!');
    const input = wrapper.get('[data-testid="home-hero-search"]');
    expect(input.attributes('placeholder')).toBe('Search for Tables, Database, Schema...');
    await input.setValue('orders');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('search')?.[0]).toEqual(['orders']);
    wrapper.getComponent({ name: 'ASelect' }).vm.$emit('change', 'finance');
    await flushPromises();
    expect(wrapper.emitted('update:selectedDomain')?.[0]).toEqual(['finance']);
    await wrapper.get('[data-testid="home-hero-chip-try_min2"]').trigger('click');
    expect(wrapper.emitted('selectService')?.[0]).toEqual(['try_min2']);
  });

  it('keeps All Domains visible and marks it residual when the domains API is empty', () => {
    const wrapper = mountHero({ domains: [], domainsUnavailable: true, serviceChips: [] });
    expect(wrapper.get('[data-testid="home-hero-domain"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="home-hero-domain-residual"]').text()).toContain('No domains');
    expect(wrapper.find('[data-testid="home-hero-chips"]').exists()).toBe(false);
  });
});
