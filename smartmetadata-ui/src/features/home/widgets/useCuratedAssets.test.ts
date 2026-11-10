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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import { useCuratedAssets, type CuratedAssets } from './useCuratedAssets';
import { DEFAULT_CURATED_RULE } from '@/catalog/curatedRule';

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

let exposed: CuratedAssets | undefined;
const Harness = defineComponent({
  setup() {
    exposed = useCuratedAssets(computed(() => ({ rule: DEFAULT_CURATED_RULE })));
    return () => h('div', { 'data-testid': 'harness' });
  },
});

function hit(fqn: string, tier = 'Tier.Tier1') {
  return {
    id: fqn,
    name: fqn,
    fullyQualifiedName: fqn,
    entityType: 'table',
    serviceType: 'BigQuery',
    tier,
  };
}

describe('useCuratedAssets', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    exposed = undefined;
    postAggregateFieldOptions.mockResolvedValue({ aggregations: {} });
  });

  it('queries dataAsset with the chip rule and marks only the failing row unhealthy', async () => {
    searchAssets.mockResolvedValue({
      hits: [hit('a.b'), hit('a.c')],
      total: 2,
      facets: [],
    });
    postAggregateFieldOptions.mockResolvedValue({
      aggregations: {
        'sterms#originEntityFQN': { buckets: [{ key: 'a.c', doc_count: 1 }] },
      },
    });
    mount(Harness);
    await flushPromises();
    await flushPromises();
    const filter = JSON.parse(
      (searchAssets.mock.calls[0]?.[3] as { query_filter?: string }).query_filter ?? '',
    ) as Record<string, unknown>;
    expect(searchAssets).toHaveBeenCalledWith('', 0, 10, {
      index: 'dataAsset',
      query_filter: expect.any(String),
    });
    expect(filter).toEqual({
      query: {
        bool: {
          must: [
            { term: { 'tier.tagFQN': 'Tier.Tier1' } },
            { term: { 'certification.tagLabel.tagFQN': 'Certification.Gold' } },
          ],
        },
      },
    });
    expect(exposed?.totalCount.value).toBe(2);
    expect(exposed?.assets.value.map((asset) => asset.tier)).toEqual(['Tier1', 'Tier1']);
    // Only a.c has a failing test case, so only it gets the failing dot.
    expect(exposed?.assets.value.map((asset) => asset.isHealthy)).toEqual([true, false]);
  });

  it('reports an error when the search fails', async () => {
    searchAssets.mockRejectedValue(new Error('boom'));
    mount(Harness);
    await flushPromises();
    expect(exposed?.isError.value).toBe(true);
    expect(exposed?.assets.value).toEqual([]);
  });
});
