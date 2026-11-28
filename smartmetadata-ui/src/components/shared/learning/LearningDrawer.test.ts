/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official LearningDrawer: loading, list, empty, error, Link new-tab,
 * and Video opens ResourcePlayerModal while closing the drawer.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { LearningResourceDetail } from '@/api/learningResources';
import LearningDrawer from './LearningDrawer.vue';

const getLearningResourcesByContext = vi.fn();

vi.mock('@/api/learningResources', () => ({
  getLearningResourcesByContext: (...args: unknown[]) => getLearningResourcesByContext(...args),
  getLearningResourceById: vi.fn(),
}));

vi.mock('./LearningResourceCard.vue', () => ({
  default: {
    name: 'LearningResourceCard',
    props: ['resource'],
    emits: ['click'],
    template:
      '<button data-testid="learning-resource-card" @click="$emit(\'click\', resource)">{{ resource.name }}</button>',
  },
}));

vi.mock('./ResourcePlayerModal.vue', () => ({
  default: {
    name: 'ResourcePlayerModal',
    props: ['open', 'resource', 'onClose'],
    template: '<div v-if="open" data-testid="resource-player-modal" />',
  },
}));

const mockResources: LearningResourceDetail[] = [
  {
    id: '1',
    name: 'Test Resource 1',
    displayName: 'Test Resource 1',
    resourceType: 'Video',
    categories: ['Discovery'],
    source: { url: 'https://example.com/video1' },
    contexts: [{ pageId: 'glossary' }],
  },
  {
    id: '2',
    name: 'Test Resource 2',
    displayName: 'Test Resource 2',
    resourceType: 'Article',
    categories: ['DataGovernance'],
    source: { url: 'https://example.com/article' },
    contexts: [{ pageId: 'glossary' }],
  },
];

const linkResource: LearningResourceDetail = {
  id: '3',
  name: 'Data Seeker Guide',
  resourceType: 'Link',
  categories: ['Discovery'],
  source: { url: 'https://sharepoint.example.com/sites/data/guide' },
  contexts: [{ pageId: 'glossary' }],
};


function qs(selector: string): Element | null {
  return document.querySelector(selector);
}

function qsa(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

function mountDrawer(open = true) {
  const onClose = vi.fn();
  const wrapper = mount(LearningDrawer, {
    props: { open, pageId: 'glossaryTerm', title: 'Glossary Term', onClose },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onClose };
}

describe('official LearningDrawer', () => {
  beforeEach(() => {
    getLearningResourcesByContext.mockReset();
  });

  it('renders the official loader while resources are loading', async () => {
    getLearningResourcesByContext.mockReturnValue(new Promise(() => {}));
    const { wrapper } = mountDrawer();
    await flushPromises();
    expect(getLearningResourcesByContext).toHaveBeenCalledWith('glossaryTerm', {
      limit: 50,
      fields: 'categories,contexts,difficulty,estimatedDuration',
    });
    expect(qs('[data-testid="loader"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('renders resources when loaded successfully', async () => {
    getLearningResourcesByContext.mockResolvedValue({ data: mockResources });
    const { wrapper } = mountDrawer();
    await flushPromises();
    expect(qsa('[data-testid="learning-resource-card"]')).toHaveLength(2);
    expect(qs('[data-testid="learning-drawer"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('renders the official empty copy when no resources are found', async () => {
    getLearningResourcesByContext.mockResolvedValue({ data: [] });
    const { wrapper } = mountDrawer();
    await flushPromises();
    expect(qs('[data-testid="learning-drawer"]')?.textContent).toContain('No learning resources available for this context.');
    wrapper.unmount();
  });

  it('renders the official error copy when the API fails', async () => {
    getLearningResourcesByContext.mockRejectedValue(new Error('API Error'));
    const { wrapper } = mountDrawer();
    await flushPromises();
    expect(qs('[data-testid="learning-drawer"]')?.textContent).toContain('Unable to load learning resources. Please try again later.');
    wrapper.unmount();
  });

  it('does not fetch resources when the drawer is closed', async () => {
    const { wrapper } = mountDrawer(false);
    await flushPromises();
    expect(getLearningResourcesByContext).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renders the official close-drawer button', async () => {
    getLearningResourcesByContext.mockResolvedValue({ data: mockResources });
    const { wrapper, onClose } = mountDrawer();
    await flushPromises();
    (qs('[data-testid="close-drawer"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(onClose).toHaveBeenCalled();
    wrapper.unmount();
  });

  describe('when a resource card is clicked', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      getLearningResourcesByContext.mockResolvedValue({
        data: [...mockResources, linkResource],
      });
    });

    afterEach(() => {
      openSpy.mockRestore();
    });

    it('opens a Link resource in a new tab and keeps the drawer open', async () => {
      const { wrapper, onClose } = mountDrawer();
      await flushPromises();
      const linkCard = qsa('[data-testid="learning-resource-card"]').find((card) => card.textContent === 'Data Seeker Guide');
      expect(linkCard).toBeTruthy();
      (linkCard as HTMLButtonElement).click();
      await flushPromises();
      expect(openSpy).toHaveBeenCalledWith(
        'https://sharepoint.example.com/sites/data/guide',
        '_blank',
        'noopener,noreferrer',
      );
      expect(qs('[data-testid="resource-player-modal"]')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it('opens the resource player for a Video resource and closes the drawer', async () => {
      const { wrapper, onClose } = mountDrawer();
      await flushPromises();
      const videoCard = qsa('[data-testid="learning-resource-card"]').find((card) => card.textContent === 'Test Resource 1');
      expect(videoCard).toBeTruthy();
      (videoCard as HTMLButtonElement).click();
      await flushPromises();
      expect(qs('[data-testid="resource-player-modal"]')).not.toBeNull();
      expect(openSpy).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      wrapper.unmount();
    });
  });
});
