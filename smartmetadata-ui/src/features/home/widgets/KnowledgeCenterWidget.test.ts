/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import ArticleFormModal from '@/views/contextCenter/ArticleFormModal.vue';
import KnowledgeCenterWidget from './KnowledgeCenterWidget.vue';

const listKnowledgePages = vi.fn();
const createKnowledgePage = vi.fn();
const getResourcePermission = vi.fn();
const getLimitByResource = vi.fn();
vi.mock('@/api/contextCenter', () => ({
  createKnowledgePage: (...args: unknown[]) => createKnowledgePage(...args),
  listKnowledgePages: (...args: unknown[]) => listKnowledgePages(...args),
}));
vi.mock('@/api/limits', () => ({
  getLimitByResource: (...args: unknown[]) => getLimitByResource(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));

function page(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `page-${id}`,
    fullyQualifiedName: `page-${id}`,
    displayName: `Page ${id}`,
    pageType: 'Article',
    updatedAt: Date.now() - 60_000,
    ...overrides,
  };
}

function mountWidget(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/context-center/articles',
        name: 'context-center-articles',
        component: { template: '<div>articles</div>' },
      },
      {
        path: '/context-center/articles/:fqn',
        name: 'context-center-article',
        component: { template: '<div>article</div>' },
      },
    ],
  });
  return mount(KnowledgeCenterWidget, {
    props: { widgetKey: 'knowledgeCenter', ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('KnowledgeCenterWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
    getLimitByResource.mockResolvedValue({ featureLimitStatuses: [] });
  });

  it('lists the most recently updated pages first, 6 rows, with the recent count', async () => {
    const pages = Array.from({ length: 8 }, (_, i) => page(`p${i}`));
    listKnowledgePages.mockResolvedValue({ data: pages, total: 8 });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(listKnowledgePages).toHaveBeenCalledWith({
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    expect(wrapper.findAll('[data-testid^="context-page-p"]')).toHaveLength(6);
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-summary"]').text()).toContain(
      '8 pages updated this week',
    );
  });

  it('marks the count as a floor when every fetched page is recent and more exist', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => page(`p${i}`));
    listKnowledgePages.mockResolvedValue({ data: pages, total: 25 });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-summary"]').text()).toContain(
      '10+ pages updated this week',
    );
  });

  it('shows Caught up when nothing is recent', async () => {
    listKnowledgePages.mockResolvedValue({
      data: [page('old', { updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 })],
      total: 1,
    });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-status"]').text()).toContain(
      'Caught up',
    );
  });

  it('opens a quick link externally only when the URL is safe', async () => {
    listKnowledgePages.mockResolvedValue({
      data: [
        page('safe', { pageType: 'QuickLink', pageUrl: 'https://example.com/guide' }),
        page('unsafe', { pageType: 'QuickLink', pageUrl: 'javascript:alert(1)' }),
      ],
      total: 2,
    });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    const safe = wrapper.get('[data-testid="context-page-open-safe"]');
    expect(safe.attributes('href')).toBe('https://example.com/guide');
    expect(safe.attributes('target')).toBe('_blank');
    // An unsafe URL falls back to the article page button.
    expect(wrapper.get('[data-testid="context-page-open-unsafe"]').element.tagName).toBe('BUTTON');
  });

  it('renders the empty state with the create action when creation is allowed', async () => {
    listKnowledgePages.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-empty"]').text()).toContain(
      'No articles yet',
    );
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-empty-action"]').text()).toContain(
      'New article',
    );
  });

  it('still offers create when the knowledgeCenter limit is reached: the limit is a post-create refresh, not a gate', async () => {
    getLimitByResource.mockResolvedValue({
      featureLimitStatuses: [{ limitReached: true }],
    });
    listKnowledgePages.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-knowledgeCenter-empty-action"]').text()).toContain(
      'New article',
    );
    // No limit lookup happens on load: the button is gated on canCreate only.
    expect(getLimitByResource).not.toHaveBeenCalled();
  });

  it('refreshes the limit after a successful create', async () => {
    listKnowledgePages.mockResolvedValue({ data: [], total: 0 });
    createKnowledgePage.mockResolvedValue({});
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    await wrapper.get('[data-testid="home-widget-knowledgeCenter-empty-action"]').trigger('click');
    await flushPromises();
    wrapper
      .findComponent(ArticleFormModal)
      .vm.$emit('ok', { name: 'new-page', pageType: 'Article' });
    await flushPromises();
    await flushPromises();
    expect(createKnowledgePage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'new-page', pageType: 'Article' }),
    );
    expect(getLimitByResource).toHaveBeenCalledWith('knowledgeCenter');
  });

  it('stage D: forwards edit view and collapse to the card despite the fragment root', async () => {
    // The widget renders a fragment root (card + article modal beside
    // it), so the edit-view/collapse props cannot fall through — they
    // are declared and forwarded explicitly.
    listKnowledgePages.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountWidget({ editView: true, collapsible: true, collapsed: false });
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="drag-widget-knowledgeCenter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-widget-knowledgeCenter"]').exists()).toBe(true);
    expect(wrapper.find('.home-widget-card__body').exists()).toBe(true);
    await wrapper.get('[data-testid="home-widget-knowledgeCenter-collapse"]').trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
    const collapsed = mountWidget({ editView: true, collapsible: true, collapsed: true });
    await flushPromises();
    await flushPromises();
    expect(collapsed.find('.home-widget-card__body').exists()).toBe(false);
  });
});
