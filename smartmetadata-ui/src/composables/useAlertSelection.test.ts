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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type ComputedRef } from 'vue';
import { getAlertCapabilities } from '@/api/eventSubscriptions';
import type { AlertCapabilities } from '@/types/notifications';
import { useAlertSelection, type AlertSelectionState } from './useAlertSelection';
import type { TranslateFn } from '@/utils/notifications/alertUtils';

vi.mock('@/api/eventSubscriptions', () => ({ getAlertCapabilities: vi.fn() }));
vi.mock('@/api/search', () => ({ searchAssets: vi.fn(async () => ({ total: 0, hits: [], facets: [] })) }));

const mockedGetCapabilities = vi.mocked(getAlertCapabilities);

const t: TranslateFn = ((key: string) => key) as TranslateFn;

function mountSelection(initialSources: string[] = ['table']) {
  let state!: ComputedRef<AlertSelectionState>;
  const sources = ref<string[]>(initialSources);
  const probe = defineComponent({
    setup() {
      state = useAlertSelection({
        alertType: 'Notification',
        sources,
        t,
        notifyError: () => {},
      });
      return () => h('div');
    },
  });
  const wrapper = mount(probe);
  return { wrapper, result: () => state.value, sources };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAlertSelection', () => {
  it('derives support from the answer and reports ready once settled', async () => {
    mockedGetCapabilities.mockResolvedValue({
      alertType: 'Notification',
      filters: [{ condition: { name: 'f' }, sources: ['table'] }],
      sources: [{ name: 'table', kind: 'entity' }],
      triggers: [],
      recipientCategories: ['Owners'],
      containerEntities: ['database'],
    } satisfies AlertCapabilities);
    const { result } = mountSelection();
    expect(result().ready).toBe(false);
    await flushPromises();
    expect(result().ready).toBe(true);
    expect(result().loading).toBe(false);
    expect(result().support.supportedFilters).toEqual([{ name: 'f' }]);
    expect(result().support.recipientCategories).toEqual(['Owners']);
    expect(result().search.indexes).toEqual(['table', 'database']);
    expect(result().search.containerEntities).toEqual(['database']);
  });

  it('keeps the search object stable while its keys do not change', async () => {
    mockedGetCapabilities.mockResolvedValue({
      alertType: 'Notification',
      filters: [],
      sources: [{ name: 'table', kind: 'entity' }],
      triggers: [],
      containerEntities: ['database'],
    } satisfies AlertCapabilities);
    const { result, sources } = mountSelection();
    await flushPromises();
    const first = result().search;
    sources.value = ['table'];
    await flushPromises();
    expect(result().search).toBe(first);
  });

  it('offers only recipient categories with no sources chosen', async () => {
    mockedGetCapabilities.mockResolvedValue({
      alertType: 'Notification',
      filters: [],
      sources: [{ name: 'table', kind: 'entity' }],
      triggers: [],
      recipientCategories: ['Owners'],
    } satisfies AlertCapabilities);
    const { result } = mountSelection([]);
    await flushPromises();
    expect(result().support).toEqual({ recipientCategories: ['Owners'] });
  });
});
