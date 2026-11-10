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
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import PipelineStatusWidget from './PipelineStatusWidget.vue';

const listPipelineSummaries = vi.fn();
const listCatalogPipelineStatuses = vi.fn();
const getResourcePermission = vi.fn();
vi.mock('@/api/pipelines', () => ({
  listPipelineSummaries: (...args: unknown[]) => listPipelineSummaries(...args),
}));
vi.mock('@/api/catalogPipelines', () => ({
  listCatalogPipelineStatuses: (...args: unknown[]) => listCatalogPipelineStatuses(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));
vi.mock('@/features/home/useAddServiceAction', () => ({
  useAddServiceAction: () => ({ addService: vi.fn(), canAddService: ref(true) }),
}));

function page(rows: unknown[], total: number) {
  return { data: rows, paging: { total } };
}

function summary(id: string, status?: string, overrides: Record<string, unknown> = {}) {
  return {
    pipelineId: id,
    pipelineFqn: `svc.${id}`,
    pipelineName: id,
    lastRunStatus: status,
    lastRunTime: 1760000000000,
    ...overrides,
  };
}

function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
  return {
    router,
    wrapper: mount(PipelineStatusWidget, {
      props: { widgetKey: 'pipelineStatus' },
      global: { plugins: [router, Antd, createTestI18n()] },
    }),
  };
}

describe('PipelineStatusWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
    listCatalogPipelineStatuses.mockResolvedValue({
      data: [{ timestamp: 1760000000000, executionStatus: 'Successful', taskStatus: [] }],
      paging: { total: 1 },
    });
  });

  it('ranks failures first in All and shows the remaining count', async () => {
    listPipelineSummaries
      .mockResolvedValueOnce(page([summary('a', 'Running'), summary('b', 'Successful')], 4))
      .mockResolvedValueOnce(page([summary('f', 'Failed')], 3))
      .mockResolvedValueOnce(page([], 0))
      .mockResolvedValueOnce(page([], 0))
      .mockResolvedValueOnce(page([summary('b', 'Successful')], 1));
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    const names = wrapper
      .findAll('[data-testid^="pipeline-status-row-name-"]')
      .map((node) => node.text());
    // Bucket pages in urgency order, then the unfiltered page: the
    // Successful-bucket row 'b' precedes the unfiltered page's 'a'.
    expect(names).toEqual(['f', 'b', 'a']);
    expect(wrapper.get('[data-testid="pipeline-status-chip-Failed"]').text()).toContain('(3)');
    expect(wrapper.get('[data-testid="home-widget-pipelineStatus-status"]').text()).toContain(
      '3 failed',
    );
    expect(wrapper.get('[data-testid="home-widget-pipelineStatus-meta"]').text()).toContain('1 more');
  });

  it('draws the run-history strip per visible pipeline', async () => {
    listPipelineSummaries.mockResolvedValue(page([summary('a', 'Successful')], 1));
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(listCatalogPipelineStatuses).toHaveBeenCalledWith(
      'svc.a',
      expect.objectContaining({ limit: 10 }),
    );
    expect(
      wrapper.find('[data-testid="pipeline-status-row-runs-a"] .pipeline-status__dot--success').exists(),
    ).toBe(true);
  });

  it('draws an empty strip when the history request fails', async () => {
    listCatalogPipelineStatuses.mockRejectedValue(new Error('boom'));
    listPipelineSummaries.mockResolvedValue(page([summary('a', 'Successful')], 1));
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-status-row-runs-a"] .pipeline-status__dot').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="pipeline-status-row-a"]').exists()).toBe(true);
  });

  it('shows the failed row meta and the latest run error, 3-line clamped', async () => {
    listPipelineSummaries.mockResolvedValue(
      page(
        [
          summary('f', 'Failed', {
            serviceType: 'Airflow',
            startTime: 1760000000000,
            endTime: 1760000065000,
          }),
        ],
        1,
      ),
    );
    listCatalogPipelineStatuses.mockResolvedValue({
      data: [
        {
          timestamp: 1760000002000,
          executionStatus: 'Failed',
          error: { errorMessage: 'connection refused' },
          taskStatus: [],
        },
        { timestamp: 1760000001000, executionStatus: 'Successful', taskStatus: [] },
      ],
      paging: { total: 2 },
    });
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    const meta = wrapper.get('[data-testid="pipeline-status-row-meta-f"]').text();
    expect(meta).toContain('Airflow');
    expect(meta).toContain('1m 5s');
    expect(wrapper.get('[data-testid="pipeline-status-row-error-f"]').text()).toContain(
      'connection refused',
    );
  });

  it('shows no error line when the last run did not fail', async () => {
    listPipelineSummaries.mockResolvedValue(page([summary('a', 'Successful')], 1));
    listCatalogPipelineStatuses.mockResolvedValue({
      data: [
        {
          timestamp: 1760000002000,
          executionStatus: 'Failed',
          error: { errorMessage: 'an old failure' },
          taskStatus: [],
        },
        { timestamp: 1760000001000, executionStatus: 'Successful', taskStatus: [] },
      ],
      paging: { total: 2 },
    });
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="pipeline-status-row-error-a"]').exists()).toBe(false);
  });

  it('renders the empty state with the add-pipeline-service action', async () => {
    listPipelineSummaries.mockResolvedValue(page([], 0));
    const { wrapper } = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-pipelineStatus-empty"]').text()).toContain(
      'No pipeline runs yet',
    );
    expect(wrapper.get('[data-testid="home-widget-pipelineStatus-empty-action"]').text()).toContain(
      'Add pipeline service',
    );
  });
});
