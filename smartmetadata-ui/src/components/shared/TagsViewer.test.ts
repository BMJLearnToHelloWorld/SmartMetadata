/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official TagsViewer: empty placeholder, sizeCap, popover "+N more".
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import TagsViewer from './TagsViewer.vue';
import type { EntityTag } from '@/utils/tags';

const tags: EntityTag[] = [
  { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
  { tagFQN: 'PII.Email', name: 'Email', source: 'Classification' },
  { tagFQN: 'Tier.Tier1', name: 'Tier1', source: 'Classification' },
];

describe('TagsViewer', () => {
  it('renders the official no-data placeholder when tags are empty', () => {
    const wrapper = mount(TagsViewer, {
      props: { tags: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.text()).toContain('--');
    wrapper.unmount();
  });

  it('renders tags up to sizeCap and official +N more for the rest', async () => {
    const wrapper = mount(TagsViewer, {
      props: { tags, sizeCap: 1 },
      global: { plugins: [Antd, createTestI18n()] },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="tag-"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="plus-more-count"]').text()).toBe('+2 more');
    expect(wrapper.find('[data-testid="popover-element"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders every tag when sizeCap is negative', () => {
    const wrapper = mount(TagsViewer, {
      props: { tags, sizeCap: -1 },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.findAll('[data-testid^="tag-"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="plus-more-count"]').exists()).toBe(false);
    wrapper.unmount();
  });
});