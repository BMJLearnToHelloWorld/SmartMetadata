/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official LearningIcon hides when the resource count is 0 or the fetch fails.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LearningIcon from './LearningIcon.vue';

const listLearningResources = vi.fn();

vi.mock('@/api/learningResources', () => ({
  listLearningResources: (...args: unknown[]) => listLearningResources(...args),
}));

function mountIcon() {
  return mount(LearningIcon, {
    props: { pageId: 'glossaryTerm' },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('official LearningIcon', () => {
  it('shows the official learning-icon when resources exist', async () => {
    listLearningResources.mockReset().mockResolvedValue({ data: [{}], total: 2 });
    const wrapper = mountIcon();
    await flushPromises();
    expect(listLearningResources).toHaveBeenCalledWith({ pageId: ['glossaryTerm'], limit: 1 });
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides when the resource count is 0', async () => {
    listLearningResources.mockReset().mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountIcon();
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides when the fetch fails', async () => {
    listLearningResources.mockReset().mockRejectedValue(new Error('network'));
    const wrapper = mountIcon();
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
