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
import FormSectionCard from './FormSectionCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(FormSectionCard, {
    props: { title: 'Connection', description: 'Where it connects.', ...props },
    slots: { default: '<div data-testid="section-body">fields</div>' },
    global: { plugins: [Antd] },
  });
}

describe('FormSectionCard (official section cards)', () => {
  it('renders title, description, index and badge, with the body open', () => {
    const wrapper = mountCard({ index: 1, badgeText: '2 required', badgeTone: 'error' });
    expect(wrapper.find('.form-section-title').text()).toBe('Connection');
    expect(wrapper.find('.form-section-description').text()).toBe('Where it connects.');
    expect(wrapper.find('.form-section-index').text()).toBe('1');
    expect(wrapper.text()).toContain('2 required');
    expect(wrapper.find('[data-testid="section-body"]').exists()).toBe(true);
  });

  it('starts closed when collapsible with defaultOpen false, and toggles on header click', async () => {
    const wrapper = mountCard({ collapsible: true, defaultOpen: false });
    expect(wrapper.find('[data-testid="section-body"]').exists()).toBe(false);
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="section-body"]').exists()).toBe(true);
    expect(wrapper.emitted('headerActivate')).toHaveLength(1);
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="section-body"]').exists()).toBe(false);
  });

  it('fires headerActivate on header focus and keeps the section active while focus stays inside (L-10)', async () => {
    const wrapper = mountCard({ collapsible: true, defaultOpen: false });
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('focus');
    expect(wrapper.emitted('headerActivate')).toHaveLength(1);
    // focusin bubbles to the card and marks it active.
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('focusin');
    expect(wrapper.classes()).toContain('form-section-card-active');
    // Focus leaving the card clears the active state.
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('focusout');
    expect(wrapper.classes()).not.toContain('form-section-card-active');
  });

  it('never toggles a non-collapsible section', async () => {
    const wrapper = mountCard({ collapsible: false, defaultOpen: true });
    await wrapper.find('[data-testid="form-section-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="section-body"]').exists()).toBe(true);
    expect(wrapper.find('.form-section-chevron').exists()).toBe(false);
  });
});
