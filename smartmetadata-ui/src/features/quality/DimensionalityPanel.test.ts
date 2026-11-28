/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import DimensionalityPanel from './DimensionalityPanel.vue';

const mocks = vi.hoisted(() => ({
  listDimensionResultsMock: vi.fn(async (_fqn: string, _params: unknown) => ({
    data: [
      { dimensionValues: [{ value: 'US' }], testCaseStatus: 'Success', impactScore: 0.2, timestamp: 1700000000000 },
      {
        dimensionValues: [{ value: 'US' }],
        testCaseStatus: 'Failed',
        impactScore: 0.9,
        timestamp: 1700100000000,
        excludedFromRollUp: true,
      },
      { dimensionValues: [{ value: 'DE' }], testCaseStatus: 'Success', impactScore: 0.5, timestamp: 1700000000000 },
    ],
    paging: { total: 3 },
  })),
}));
const listDimensionResultsMock = mocks.listDimensionResultsMock;

vi.mock('@/api/testCases', () => ({
  listTestCaseDimensionResults: (fqn: string, params: unknown) =>
    mocks.listDimensionResultsMock(fqn, params),
}));

describe('DimensionalityPanel', () => {
  it('keeps the latest result per dimension value, sorted by impact score', async () => {
    const wrapper = mount(DimensionalityPanel, {
      props: { testCaseFqn: 'svc.db.schema.orders.row_count', dimensionColumns: ['country'] },
      global: { plugins: [Antd, createTestI18n()] },
    });
    await flushPromises();
    // Official default range: last 7 days, sent as startTs/endTs.
    const params = listDimensionResultsMock.mock.calls[0]![1] as unknown as {
      dimensionName?: string;
      startTs?: number;
      endTs?: number;
    };
    expect(params.dimensionName).toBe('country');
    expect(typeof params.startTs).toBe('number');
    expect(typeof params.endTs).toBe('number');
    expect(params.endTs).toBeGreaterThan(params.startTs as number);
    const text = wrapper.find('[data-testid="test-case-dimensionality"]').text();
    // US keeps the later Failed run (impact 0.9) ahead of DE (0.5); the
    // superseded US Success run must not appear as a second US row.
    expect(text).toContain('Failed');
    expect(wrapper.findAll('.ant-table-tbody tr').length).toBe(2);
    const tableRows = wrapper.findAll('.ant-table-tbody tr');
    expect(tableRows[0]!.text()).toContain('US');
    expect(tableRows[0]!.text()).toContain('Failed');
    expect(tableRows[1]!.text()).toContain('DE');
    expect(wrapper.find('[data-testid="dimensionality-heatmap"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dimension-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="excluded-from-roll-up-badge"]').exists()).toBe(true);
  });
});
