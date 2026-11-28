/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official EntityHeaderTitle: icon, displayName, name, deleted badge,
 * badge/suffix, and copy-URL button.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import EntityHeaderTitle from './EntityHeaderTitle.vue';

function mountTitle(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(EntityHeaderTitle, {
    props: { name: 'Business_Glossary', displayName: 'Business Glossary', serviceName: '', ...props },
    slots,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('official EntityHeaderTitle', () => {
  it('renders displayName, name, and the copy-URL button', () => {
    const wrapper = mountTitle();
    expect(wrapper.find('[data-testid="-Business_Glossary"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="entity-header-display-name"]').text()).toBe('Business Glossary');
    expect(wrapper.get('[data-testid="entity-header-name"]').text()).toBe('Business_Glossary');
    expect(wrapper.find('[data-testid="entity-header-copy-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="deleted-badge"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="entity-header-display-name"]').attributes('style') ?? '').not.toContain('color:');
    wrapper.unmount();
  });

  it('shows the official deleted badge and keeps badge and suffix slots', () => {
    const wrapper = mountTitle({ deleted: true }, {
      icon: '<span data-testid="header-icon" />',
      badge: '<span data-testid="entity-status-badge">Approved</span>',
      suffix: '<span data-testid="learning-icon" />',
    });
    expect(wrapper.find('[data-testid="header-icon"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="deleted-badge"]').text()).toContain('Deleted');
    expect(wrapper.find('[data-testid="entity-status-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('copies the current URL and updates the official success tooltip', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mountTitle({ entityUrl: 'https://example.test/glossary/g1/versions/1.0' });
    await wrapper.get('[data-testid="entity-header-copy-button"]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('https://example.test/glossary/g1/versions/1.0');
    wrapper.unmount();
  });

  it('renders name as the title when displayName is absent', () => {
    const wrapper = mountTitle({ name: 'Customer', displayName: undefined });
    expect(wrapper.find('[data-testid="entity-header-display-name"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="entity-header-name"]').text()).toBe('Customer');
    wrapper.unmount();
  });
});
