/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listKnowledgePages } from '@/api/contextCenter';
import { listTags } from '@/api/tags';
import { getUserFollows } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { listRecentlyViewed } from '@/stores/contextCenterRecent';
import { createTestI18n } from '@/test/i18n';
import ArticlesRightPanel from './ArticlesRightPanel.vue';

vi.mock('@/api/users', () => ({ getUserFollows: vi.fn() }));
vi.mock('@/api/tags', () => ({ listTags: vi.fn() }));
vi.mock('@/api/contextCenter', () => ({ listKnowledgePages: vi.fn() }));
vi.mock('@/stores/contextCenterRecent', () => ({ listRecentlyViewed: vi.fn() }));

const mockedFollows = vi.mocked(getUserFollows);
const mockedListTags = vi.mocked(listTags);
const mockedListPages = vi.mocked(listKnowledgePages);
const mockedRecent = vi.mocked(listRecentlyViewed);

function mountPanel(props: { refreshSignal?: number; canCreate?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'u1', name: 'alice', email: 'alice@example.com' };
  const wrapper = mount(ArticlesRightPanel, {
    props: { refreshSignal: 0, canCreate: true, ...props },
    global: { plugins: [pinia, Antd, createTestI18n()] },
  });
  return { wrapper, auth };
}

function tagPayload(fqn: string) {
  return {
    data: [{ id: `tag-${fqn}`, name: fqn.split('.')[1], fullyQualifiedName: fqn, owners: [] }],
    total: 1,
  };
}

function pagePayload(id: string, name: string) {
  return {
    data: [
      {
        id,
        name,
        fullyQualifiedName: name,
        displayName: name,
        pageType: 'Article' as const,
      },
    ],
    total: 1,
  };
}

describe('ArticlesRightPanel', () => {
  beforeEach(() => {
    mockedFollows.mockResolvedValue([
      { id: 'p1', type: 'page', name: 'getting-started', fullyQualifiedName: 'getting-started' },
    ]);
    mockedRecent.mockReturnValue([
      {
        id: 'p2',
        title: 'Guide',
        pageType: 'Article',
        fullyQualifiedName: 'guide',
        timestamp: Date.now(),
      },
    ]);
    mockedListTags.mockResolvedValue(tagPayload('KnowledgeCenter.Guides'));
    mockedListPages.mockResolvedValue(pagePayload('p3', 'how-to'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders bookmarks, recent entries and tag groups, skipping empty groups', async () => {
    mockedListPages.mockResolvedValueOnce(pagePayload('p3', 'how-to'));
    const { wrapper } = mountPanel();
    await flushPromises();
    expect(mockedFollows).toHaveBeenCalledWith('u1');
    expect(mockedListTags).toHaveBeenCalledWith({ parent: 'KnowledgeCenter', limit: 25 });
    expect(mockedListPages).toHaveBeenCalledWith({ fields: 'owners,tags', tagFQN: 'KnowledgeCenter.Guides' });
    expect(wrapper.find('[data-testid="articles-bookmark-p1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="articles-recent-p2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="articles-quick-link-p3"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Guides');
  });

  it('skips a tag group with no pages', async () => {
    mockedListPages.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = mountPanel();
    await flushPromises();
    expect(wrapper.find('[data-testid="articles-tag-group-KnowledgeCenter.Guides"]').exists()).toBe(false);
  });

  it('shows the whole-panel empty state only when there are no tags at all', async () => {
    mockedListTags.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = mountPanel();
    await flushPromises();
    expect(wrapper.find('[data-testid="articles-right-panel-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="articles-bookmark-p1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="articles-right-panel-create-quick-link"]').exists()).toBe(true);
  });

  it('hides the create button in the empty state when the user cannot create', async () => {
    mockedListTags.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = mountPanel({ canCreate: false });
    await flushPromises();
    expect(wrapper.find('[data-testid="articles-right-panel-create-quick-link"]').exists()).toBe(false);
  });

  it('emits open-page for a bookmark and add-quick-link for the empty-state button', async () => {
    mockedListTags.mockResolvedValue({ data: [], total: 0 });
    const { wrapper } = mountPanel();
    await flushPromises();
    await wrapper.find('[data-testid="articles-right-panel-create-quick-link"]').trigger('click');
    expect(wrapper.emitted('add-quick-link')).toHaveLength(1);

    mockedListTags.mockResolvedValue(tagPayload('KnowledgeCenter.Guides'));
    await wrapper.setProps({ refreshSignal: 1 });
    await flushPromises();
    await wrapper.find('[data-testid="articles-bookmark-p1"]').trigger('click');
    expect(wrapper.emitted('open-page')).toEqual([
      [{ fullyQualifiedName: 'getting-started' }],
    ]);
  });

  it('reloads when the refresh signal bumps', async () => {
    const { wrapper } = mountPanel();
    await flushPromises();
    expect(mockedListTags).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ refreshSignal: 1 });
    await flushPromises();
    expect(mockedListTags).toHaveBeenCalledTimes(2);
  });
});
