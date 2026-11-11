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
import PlatformHealthWidget from './PlatformHealthWidget.vue';

const getServicesOverview = vi.fn();
const listIngestionPipelines = vi.fn();
const addService = vi.fn();
const getResourcePermission = vi.fn();

vi.mock('@/api/services', () => ({
  getServicesOverview: (...args: unknown[]) => getServicesOverview(...args),
}));
vi.mock('@/api/ingestionPipelines', () => ({
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));
vi.mock('@/features/home/useAddServiceAction', () => ({
  useAddServiceAction: () => ({ addService, canAddService: ref(true) }),
}));

function overviewResponse(data: unknown[], healthCounts: Record<string, Record<string, number>>, total: number) {
  return { total, data, healthCounts, counts: {}, serviceTypeCounts: {} };
}

function serviceSummary(id: string, health: string, entityType = 'databaseService') {
  return {
    id,
    entityType,
    name: `svc-${id}`,
    displayName: `Service ${id}`,
    fullyQualifiedName: `svc-${id}`,
    serviceType: 'Postgres',
    health,
  };
}

async function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/ingestion/services', name: 'ingestion-services', component: { template: '<div>services</div>' } },
      {
        path: '/ingestion/services/:kind/:id',
        name: 'ingestion-service',
        component: { template: '<div>service</div>' },
      },
    ],
  });
  await router.push({ name: 'home' });
  await router.isReady();
  const wrapper = mount(PlatformHealthWidget, {
    props: { widgetKey: 'platformHealth' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await flushPromises();
  return { wrapper, router };
}

describe('PlatformHealthWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    getServicesOverview.mockReset();
    listIngestionPipelines.mockReset();
    getResourcePermission.mockReset();
    addService.mockClear();
    getResourcePermission.mockResolvedValue({ ViewAll: true });
    listIngestionPipelines.mockResolvedValue({ data: [], paging: { total: 0 } });
  });

  it('shows the no-permission card and issues no request without ViewAll/ViewBasic', async () => {
    getResourcePermission.mockResolvedValue({ ViewAll: false, ViewBasic: false });
    const { wrapper } = await mountWidget();
    expect(wrapper.get('[data-testid="home-widget-platform-health-summary"]').text()).toContain(
      'You do not have the necessary permissions to view this data.',
    );
    expect(getServicesOverview).not.toHaveBeenCalled();
    expect(listIngestionPipelines).not.toHaveBeenCalled();
  });

  it('renders failing rows, chips and the needs-attention status', async () => {
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(
        [serviceSummary('a', 'failed')],
        { databaseService: { failed: 1, partialSuccess: 0, success: 2, notRun: 0 } },
        3,
      ),
    );
    listIngestionPipelines.mockResolvedValue({
      data: [
        {
          id: 'p1',
          name: 'p1',
          fullyQualifiedName: 'svc-a.p1',
          pipelineType: 'metadata',
          pipelineStatuses: [
            {
              pipelineState: 'failed',
              timestamp: 1700000000000,
              status: [{ name: 'metadata', failures: [{ error: 'Connection refused' }] }],
            },
          ],
        },
      ],
      paging: { total: 1 },
    });
    const { wrapper } = await mountWidget();
    expect(wrapper.get('[data-testid="home-widget-platform-health-summary"]').text()).toContain(
      '1/3 services failing',
    );
    expect(wrapper.get('[data-testid="home-widget-platform-health-status"]').text()).toContain(
      'Needs attention',
    );
    expect(wrapper.get('[data-testid="failing-service-a"]').text()).toContain('Service a');
    expect(wrapper.get('[data-testid="failing-service-a"]').text()).toContain('Connection refused');
    expect(wrapper.get('[data-testid="platform-health-chip-failing"]').text()).toContain('1 of 3 failing');
    expect(wrapper.get('[data-testid="platform-health-chip-healthy"]').text()).toContain('2 healthy');
    expect(wrapper.get('[data-testid="platform-health-chip-notRun"]').attributes('disabled')).toBeDefined();
  });

  it('lazy-loads the healthy bucket only when its chip is picked', async () => {
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(
        [serviceSummary('a', 'failed')],
        { databaseService: { failed: 1, partialSuccess: 0, success: 2, notRun: 0 } },
        3,
      ),
    );
    const { wrapper } = await mountWidget();
    expect(getServicesOverview).toHaveBeenCalledTimes(1);
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(
        [serviceSummary('h1', 'success'), serviceSummary('h2', 'success')],
        { databaseService: { failed: 1, partialSuccess: 0, success: 2, notRun: 0 } },
        3,
      ),
    );
    await wrapper.get('[data-testid="platform-health-chip-healthy"]').trigger('click');
    await flushPromises();
    await flushPromises();
    expect(getServicesOverview).toHaveBeenCalledTimes(2);
    expect(getServicesOverview.mock.calls[1]?.[0]).toMatchObject({ health: ['success'], limit: 3 });
    expect(wrapper.get('[data-testid="bucket-service-h1"]').text()).toContain('Service h1');
    expect(wrapper.get('[data-testid="bucket-service-h2"]').text()).toContain('Service h2');
  });

  it('shows the add-service empty state when no service is connected', async () => {
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse([], { databaseService: {} }, 0),
    );
    const { wrapper } = await mountWidget();
    expect(wrapper.get('[data-testid="home-widget-platform-health-empty"]').text()).toContain(
      'No services connected yet',
    );
    await wrapper.get('[data-testid="home-widget-platform-health-empty-action"]').trigger('click');
    expect(addService).toHaveBeenCalledTimes(1);
  });

  it('shows the not-run service instead of the empty state when nothing is failing', async () => {
    // Live 2026-11-11 case: the health=failed page is empty (paging.total 0)
    // but one service exists, not yet run. The card must show it under the
    // not-run bucket, not the "no services connected" empty state.
    getServicesOverview
      .mockResolvedValueOnce(
        overviewResponse([], { databaseService: { notRun: 1 } }, 0),
      )
      .mockResolvedValueOnce(
        overviewResponse(
          [serviceSummary('x', 'notRun')],
          { databaseService: { notRun: 1 } },
          1,
        ),
      );
    const { wrapper } = await mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="home-widget-platform-health-empty"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="home-widget-platform-health-summary"]').text()).toContain(
      'All 1 services healthy',
    );
    expect(wrapper.get('[data-testid="platform-health-chip-notRun"]').text()).toContain('1 not run yet');
    expect(wrapper.get('[data-testid="platform-health-chip-notRun"]').attributes('disabled')).toBeUndefined();
    expect(getServicesOverview).toHaveBeenCalledTimes(2);
    expect(getServicesOverview.mock.calls[1]?.[0]).toMatchObject({ health: ['notRun'], limit: 3 });
    expect(wrapper.get('[data-testid="bucket-service-x"]').text()).toContain('Service x');
  });

  it('opens the service detail page from a row (no AGENTS tab in the product)', async () => {
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(
        [serviceSummary('a', 'failed')],
        { databaseService: { failed: 1, partialSuccess: 0, success: 0, notRun: 0 } },
        1,
      ),
    );
    const { wrapper, router } = await mountWidget();
    await wrapper.get('[data-testid="failing-service-a"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('ingestion-service');
    expect(router.currentRoute.value.params).toEqual({ kind: 'database', id: 'svc-a' });
  });
});
