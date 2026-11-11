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
import Antd, { Select } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { ARTICLE_QUICK_FILTER_FACET_IDS } from '@/catalog/contextCenterArticles';
import type { SearchFacet } from '@/catalog/searchFacets';
import { createTestI18n } from '@/test/i18n';
import ExploreFilterChips from './ExploreFilterChips.vue';

const FACETS: SearchFacet[] = [
  { id: 'domain', field: 'domains.displayName.keyword', buckets: [{ key: 'd1', count: 2 }] },
  { id: 'owner', field: 'ownerDisplayName', buckets: [{ key: 'alice', count: 1 }] },
  { id: 'tagFqn', field: 'tags.tagFQN', buckets: [{ key: 'KnowledgeCenter.Guides', count: 3 }] },
  { id: 'tier', field: 'tier.tagFQN', buckets: [{ key: 'Tier1', count: 1 }] },
  { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 9 }] },
];

function chipIds(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAllComponents(Select)
    .map((select) => String(select.attributes('data-testid') ?? '').replace('explore-chip-', ''));
}

describe('ExploreFilterChips facetIds', () => {
  it('renders only the four article quick-filter chips when facetIds is given', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ARTICLE_QUICK_FILTER_FACET_IDS },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toEqual(['domain', 'owner', 'tagFqn', 'tier']);
    const tagChip = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'explore-chip-tagFqn');
    expect(tagChip?.props('placeholder')).toBeTruthy();
  });

  it('renders every top-bar chip by default', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {} },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toContain('entityType');
    expect(chipIds(wrapper).length).toBeGreaterThan(4);
  });

  it('emits change with the selected values for the right facet', async () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.findComponent(Select).vm.$emit('change', ['d1']);
    expect(wrapper.emitted('change')).toEqual([['domain', ['d1']]]);
  });

  it('emits open with the facet id when a dropdown opens', async () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await wrapper.findComponent(Select).vm.$emit('dropdownVisibleChange', true);
    expect(wrapper.emitted('open')).toEqual([['domain', true]]);
  });
});
