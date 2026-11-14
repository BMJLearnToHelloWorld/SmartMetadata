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
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { ColumnProfile, TableProfile } from '@/types/quality';
import AssetProfilerPanel from './AssetProfilerPanel.vue';

/** One column carrying every computed field the panel can render. */
const fullColumn: ColumnProfile = {
  name: 'id',
  timestamp: 1700000000000,
  nullCount: 2,
  uniqueCount: 8,
  distinctCount: 9,
  min: '1',
  max: '99',
  mean: '42.5',
  median: 40,
  stddev: 3.25,
  valuesCount: 10,
  duplicateCount: 1,
  nullProportion: 0.2,
  uniqueProportion: 0.8,
  distinctProportion: 0.9,
  nullMissingCount: 2,
  countInSet: 4,
  likeCount: 5,
  iLikeCount: 5,
  notLikeCount: 1,
  regexCount: 6,
  notRegexCount: 0,
  likeRatio: 0.5,
  iLikeRatio: 0.5,
  minLength: 1,
  maxLength: 2,
  sum: 425,
  firstQuartile: 20,
  thirdQuartile: 60,
  interQuartileRange: 40,
  nonParametricSkew: 0.75,
  histogram: { boundaries: ['1-50', '50+'], frequencies: [7, 3] },
  cardinalityDistribution: {
    categories: ['a', 'b'],
    counts: [6, 4],
    percentages: [60, 40],
  },
  customMetrics: [{ name: 'avg_age', value: 42 }],
};

const fullProfile: TableProfile = {
  timestamp: 1700000000000,
  rowCount: 10,
  columnCount: 2,
  sizeInByte: 16384,
  createDateTime: '2026-01-02T03:04:05Z',
  profileSample: 50,
  profileSampleType: 'PERCENTAGE',
  executionSource: { databaseName: 'analytics', schemaName: 'public', tableName: 'orders' },
  customMetrics: [{ name: 'table_check', value: 1 }],
  columns: [fullColumn],
};

/** The scalar fields the expanded row shows beyond the table columns. */
const detailLabels = [
  'valuesCount',
  'duplicateCount',
  'nullProportion',
  'uniqueProportion',
  'distinctProportion',
  'nullMissingCount',
  'countInSet',
  'likeCount',
  'iLikeCount',
  'notLikeCount',
  'regexCount',
  'notRegexCount',
  'likeRatio',
  'iLikeRatio',
  'minLength',
  'maxLength',
  'sum',
  'firstQuartile',
  'thirdQuartile',
  'interQuartileRange',
  'nonParametricSkew',
];

async function mountPanel(profile: TableProfile | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(AssetProfilerPanel, {
    props: {
      tests: [],
      testsError: '',
      testStatusSeries: [],
      tableProfile: profile,
      rowCountSeries: [],
      usageSeries: [],
      columnNullSeries: [],
      entityType: 'table',
    },
    global: { plugins: [Antd, router, createTestI18n()] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

describe('AssetProfilerPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the profile columns and the table extras, but not the execution source', async () => {
    const wrapper = await mountPanel(fullProfile);
    const table = wrapper.get('[data-testid="asset-profile-table"]');
    expect(table.text()).toContain('id');
    expect(table.text()).toContain('42.5');
    expect(table.text()).toContain('3.25');
    const extras = wrapper.get('[data-testid="asset-profile-extras"]');
    expect(extras.text()).toContain('sizeInByte');
    expect(extras.text()).toContain('16384');
    expect(extras.text()).toContain('2026-01-02T03:04:05Z');
    expect(extras.text()).toContain('profileSample');
    expect(extras.text()).toContain('PERCENTAGE');
    expect(extras.text()).toContain('table_check=1');
    // executionSource waits for the B-12 live check: a value whose
    // survival through the server round trip is unsettled is not shown.
    expect(wrapper.text()).not.toContain('analytics');
    wrapper.unmount();
  });

  it('expands a row to the remaining detail fields, histogram, and cardinality', async () => {
    const wrapper = await mountPanel(fullProfile);
    await wrapper.get('.ant-table-row-expand-icon').trigger('click');
    await flushPromises();
    const text = wrapper.get('[data-testid="asset-profile-table"]').text();
    for (const label of detailLabels) {
      expect(text).toContain(label);
    }
    expect(text).toContain('avg_age=42');
    expect(text).toContain('1-50: 7');
    expect(text).toContain('a: 6 (60%)');
    wrapper.unmount();
  });

  it('omits the extras block when the profile carries no extras', async () => {
    const wrapper = await mountPanel({
      rowCount: 10,
      columnCount: 2,
      columns: [{ name: 'id', nullCount: 0 }],
    });
    expect(wrapper.find('[data-testid="asset-profile-extras"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
