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
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import ApplicationCard from './ApplicationCard.vue';

function createCardI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: { label: { disabled: 'Disabled' } } },
  });
}

function mountCard(props: Record<string, unknown>) {
  return mount(ApplicationCard, {
    props: {
      title: 'Search Indexing',
      description: 'Indexes entities',
      linkTitle: 'Configure',
      appName: 'SearchIndexingApplication',
      onClick: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createCardI18n()] },
  });
}

describe('ApplicationCard', () => {
  it('renders the kebab-cased card testid, title, description, and link button', () => {
    const wrapper = mountCard({});
    expect(wrapper.find('[data-testid="search-indexing-application-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Search Indexing');
    expect(wrapper.text()).toContain('Indexes entities');
    const button = wrapper.find('[data-testid="config-btn"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe('Configure');
  });

  it('fires onClick from the card and from the link button', async () => {
    const onClick = vi.fn();
    const wrapper = mountCard({ onClick });
    await wrapper.find('[data-testid="search-indexing-application-card"]').trigger('click');
    await wrapper.find('[data-testid="config-btn"]').trigger('click');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('drops clicks, fades, and shows the badge when deleted', async () => {
    const onClick = vi.fn();
    const wrapper = mountCard({ onClick, deleted: true });
    const card = wrapper.find('[data-testid="search-indexing-application-card"]');
    expect(card.attributes('aria-disabled')).toBe('true');
    expect(card.element.getAttribute('style')).toContain('opacity: 0.65');
    expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="deleted-badge"]').text()).toContain('Disabled');
    await card.trigger('click');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('drops clicks and shows the badge when disabled', async () => {
    const onClick = vi.fn();
    const wrapper = mountCard({ onClick, disabled: true });
    expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(true);
    await wrapper.find('[data-testid="search-indexing-application-card"]').trigger('click');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides the description when showDescription is false', () => {
    const wrapper = mountCard({ showDescription: false });
    expect(wrapper.text()).not.toContain('Indexes entities');
  });

  it('keeps the tooltip trigger out of the tab order when a reason is given', () => {
    const wrapper = mountCard({ disabled: true, disabledReason: 'Disabled by deployment' });
    const trigger = wrapper.find('[tabindex="-1"]');
    expect(trigger.exists()).toBe(true);
  });
});
