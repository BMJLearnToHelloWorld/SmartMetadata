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
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import CuratedAssetsWidget from './CuratedAssetsWidget.vue';
import CuratedAssetsModal from './CuratedAssetsModal.vue';

const searchAssets = vi.fn();
const postAggregateFieldOptions = vi.fn();
vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return {
    ...actual,
    searchAssets: (...args: unknown[]) => searchAssets(...args),
    postAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args),
  };
});

function hit(fqn: string) {
  return {
    id: fqn,
    name: fqn,
    fullyQualifiedName: fqn,
    entityType: 'table',
    serviceType: 'BigQuery',
    tier: 'Tier.Tier1',
  };
}

function mountWidget(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  return mount(CuratedAssetsWidget, {
    props: { widgetKey: 'KnowledgePanel.CuratedAssets', ...props },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('CuratedAssetsWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    postAggregateFieldOptions.mockResolvedValue({ aggregations: {} });
  });

  it('shows the chip rule, the match count, and rows with tier leaves', async () => {
    searchAssets.mockResolvedValue({ hits: [hit('a.b')], total: 5, facets: [] });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(searchAssets).toHaveBeenCalledWith('', 0, 10, {
      index: 'dataAsset',
      query_filter: expect.any(String),
    });
    expect(wrapper.get('[data-testid="curated-rule-summary"]').text()).toContain('Tier is Tier1');
    expect(wrapper.get('[data-testid="curated-rule-summary"]').text()).toContain(
      'Certification is Gold',
    );
    expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-summary"]').text()).toContain(
      'Tier is Tier1 and Certification is Gold',
    );
    expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-status"]').text()).toContain(
      '5 assets match the rule',
    );
    expect(wrapper.get('[data-testid="curated-asset-a.b"]').text()).toContain('Tier1');
    expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-meta"]').text()).toContain(
      '4 more assets match the rule',
    );
  });

  it('reads a saved filter from the layout entry, never from a widgetConfig prop', async () => {
    searchAssets.mockResolvedValue({ hits: [], total: 0, facets: [] });
    const wrapper = mountWidget({
      currentLayout: [
        {
          i: 'KnowledgePanel.CuratedAssets',
          x: 0,
          y: 0,
          w: 1,
          h: 3,
          static: false,
          config: {
            title: 'Gold tables',
            queryFilter: '{"query":{"bool":{"must":[{"term":{"entityType":"table"}}]}}}',
            resources: ['table'],
          },
        },
      ],
    });
    await flushPromises();
    await flushPromises();
    const filter = JSON.parse(
      (searchAssets.mock.calls[0]?.[3] as { query_filter?: string }).query_filter ?? '',
    ) as Record<string, unknown>;
    expect(filter).toEqual({
      query: {
        bool: {
          must: [
            { bool: { must: [{ term: { entityType: 'table' } }] } },
            { bool: { should: [{ term: { entityType: 'table' } }] } },
          ],
        },
      },
    });
    expect(wrapper.get('.home-widget-card__title').text()).toContain('Gold tables');
    // A saved filter has no chip phrase: the count is the summary instead.
    expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-summary"]').text()).toContain(
      '0 assets match the rule',
    );
    expect(wrapper.find('[data-testid="curated-rule-summary"]').exists()).toBe(false);
  });

  it('shows the empty state with the rule phrase when nothing matches', async () => {
    searchAssets.mockResolvedValue({ hits: [], total: 0, facets: [] });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-empty"]').text()).toContain(
      'No assets match the rule yet',
    );
  });

  it('keeps the edit modal mounted when the card is empty', async () => {
    // Edit view + saved filter + zero matches: the card renders its own
    // empty block, so the default slot — and the Edit button inside it —
    // is not rendered. The modal lives beside the card, so it stays
    // mounted all the same; there is no empty-state action that opens it
    // today (no actionLabel, no @empty-action), this only guards the
    // mount against the card going empty, including while it is open.
    searchAssets.mockResolvedValue({ hits: [], total: 0, facets: [] });
    const wrapper = mountWidget({
      isEditView: true,
      currentLayout: [
        {
          i: 'KnowledgePanel.CuratedAssets',
          x: 0,
          y: 0,
          w: 1,
          h: 3,
          static: false,
          config: {
            title: 'Gold tables',
            queryFilter: '{"query":{"bool":{"must":[{"term":{"entityType":"table"}}]}}}',
            resources: ['table'],
          },
        },
      ],
    });
    await flushPromises();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="home-widget-KnowledgePanel.CuratedAssets-empty"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[data-testid="edit-curated-assets"]').exists()).toBe(false);
    expect(wrapper.findComponent(CuratedAssetsModal).exists()).toBe(true);
  });

  it('paints no health dot while the test lookup has not answered', async () => {
    searchAssets.mockResolvedValue({ hits: [hit('a.b')], total: 1, facets: [] });
    postAggregateFieldOptions.mockRejectedValue(new Error('boom'));
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="curated-asset-health-a.b"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="curated-asset-a.b"]').exists()).toBe(true);
  });

  it('stage D: forwards edit view and collapse to the card despite the fragment root', async () => {
    // The widget renders a fragment root (card + modal beside it), so
    // the edit-view/collapse props cannot fall through — they are
    // declared and forwarded explicitly. Without that, the card would
    // never show the drag handle or collapse in the home view/editor.
    searchAssets.mockResolvedValue({ hits: [], total: 0, facets: [] });
    const wrapper = mountWidget({ editView: true, collapsible: true, collapsed: false });
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="drag-widget-KnowledgePanel.CuratedAssets"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="remove-widget-KnowledgePanel.CuratedAssets"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('.home-widget-card__body').exists()).toBe(true);
    await wrapper
      .get('[data-testid="home-widget-KnowledgePanel.CuratedAssets-collapse"]')
      .trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
    const collapsed = mountWidget({ editView: true, collapsible: true, collapsed: true });
    await flushPromises();
    await flushPromises();
    expect(collapsed.find('.home-widget-card__body').exists()).toBe(false);
  });
});
