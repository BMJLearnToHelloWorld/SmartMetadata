/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import DomainFilterChip from './DomainFilterChip.vue';
import { useDomainStore } from '@/stores/domain';
import type { Domain } from '@/types/governance';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      settings: {
        services: {
          domain: {
            filteredBy: 'Filtered by domain',
            clearFilter: 'Clear domain filter',
          },
        },
      },
    },
  },
});

function domain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: 'domain-1',
    name: 'Finance',
    displayName: 'Finance Domain',
    fullyQualifiedName: 'Finance',
    ...overrides,
  } as Domain;
}

describe('DomainFilterChip', () => {
  it('renders nothing when no domain is active', () => {
    setActivePinia(createPinia());
    const wrapper = mount(DomainFilterChip, { global: { plugins: [i18n] } });
    expect(wrapper.find('[data-testid="domain-filter-chip"]').exists()).toBe(false);
  });

  it('shows the filtered-by text and the domain badge', () => {
    setActivePinia(createPinia());
    const store = useDomainStore();
    store.domains = [domain()];
    store.selectDomain('domain-1');
    const wrapper = mount(DomainFilterChip, { global: { plugins: [i18n] } });
    const chip = wrapper.find('[data-testid="domain-filter-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('Filtered by domain');
    expect(chip.text()).toContain('Finance Domain');
  });

  it('falls back to the domain name when no display name exists', () => {
    setActivePinia(createPinia());
    const store = useDomainStore();
    store.domains = [domain({ displayName: undefined })];
    store.selectDomain('domain-1');
    const wrapper = mount(DomainFilterChip, { global: { plugins: [i18n] } });
    expect(wrapper.find('[data-testid="domain-filter-chip"]').text()).toContain('Finance');
  });

  it('clears the active domain when the clear button is clicked', async () => {
    setActivePinia(createPinia());
    const store = useDomainStore();
    store.domains = [domain()];
    store.selectDomain('domain-1');
    const wrapper = mount(DomainFilterChip, { global: { plugins: [i18n] } });
    await wrapper.find('[data-testid="domain-filter-chip-clear"]').trigger('click');
    expect(store.activeDomain).toBeNull();
    expect(wrapper.find('[data-testid="domain-filter-chip"]').exists()).toBe(false);
  });
});
