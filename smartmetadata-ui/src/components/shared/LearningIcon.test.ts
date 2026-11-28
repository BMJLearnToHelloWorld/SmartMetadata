/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official LearningIcon hides when the resource count is 0 or the fetch
 * fails, and opens official LearningDrawer on icon or resources click.
 */
import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import LearningIcon from './LearningIcon.vue';

const getLearningResourcesByContext = vi.fn();

vi.mock('@/api/learningResources', () => ({
  getLearningResourcesByContext: (...args: unknown[]) => getLearningResourcesByContext(...args),
}));

vi.mock('@/components/shared/learning/LearningDrawer.vue', () => ({
  default: {
    name: 'LearningDrawer',
    props: ['open', 'pageId', 'title', 'onClose'],
    template:
      '<div v-if="open" data-testid="learning-drawer"><button data-testid="close-drawer" @click="onClose()"></button></div>',
  },
}));

function mountIcon() {
  return mount(LearningIcon, {
    props: { pageId: 'glossaryTerm' },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('official LearningIcon', () => {
  it('shows the official learning-icon when resources exist', async () => {
    getLearningResourcesByContext.mockReset().mockResolvedValue({ data: [{}], total: 2 });
    const wrapper = mountIcon();
    await flushPromises();
    expect(getLearningResourcesByContext).toHaveBeenCalledWith('glossaryTerm', { limit: 1 });
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="learning-drawer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides when the resource count is 0', async () => {
    getLearningResourcesByContext.mockReset().mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountIcon();
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides when the fetch fails', async () => {
    getLearningResourcesByContext.mockReset().mockRejectedValue(new Error('network'));
    const wrapper = mountIcon();
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the official LearningDrawer when the icon is clicked and closes it', async () => {
    getLearningResourcesByContext.mockReset().mockResolvedValue({ data: [{}], total: 2 });
    const wrapper = mountIcon();
    await flushPromises();
    await wrapper.get('[data-testid="learning-icon"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-drawer"]').exists()).toBe(true);
    await wrapper.get('[data-testid="close-drawer"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-drawer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the official LearningDrawer from the resources button', async () => {
    getLearningResourcesByContext.mockReset().mockResolvedValue({ data: [{}], total: 5 });
    const wrapper = mountIcon();
    await flushPromises();
    await wrapper.get('[data-testid="learning-icon"]').trigger('mouseenter');
    await nextTick();
    await flushPromises();
    const button = document.querySelector('[data-testid="learning-resources-button"]');
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    await flushPromises();
    expect(wrapper.find('[data-testid="learning-drawer"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
