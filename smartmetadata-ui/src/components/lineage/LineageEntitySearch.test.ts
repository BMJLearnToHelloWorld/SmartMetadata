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

describe('LineageEntitySearch', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    searchAssets.mockResolvedValue({ total: 1, hits: [HIT], facets: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches GET /v1/search/query and emits a type+FQN target', async () => {
    vi.useFakeTimers();
    const wrapper = mount(LineageEntitySearch, {
      global: { plugins: [Antd, createTestI18n()] },
    });
    const input = wrapper.get('[data-testid="lineage-entity-search-input"]');
    await input.setValue('orders');
    const native = input.find('input');
    if (native.exists()) {
      await native.setValue('orders');
      await native.trigger('input');
    }
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(searchAssets).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').text()).toContain('Orders');
    await wrapper.get('[data-testid="lineage-entity-option-svc.db.schema.orders"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([{ entityType: 'table', fqn: 'svc.db.schema.orders' }]);
  });
});
