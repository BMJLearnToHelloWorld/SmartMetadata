/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official EntityStatusBadge: hide Unprocessed; show entityStatus ?? Approved.
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import EntityStatusBadge from './EntityStatusBadge.vue';

function mountBadge(status: string) {
  return mount(EntityStatusBadge, {
    props: { status },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('official EntityStatusBadge', () => {
  it('renders the official entity-status-badge for Approved', () => {
    const wrapper = mountBadge('Approved');
    expect(wrapper.find('[data-testid="entity-status-badge"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Approved');
    wrapper.unmount();
  });

  it('hides Unprocessed', () => {
    const wrapper = mountBadge('Unprocessed');
    expect(wrapper.find('[data-testid="entity-status-badge"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Unprocessed');
    wrapper.unmount();
  });
});
