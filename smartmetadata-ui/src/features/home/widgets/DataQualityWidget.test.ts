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
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import DataQualityWidget from './DataQualityWidget.vue';

const listTestCasesBySearch = vi.fn();
const getDataQualityReport = vi.fn();
vi.mock('@/api/testCases', () => ({
  listTestCasesBySearch: (...args: unknown[]) => listTestCasesBySearch(...args),
}));
vi.mock('@/api/dataQualityReports', () => ({
  getDataQualityReport: (...args: unknown[]) => getDataQualityReport(...args),
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'u1', name: 'admin', teams: [] } }),
}));

function testCase(id: string, status: string, entityLink: string, incidentStatus?: string) {
  return {
    id,
    name: `test-${id}`,
    fullyQualifiedName: `test-${id}`,
    entityLink,
    testCaseResult: { testCaseStatus: status, timestamp: Date.now() },
    incidentStatus,
  };
}

function mountWidget() {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/quality/test-cases',
        name: 'quality-test-cases',
        component: { template: '<div>dq</div>' },
      },
      {
        path: '/quality/test-cases/:id',
        name: 'quality-test-case',
        component: { template: '<div>test</div>' },
      },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  return mount(DataQualityWidget, {
    props: { widgetKey: 'dataQuality' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('DataQualityWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getDataQualityReport.mockResolvedValue({ data: [], metadata: { keys: [], dimensions: [], metrics: [] } });
    // Counts: Failed 2, Success 3, Aborted 1, any-test 6; latest rows: 1 failed + 1 success.
    listTestCasesBySearch.mockImplementation(async (query: { testCaseStatus?: string; limit?: number }) => {
      if (query.limit === 1 && query.testCaseStatus === 'Failed') {
        return { data: [], total: 2 };
      }
      if (query.limit === 1 && query.testCaseStatus === 'Success') {
        return { data: [], total: 3 };
      }
      if (query.limit === 1 && query.testCaseStatus === 'Aborted') {
        return { data: [], total: 1 };
      }
      if (query.limit === 1 && !query.testCaseStatus) {
        return { data: [], total: 6 };
      }
      return {
        data: [
          testCase('f1', 'Failed', '<#E::table::db.schema.t1>'),
          testCase('s1', 'Success', '<#E::table::db.schema.t1::columns::c1>'),
        ],
        total: 2,
      };
    });
  });

  it('counts the three status buckets and lists the latest rows failures-first', async () => {
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-dataQuality-summary"]').text()).toContain(
      '6 tests · 2 failed',
    );
    expect(wrapper.get('[data-testid="home-widget-dataQuality-status"]').text()).toContain('2 failed');
    // The rows arrive in status order: failed before success.
    const rows = wrapper.findAll('[data-testid^="dq-test-"]');
    expect(rows.map((row) => row.attributes('data-testid'))).toEqual(['dq-test-f1', 'dq-test-s1']);
    // The grouped row names its column, not the table.
    expect(wrapper.get('[data-testid="dq-test-s1"]').text()).toContain('c1');
    expect(wrapper.find('[data-testid="dq-table-group-db.schema.t1"]').exists()).toBe(true);
  });

  it('sends the 30-day window and the scope params', async () => {
    mountWidget();
    await flushPromises();
    await flushPromises();
    const latest = listTestCasesBySearch.mock.calls.find(
      (call) => (call[0] as { limit?: number }).limit === 8,
    );
    expect(latest).toBeDefined();
    const params = latest?.[0] as { startTimestamp: number; endTimestamp: number; fields: string };
    expect(params.endTimestamp - params.startTimestamp).toBe(30 * 24 * 60 * 60 * 1000);
    expect(params.fields).toBe('testCaseResult,incidentStatus');
  });

  it('shows the no-tests empty state with the create entry when the estate has no tests', async () => {
    listTestCasesBySearch.mockImplementation(async (query: { testCaseStatus?: string; limit?: number }) => {
      if (query.limit === 1 && !query.testCaseStatus) {
        return { data: [], total: 0 };
      }
      if (query.limit === 1) {
        return { data: [], total: 0 };
      }
      return { data: [], total: 0 };
    });
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-dataQuality-empty"]').text()).toContain(
      'No test cases yet',
    );
    expect(wrapper.get('[data-testid="home-widget-dataQuality-empty-action"]').text()).toContain(
      'Create test',
    );
  });

  it('still renders rows when the table-counts report fails', async () => {
    getDataQualityReport.mockRejectedValue(new Error('boom'));
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="dq-test-"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="home-widget-dataQuality"]').exists()).toBe(true);
  });
});
