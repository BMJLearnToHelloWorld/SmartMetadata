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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestI18n } from '@/test/i18n';
import { listKnowledgePages } from '@/api/contextCenter';
import type { KnowledgePage } from '@/types/contextCenter';
import WidgetKnowledgePagesCell from './WidgetKnowledgePagesCell.vue';

vi.mock('@/api/contextCenter', () => ({
  listKnowledgePages: vi.fn(),
}));

const mockedListKnowledgePages = vi.mocked(listKnowledgePages);

const PAGES: KnowledgePage[] = [
  {
    id: 'p1',
    name: 'getting-started',
    fullyQualifiedName: 'Getting Started',
    displayName: 'Getting Started',
    pageType: 'Article',
  },
  {
    id: 'p2',
    name: 'runbook',
    fullyQualifiedName: 'Runbook',
    displayName: 'Runbook',
    pageType: 'QuickLink',
    pageUrl: 'https://example.com/runbook',
  },
];

function mountCell() {
  return mount(WidgetKnowledgePagesCell, {
    attachTo: document.body,
    props: { entityId: 'e1', entityType: 'table' },
    global: {
      plugins: [Antd, createTestI18n()],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('WidgetKnowledgePagesCell', () => {
  it('fetches the entity pages and renders articles and quick links', async () => {
    mockedListKnowledgePages.mockResolvedValue({ data: PAGES, total: 2 });
    const wrapper = mountCell();
    await vi.waitFor(() => expect(mockedListKnowledgePages).toHaveBeenCalled());
    await nextTick();
    expect(mockedListKnowledgePages).toHaveBeenCalledWith({ entityId: 'e1', entityType: 'table', limit: 10 });
    expect(wrapper.text()).toContain('Getting Started');
    expect(wrapper.text()).toContain('Runbook');
    expect(wrapper.find('[data-testid="knowledge-page-article"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="knowledge-page-quick-link"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="knowledge-pages-view-all"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a view-all link when the total exceeds the page size', async () => {
    mockedListKnowledgePages.mockResolvedValue({ data: PAGES, total: 12 });
    const wrapper = mountCell();
    await vi.waitFor(() => expect(wrapper.find('[data-testid="knowledge-pages-view-all"]').exists()).toBe(true));
    wrapper.unmount();
  });

  it('renders nothing when the list is empty', async () => {
    mockedListKnowledgePages.mockResolvedValue({ data: [], total: 0 });
    const wrapper = mountCell();
    await vi.waitFor(() => expect(mockedListKnowledgePages).toHaveBeenCalled());
    await nextTick();
    expect(wrapper.find('[data-testid="widget-knowledge-pages-cell"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders nothing when the load fails', async () => {
    mockedListKnowledgePages.mockRejectedValue(new Error('load failed'));
    const wrapper = mountCell();
    await vi.waitFor(() => expect(mockedListKnowledgePages).toHaveBeenCalled());
    await nextTick();
    expect(wrapper.find('[data-testid="widget-knowledge-pages-cell"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
