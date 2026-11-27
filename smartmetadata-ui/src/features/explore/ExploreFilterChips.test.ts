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
import Antd, { Button } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { ARTICLE_QUICK_FILTER_FACET_IDS } from '@/catalog/contextCenterArticles';
import type { SearchFacet } from '@/catalog/searchFacets';
import { createTestI18n } from '@/test/i18n';
import ExploreFilterChipField from './ExploreFilterChipField.vue';
import ExploreFilterChips from './ExploreFilterChips.vue';

const FACETS: SearchFacet[] = [
  { id: 'domain', field: 'domains.displayName.keyword', buckets: [{ key: 'd1', count: 2 }] },
  { id: 'owner', field: 'ownerDisplayName', buckets: [{ key: 'alice', count: 1 }] },
  { id: 'tagFqn', field: 'tags.tagFQN', buckets: [{ key: 'KnowledgeCenter.Guides', count: 3 }] },
  { id: 'tier', field: 'tier.tagFQN', buckets: [{ key: 'Tier1', count: 1 }] },
  { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 9 }] },
];

function chipFields(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents(ExploreFilterChipField);
}

function chipIds(wrapper: ReturnType<typeof mount>): string[] {
  return chipFields(wrapper).map((chip) => String(chip.attributes('data-testid') ?? '').replace('explore-chip-', ''));
}

function chipById(wrapper: ReturnType<typeof mount>, id: string) {
  return chipFields(wrapper).find((item) => item.attributes('data-testid') === `explore-chip-${id}`);
}

function chipOptions(wrapper: ReturnType<typeof mount>, id: string): Array<{ value: string; label: unknown }> {
  return (chipById(wrapper, id)?.props('options') ?? []) as Array<{ value: string; label: unknown }>;
}

/** Plain text inside a VNode label (icons contribute no text). */
function vnodeText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (node && typeof node === 'object') {
    const children = (node as { children?: unknown }).children;
    if (typeof children === 'string') {
      return children;
    }
    if (Array.isArray(children)) {
      return children.map(vnodeText).join('');
    }
  }
  return '';
}

describe('ExploreFilterChips facetIds', () => {
  it('renders only the four article quick-filter chips when facetIds is given', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ARTICLE_QUICK_FILTER_FACET_IDS },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toEqual(['domain', 'owner', 'tagFqn', 'tier']);
    expect(chipById(wrapper, 'tagFqn')?.props('title')).toBeTruthy();
  });

  it('renders every top-bar chip by default', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {} },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toContain('entityType');
    expect(chipIds(wrapper).length).toBeGreaterThan(4);
  });

  it('uses official text-button triggers, not boxed multi-selects, and shows a selected count', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: { entityType: ['table'] }, facetIds: ['entityType'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const trigger = wrapper.findComponent(Button);
    expect(trigger.props('type')).toBe('text');
    expect(trigger.text()).toContain('Data Assets:(1)');
    expect(wrapper.find('.ant-select').exists()).toBe(false);
    expect(trigger.text()).not.toContain('Table (9)');
  });

  it('emits change with the selected values for the right facet', async () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await chipById(wrapper, 'domain')?.vm.$emit('change', ['d1']);
    expect(wrapper.emitted('change')).toEqual([['domain', ['d1']]]);
  });

  it('emits open with the facet id when a dropdown opens', async () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await chipById(wrapper, 'domain')?.vm.$emit('open', true);
    expect(wrapper.emitted('open')).toEqual([['domain', true]]);
  });
});

describe('ExploreFilterChips per-tab sets (D5)', () => {
  it('renders the table-tab set without entityType or certification', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: {
        facets: FACETS,
        filters: {},
        facetIds: ['domain', 'dataProduct', 'owner', 'tagFqn', 'tier', 'service', 'serviceType', 'database', 'schema', 'column', 'tableType', 'columnDescriptionStatus'],
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toContain('database');
    expect(chipIds(wrapper)).toContain('column');
    expect(chipIds(wrapper)).not.toContain('entityType');
    expect(chipIds(wrapper)).not.toContain('certification');
  });

  it('renders no chips for an empty per-tab set', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: [] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipIds(wrapper)).toEqual([]);
  });
});

describe('ExploreFilterChips "No X" options (D8)', () => {
  it('prepends a No-owners option to the owner chip and none to the service chip', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['owner', 'service'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const ownerOptions = chipOptions(wrapper, 'owner');
    expect(ownerOptions[0]).toEqual({ value: 'OM_NULL_FIELD', label: 'No Owners' });
    expect(ownerOptions[1]).toMatchObject({ value: 'alice' });
    const serviceFacets: SearchFacet[] = [
      { id: 'service', field: 'service.displayName.keyword', buckets: [{ key: 'mysql', count: 1 }] },
    ];
    const serviceWrapper = mount(ExploreFilterChips, {
      props: { facets: serviceFacets, filters: {}, facetIds: ['service'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipOptions(serviceWrapper, 'service')).toEqual([
      { value: 'mysql', label: 'mysql (1)' },
    ]);
  });

  it('offers the No option even when the facet has no buckets yet', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: [], filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipOptions(wrapper, 'domain')).toEqual([
      { value: 'OM_NULL_FIELD', label: 'No Domains' },
    ]);
  });
});

describe('ExploreFilterChips option icons and dropdown search (D6/D7)', () => {
  it('renders icon labels for entity-type, service-type and domain options, text otherwise', () => {
    const facets: SearchFacet[] = [
      { id: 'entityType', field: 'entityType', buckets: [{ key: 'table', count: 9 }] },
      { id: 'serviceType', field: 'serviceType', buckets: [{ key: 'Mysql', count: 2 }] },
      { id: 'domain', field: 'domains.displayName.keyword', buckets: [{ key: 'd1', count: 2 }] },
      { id: 'tier', field: 'tier.tagFQN', buckets: [{ key: 'Tier1', count: 1 }] },
    ];
    const wrapper = mount(ExploreFilterChips, {
      props: { facets, filters: {}, facetIds: ['entityType', 'serviceType', 'domain', 'tier'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const entityLabel = chipOptions(wrapper, 'entityType')[0].label;
    expect(typeof entityLabel).toBe('object');
    expect(vnodeText(entityLabel)).toBe('Table (9)');
    const serviceTypeLabel = chipOptions(wrapper, 'serviceType')[0].label;
    expect(typeof serviceTypeLabel).toBe('object');
    expect(vnodeText(serviceTypeLabel)).toBe('Mysql (2)');
    const domainLabel = chipOptions(wrapper, 'domain')[1].label;
    expect(typeof domainLabel).toBe('object');
    expect(vnodeText(domainLabel)).toBe('d1 (2)');
    // No icon for the tier facet (pin addOptionIcons covers only
    // entity-type, service-type and domains); index 0 is its "No Tier"
    // option, index 1 the bucket.
    expect(chipOptions(wrapper, 'tier')[1].label).toBe('Tier1 (1)');
  });

  it('labels tier facet options with the tier name, not the FQN', () => {
    // Pin AdvancedSearchPureUtils.ts `formatTierLabel`: `Tier.Gold` ->
    // `Gold`. The value stays the FQN.
    const facets: SearchFacet[] = [
      { id: 'tier', field: 'tier.tagFQN', buckets: [{ key: 'Tier.Gold', count: 3 }] },
    ];
    const wrapper = mount(ExploreFilterChips, {
      props: { facets, filters: {}, facetIds: ['tier'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    const options = chipOptions(wrapper, 'tier');
    expect(options[1].value).toBe('Tier.Gold');
    expect(options[1].label).toBe('Gold (3)');
  });

  it('enables server search on every chip and emits the typed text', async () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await chipById(wrapper, 'domain')?.vm.$emit('search', 'd1');
    expect(wrapper.emitted('search')).toEqual([['domain', 'd1']]);
  });

  it('shows the loading spinner only on the facet being searched', () => {
    const wrapper = mount(ExploreFilterChips, {
      props: { facets: FACETS, filters: {}, facetIds: ['domain', 'owner'], searchingFacetIds: ['domain'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(chipById(wrapper, 'domain')?.props('searching')).toBe(true);
    expect(chipById(wrapper, 'owner')?.props('searching')).toBe(false);
  });
});
