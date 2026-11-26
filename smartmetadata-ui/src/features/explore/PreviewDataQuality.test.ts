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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { TestCase, TestIncident } from '@/types/quality';
import PreviewDataQuality from './PreviewDataQuality.vue';

vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: vi.fn(),
}));

vi.mock('@/api/testIncidents', () => ({
  listTestCaseIncidentsFromSearch: vi.fn(),
}));

import { listTestCasesBySearch } from '@/api/testCases';
import { listTestCaseIncidentsFromSearch } from '@/api/testIncidents';

const casesMock = listTestCasesBySearch as unknown as ReturnType<typeof vi.fn>;
const incidentsMock = listTestCaseIncidentsFromSearch as unknown as ReturnType<typeof vi.fn>;

const CASES: TestCase[] = [
  {
    id: 'tc-1',
    name: 'test_column_values_to_not_be_null',
    displayName: 'Column values not null',
    fullyQualifiedName: 'svc.db.schema.orders.customer_id.test_column_values_to_not_be_null',
    entityLink: '<#E::table::svc.db.schema.orders::columns::customer_id>',
    testSuites: [],
    parameterValues: [],
    testCaseResult: { testCaseStatus: 'Success' },
  },
  {
    id: 'tc-2',
    name: 'test_row_count',
    fullyQualifiedName: 'svc.db.schema.orders.test_row_count',
    entityLink: '<#E::table::svc.db.schema.orders>',
    testSuites: [],
    parameterValues: [],
    testCaseResult: { testCaseStatus: 'Failed' },
    incidentId: 'inc-1',
  },
  {
    id: 'tc-3',
    name: 'test_table_column_count',
    fullyQualifiedName: 'svc.db.schema.orders.test_table_column_count',
    entityLink: '<#E::table::svc.db.schema.orders>',
    testSuites: [],
    parameterValues: [],
    testCaseResult: { testCaseStatus: 'Aborted' },
  },
];

const INCIDENTS: TestIncident[] = [
  {
    id: 'inc-1',
    stateId: 'state-1',
    testCaseResolutionStatusType: 'New',
    severity: 'High',
    testCaseReference: { id: 'tc-2', name: 'test_row_count', displayName: 'Row count' },
    testCaseResolutionStatusDetails: {
      assignee: { name: 'alice', displayName: 'Alice' },
    },
  },
  {
    id: 'inc-2',
    stateId: 'state-2',
    testCaseResolutionStatusType: 'Assigned',
    severity: 'Low',
    testCaseReference: { id: 'tc-2', name: 'test_row_count', displayName: 'Row count' },
    testCaseResolutionStatusDetails: {},
  },
];

async function mountTab(canView = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/quality/test-cases/:id', name: 'quality-test-case', component: { template: '<div>case</div>' } },
    ],
  });
  const wrapper = mount(PreviewDataQuality, {
    props: { fqn: 'svc.db.schema.orders', canView },
    global: { plugins: [Antd, router, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('PreviewDataQuality (pin DataQualityTab)', () => {
  beforeEach(() => {
    casesMock.mockReset();
    casesMock.mockResolvedValue({ data: CASES, total: 3 });
    incidentsMock.mockReset();
    incidentsMock.mockResolvedValue({ data: INCIDENTS, total: 2 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches test cases and incidents with pin parameters', async () => {
    const wrapper = await mountTab();
    expect(casesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityFQN: 'svc.db.schema.orders',
        includeAllTests: true,
        limit: 50,
        fields: 'testCaseResult,incidentId',
        sortField: 'testCaseResult.timestamp',
        sortType: 'desc',
      }),
    );
    expect(incidentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originEntityFQN: 'svc.db.schema.orders',
        latest: true,
        limit: 100,
      }),
    );
    wrapper.unmount();
  });

  it('defaults to the success filter and shows the column name for column tests', async () => {
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="preview-dq-filter-success"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="preview-dq-filter-failed"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="preview-dq-filter-aborted"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="preview-dq-subtab-test-cases"]').text()).toContain('(3)');
    const card = wrapper.find('[data-testid="preview-test-case-tc-1"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('Column values not null');
    expect(card.text()).toContain('Success');
    expect(card.text()).toContain('customer_id');
    // The failed case is hidden behind its own filter.
    expect(wrapper.find('[data-testid="preview-test-case-tc-2"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('switches to the failed filter and shows the incident marker', async () => {
    const wrapper = await mountTab();
    await wrapper.find('[data-testid="preview-dq-filter-failed"]').trigger('click');
    const card = wrapper.find('[data-testid="preview-test-case-tc-2"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('Failed');
    expect(card.text()).toContain('Incidents');
    wrapper.unmount();
  });

  it('shows incidents with severity and assignee under the new filter', async () => {
    const wrapper = await mountTab();
    await wrapper.find('[data-testid="preview-dq-subtab-incidents"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="preview-dq-subtab-incidents"]').text()).toContain('(2)');
    const incident = wrapper.find('[data-testid="preview-incident-inc-1"]');
    expect(incident.exists()).toBe(true);
    expect(incident.text()).toContain('Row count');
    expect(incident.text()).toContain('High');
    expect(incident.text()).toContain('Alice');
    // The assigned incident is behind its own filter.
    expect(wrapper.find('[data-testid="preview-incident-inc-2"]').exists()).toBe(false);
    await wrapper.find('[data-testid="preview-dq-incident-filter-assigned"]').trigger('click');
    expect(wrapper.find('[data-testid="preview-incident-inc-2"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the permission placeholder without ViewTests', async () => {
    const wrapper = await mountTab(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(casesMock).not.toHaveBeenCalled();
    expect(incidentsMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the empty state when the table has no test cases', async () => {
    casesMock.mockResolvedValue({ data: [], total: 0 });
    incidentsMock.mockResolvedValue({ data: [], total: 0 });
    const wrapper = await mountTab();
    expect(wrapper.find('[data-testid="preview-dq-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-dq-empty"]').text()).toContain('No data found');
    wrapper.unmount();
  });
});
