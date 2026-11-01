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
import KpiFormView from './KpiFormView.vue';

const createKpi = vi.fn();
const updateKpi = vi.fn();
const getKpiByName = vi.fn();

vi.mock('@/api/kpi', () => ({
  createKpi: (...args: unknown[]) => createKpi(...args),
  updateKpi: (...args: unknown[]) => updateKpi(...args),
  getKpiByName: (...args: unknown[]) => getKpiByName(...args),
}));

const stub = { template: '<div />' };

async function mountForm(routeName: string, params: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insights/kpis/add', name: 'insights-kpis-add', component: KpiFormView },
      { path: '/insights/kpis/:fqn/edit', name: 'insights-kpis-edit', component: KpiFormView, props: true },
      { path: '/insights/kpis', name: 'insights-kpis', component: stub },
    ],
  });
  await router.push({ name: routeName, params });
  await router.isReady();
  const wrapper = mount(KpiFormView, { global: { plugins: [router, Antd, createTestI18n()] } });
  await flushPromises();
  return { wrapper, router };
}

async function fillValidForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('#kpi-form-name').setValue('description-coverage');
  await wrapper.find('#kpi-form-description').setValue('Share of assets with a description');
  await wrapper.find('#kpi-form-target').setValue('80');
  await wrapper.find('#kpi-form-start').setValue('2024-01-01');
  await wrapper.find('#kpi-form-end').setValue('2024-12-31');
  await flushPromises();
}

describe('KpiFormView', () => {
  beforeEach(() => {
    createKpi.mockReset();
    updateKpi.mockReset();
    getKpiByName.mockReset();
    createKpi.mockResolvedValue({});
    updateKpi.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a KPI with the official form fields and navigates back to the list', async () => {
    const { wrapper, router } = await mountForm('insights-kpis-add');
    const submit = wrapper.find('[data-testid="kpi-form-submit"]');
    expect(submit.attributes('disabled')).toBeDefined();
    await fillValidForm(wrapper);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(createKpi).toHaveBeenCalledTimes(1);
    const body = createKpi.mock.calls[0][0];
    expect(body.name).toBe('description-coverage');
    expect(body.description).toBe('Share of assets with a description');
    expect(body.targetValue).toBe(80);
    expect(body.metricType).toBe('NUMBER');
    expect(body.dataInsightChart).toBe('percentage_of_data_asset_with_description_kpi');
    expect(body.startDate).toBe(Date.parse('2024-01-01'));
    expect(body.endDate).toBe(Date.parse('2024-12-31'));
    expect(router.currentRoute.value.name).toBe('insights-kpis');
  });

  it('blocks submit while start is later than end', async () => {
    const { wrapper } = await mountForm('insights-kpis-add');
    await fillValidForm(wrapper);
    await wrapper.find('#kpi-form-start').setValue('2025-01-01');
    await flushPromises();
    expect(wrapper.text()).toContain('must not be later');
    expect(wrapper.find('[data-testid="kpi-form-submit"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(createKpi).not.toHaveBeenCalled();
  });

  it('loads an existing KPI for edit and updates through PUT', async () => {
    getKpiByName.mockResolvedValue({
      name: 'description-coverage',
      description: 'Share of assets with a description',
      displayName: 'Description coverage',
      metricType: 'PERCENTAGE',
      targetValue: 80,
      startDate: Date.parse('2024-01-01'),
      endDate: Date.parse('2024-12-31'),
      dataInsightChart: { name: 'percentage_of_data_asset_with_description_kpi' },
      owners: [],
    });
    const { wrapper, router } = await mountForm('insights-kpis-edit', { fqn: 'description-coverage' });
    expect(getKpiByName).toHaveBeenCalledWith('description-coverage');
    expect((wrapper.find('#kpi-form-name').element as HTMLInputElement).value).toBe(
      'description-coverage',
    );
    expect((wrapper.find('#kpi-form-start').element as HTMLInputElement).value).toBe('2024-01-01');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(updateKpi).toHaveBeenCalledTimes(1);
    expect(updateKpi.mock.calls[0][0].metricType).toBe('PERCENTAGE');
    expect(router.currentRoute.value.name).toBe('insights-kpis');
  });
});
