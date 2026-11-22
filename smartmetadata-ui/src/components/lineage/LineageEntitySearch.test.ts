/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { SearchHit } from '@/types/api';
import LineageEntitySearch from './LineageEntitySearch.vue';

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

const HIT: SearchHit = {
  name: 'orders',
  displayName: 'Orders',
  fullyQualifiedName: 'svc.db.schema.orders',
  entityType: 'table',
  owners: [],
  tags: [],
};

const DOMAIN_HIT: SearchHit = {
  name: 'sales',
  displayName: 'Sales',
  fullyQualifiedName: 'sales',
  entityType: 'domain',
  owners: [],
  tags: [],
};

async function typeQuery(wrapper: ReturnType<typeof mount>, value: string): Promise<void> {
  const input = wrapper.get('[data-testid="lineage-entity-search-input"]');
  await input.setValue(value);
  const native = input.find('input');
  if (native.exists()) {
    await native.setValue(value);
    await native.trigger('input');
  }
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
}

describe('LineageEntitySearch', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    searchAssets.mockImplementation(async (_query: string, _from: number, _size: number, options: { index?: string } = {}) => {
      if (options.index === 'domain') {
        return { total: 1, hits: [DOMAIN_HIT], facets: [] };
      }
      if (options.index === 'service') {
        return { total: 0, hits: [], facets: [] };
      }
      return { total: 1, hits: [HIT], facets: [] };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches GET /v1/search/query and emits a type+FQN target', async () => {
    vi.useFakeTimers();
    const wrapper = mount(LineageEntitySearch, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await typeQuery(wrapper, 'orders');
    expect(searchAssets).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').text()).toContain('Orders');
    await wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ entityType: 'table', fqn: 'svc.db.schema.orders' }]);
  });

  it('queries the pin indexes dataAsset, domain and service with the exclusion filter', async () => {
    vi.useFakeTimers();
    const wrapper = mount(LineageEntitySearch, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await typeQuery(wrapper, 'sales');
    const indexes = searchAssets.mock.calls.map((call) => (call[3] as { index?: string } | undefined)?.index);
    expect(indexes).toEqual(['dataAsset', 'domain', 'service']);
    for (const call of searchAssets.mock.calls) {
      const filter = JSON.parse(
        (call[3] as { query_filter?: string }).query_filter ?? '{}',
      ) as { query: { bool: { must_not: Array<{ term: { entityType: string } }> } } };
      expect(filter.query.bool.must_not.map((clause) => clause.term.entityType).sort()).toEqual([
        'dataProduct',
        'glossaryTerm',
        'knowledgePage',
        'tag',
      ]);
    }
    // Merged across indexes: the domain hit surfaces alongside the table hit.
    expect(wrapper.get('[data-testid="lineage-entity-option-sales"]').text()).toContain('Sales');
    await wrapper.get('[data-testid="lineage-entity-option-sales"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ entityType: 'domain', fqn: 'sales' }]);
  });

  it('still shows dataAsset hits when another index fails', async () => {
    vi.useFakeTimers();
    searchAssets.mockImplementation(async (_query: string, _from: number, _size: number, options: { index?: string } = {}) => {
      if (options.index === 'domain') {
        throw new Error('domain index unavailable');
      }
      return { total: 1, hits: [HIT], facets: [] };
    });
    const wrapper = mount(LineageEntitySearch, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    await typeQuery(wrapper, 'orders');
    expect(wrapper.find('[data-testid="lineage-entity-option-svc.db.schema.orders"]').exists()).toBe(true);
  });
});
