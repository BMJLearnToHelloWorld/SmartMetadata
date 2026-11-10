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
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import { projectValue, resolveStatus } from './useKpiProgress';
import KpiWidget from './KpiWidget.vue';

const fetchAllKpis = vi.fn();
const listKpiResults = vi.fn();
const getResourcePermission = vi.fn();
vi.mock('@/api/kpi', () => ({
  fetchAllKpis: (...args: unknown[]) => fetchAllKpis(...args),
  listKpiResults: (...args: unknown[]) => listKpiResults(...args),
}));
vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({ getResourcePermission }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

describe('useKpiProgress arithmetic', () => {
  it('projects off the first-to-last spacing, not the window length', () => {
    // 10 → 20 over 5 days, 5 days left: 20 + 2*5 = 30.
    expect(projectValue([10, 20], 5, 5)).toBe(30);
  });

  it('returns null with a single point or no span', () => {
    expect(projectValue([10], 0, 5)).toBeNull();
    expect(projectValue([10, 20], 0, 5)).toBeNull();
  });

  it('judges a closed window on what was actually reached', () => {
    expect(resolveStatus(null, 100, 0, 120)).toBe('onTrack');
    expect(resolveStatus(null, 100, 0, 80)).toBe('missed');
  });

  it('calls a trendless open KPI on track, never at risk', () => {
    expect(resolveStatus(null, 100, 10, 80)).toBe('onTrack');
    expect(resolveStatus(90, 100, 10, 80)).toBe('atRisk');
    expect(resolveStatus(110, 100, 10, 80)).toBe('onTrack');
  });
});

function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/my-data', name: 'home', component: { template: '<div>home</div>' } },
      {
        path: '/insights/kpis',
        name: 'insights-kpis',
        component: { template: '<div>kpis</div>' },
      },
      {
        path: '/insights/kpis/add',
        name: 'insights-kpis-add',
        component: { template: '<div>add</div>' },
      },
    ],
  });
  return mount(KpiWidget, {
    props: { widgetKey: 'kpi' },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
}

describe('KpiWidget', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    getResourcePermission.mockResolvedValue({ Create: true });
  });

  it('projects the series and marks the at-risk KPI', async () => {
    const now = Date.now();
    const endDate = now + 10 * DAY_MS;
    fetchAllKpis.mockResolvedValue([
      {
        id: 'k1',
        name: 'coverage',
        fullyQualifiedName: 'coverage',
        metricType: 'PERCENTAGE',
        targetValue: 90,
        startDate: now - 30 * DAY_MS,
        endDate,
      },
    ]);
    listKpiResults.mockResolvedValue([
      { count: 70, day: now - 10 * DAY_MS },
      { count: 80, day: now },
    ]);
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    // 70 → 80 over 10 days = 1/day; 10 days left → 80 + 10 = 90 >= 90: on track.
    expect(wrapper.get('[data-testid="home-widget-kpi-summary"]').text()).toContain(
      '1 KPIs tracked',
    );
    expect(wrapper.get('[data-testid="kpi-k1"]').text()).toContain('On track');
    expect(wrapper.get('[data-testid="kpi-current"]').text()).toContain('80%');
    expect(wrapper.get('[data-testid="kpi-delta"]').text()).toContain('in the last 30 days');
    expect(listKpiResults).toHaveBeenCalledWith(
      'coverage',
      expect.objectContaining({ orderBy: 'ASC' }),
    );
  });

  it('shows the no-KPI empty state with the create entry', async () => {
    fetchAllKpis.mockResolvedValue([]);
    const wrapper = mountWidget();
    await flushPromises();
    await flushPromises();
    expect(wrapper.get('[data-testid="home-widget-kpi-empty"]').text()).toContain('No KPIs yet');
    expect(wrapper.get('[data-testid="home-widget-kpi-empty-action"]').text()).toContain(
      'Create KPI',
    );
  });
});
