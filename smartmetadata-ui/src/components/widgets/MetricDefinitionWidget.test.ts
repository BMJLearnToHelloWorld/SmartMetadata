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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { createTestI18n } from '@/test/i18n';
import type { AssetDetail } from '@/types/api';
import MetricDefinitionWidget from './MetricDefinitionWidget.vue';

function metricFixture(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    entityType: 'metric',
    id: 'm-1',
    name: 'mau',
    displayName: 'Monthly Active Users',
    fullyQualifiedName: 'kpi.mau',
    metricType: 'COUNT',
    unitOfMeasurement: 'EVENTS',
    granularity: 'DAY',
    storedProcedureCode: { language: 'SQL', code: 'SELECT 1' },
    owners: [],
    tags: [],
    domains: [],
    schemaRows: [],
    schemaLabel: '',
    ...overrides,
  };
}

function mountWidget(
  metric: AssetDetail,
  options: { canEdit?: boolean; onSave?: (ops: JsonPatchOp[]) => Promise<void> } = {},
) {
  const onSave = options.onSave ?? vi.fn(async () => {});
  const wrapper = mount(MetricDefinitionWidget, {
    attachTo: document.body,
    props: { metric, canEdit: options.canEdit ?? true, onSave },
    global: { plugins: [Antd, createTestI18n()] },
  });
  return { wrapper, onSave };
}

function bodyQuery(selector: string): Element | null {
  return document.body.querySelector(selector);
}

// FormModal's own testid lands on the Modal's teleport anchor, not a
// body element, so the dialog is located through its rendered fields.
async function openDialog() {
  const edit = bodyQuery('[data-testid="metric-definition-edit"]') as HTMLElement | null;
  expect(edit).not.toBeNull();
  edit!.click();
  await flushPromises();
  await vi.waitFor(() => {
    expect(bodyQuery('[data-testid="metric-definition-type-select"]')).not.toBeNull();
  });
}

async function clickDialogSave(): Promise<void> {
  const save = document.body.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement;
  expect(save).not.toBeNull();
  save.click();
  await flushPromises();
}

async function pickSelectOption(testId: string, label: string): Promise<void> {
  const selector = document.body.querySelector(
    `[data-testid="${testId}"] .ant-select-selector`,
  ) as HTMLElement;
  expect(selector).not.toBeNull();
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  // The list is virtualized (only the first ~12 options render), so filter
  // through the select's search input before picking.
  const search = document.body.querySelector(
    `[data-testid="${testId}"] .ant-select-selection-search-input`,
  ) as HTMLInputElement;
  expect(search).not.toBeNull();
  search.value = label;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
  await vi.waitFor(() => {
    const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
    expect(options.some((el) => el.textContent?.includes(label))).toBe(true);
  });
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((el) =>
    el.textContent?.includes(label),
  );
  expect(option).toBeDefined();
  option!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

describe('MetricDefinitionWidget (pin MetricDefinitionCard)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the expression panel and the three fields with enum labels', () => {
    const { wrapper, onSave } = mountWidget(metricFixture());
    expect(wrapper.find('[data-testid="metric-definition-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="metric-expression-code"]').text()).toBe('SELECT 1');
    expect(wrapper.text()).toContain('SQL');
    // Pin getMetricEnumLabel: title-case labels, rendered uppercase.
    expect(wrapper.find('[data-testid="metric-definition-type"]').text()).toBe('Count');
    expect(wrapper.find('[data-testid="metric-definition-unit"]').text()).toBe('Events');
    expect(wrapper.find('[data-testid="metric-definition-granularity"]').text()).toBe('Day');
    expect(onSave).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('prefers the custom unit over the enum unit and dashes missing values', () => {
    const { wrapper } = mountWidget(
      metricFixture({
        metricType: undefined,
        unitOfMeasurement: 'OTHER',
        customUnitOfMeasurement: 'per session',
        granularity: undefined,
        storedProcedureCode: undefined,
      }),
    );
    expect(wrapper.find('[data-testid="metric-definition-unit"]').text()).toBe('per session');
    expect(wrapper.find('[data-testid="metric-definition-type"]').text()).toBe('—');
    expect(wrapper.find('[data-testid="metric-definition-granularity"]').text()).toBe('—');
    expect(wrapper.find('[data-testid="metric-expression-code"]').text()).toBe('—');
    wrapper.unmount();
  });

  it('hides the Edit button without edit access and for deleted metrics', () => {
    const noAccess = mountWidget(metricFixture(), { canEdit: false });
    expect(noAccess.wrapper.find('[data-testid="metric-definition-edit"]').exists()).toBe(false);
    noAccess.wrapper.unmount();
    const deleted = mountWidget(metricFixture({ deleted: true }));
    expect(deleted.wrapper.find('[data-testid="metric-definition-edit"]').exists()).toBe(false);
    deleted.wrapper.unmount();
  });

  it('saves an unchanged definition with no patch ops', async () => {
    const { wrapper, onSave } = mountWidget(metricFixture());
    await openDialog();
    await clickDialogSave();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([]);
    await vi.waitFor(() => {
      expect(bodyQuery('[data-testid="metric-definition-type-select"]')).toBeNull();
    });
    wrapper.unmount();
  });

  it('saves a changed type as a replace op', async () => {
    const { wrapper, onSave } = mountWidget(metricFixture());
    await openDialog();
    await pickSelectOption('metric-definition-type-select', 'Sum');
    await clickDialogSave();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([{ op: 'replace', path: '/metricType', value: 'SUM' }]);
    wrapper.unmount();
  });

  it('blocks save when the unit is Other and the custom unit is blank', async () => {
    const { wrapper, onSave } = mountWidget(
      metricFixture({ unitOfMeasurement: 'OTHER', customUnitOfMeasurement: undefined }),
    );
    await openDialog();
    await clickDialogSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Unit of measurement is required');
    expect(bodyQuery('[data-testid="metric-definition-type-select"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('saves a changed custom unit when the unit is Other', async () => {
    const { wrapper, onSave } = mountWidget(
      metricFixture({ unitOfMeasurement: 'OTHER', customUnitOfMeasurement: 'per session' }),
    );
    await openDialog();
    const input = bodyQuery('[data-testid="metric-definition-custom-unit"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'per visit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await clickDialogSave();
    expect(onSave).toHaveBeenCalledWith([
      { op: 'replace', path: '/customUnitOfMeasurement', value: 'per visit' },
    ]);
    wrapper.unmount();
  });

  it('keeps the expression language when the code is cleared', async () => {
    const { wrapper, onSave } = mountWidget(metricFixture());
    await openDialog();
    const code = bodyQuery('[data-testid="metric-definition-code"]') as HTMLTextAreaElement;
    expect(code).not.toBeNull();
    code.value = '';
    code.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await clickDialogSave();
    expect(onSave).toHaveBeenCalledWith([
      { op: 'replace', path: '/metricExpression', value: { language: 'SQL' } },
    ]);
    wrapper.unmount();
  });

  it('keeps the dialog open with the error alert when the save fails', async () => {
    const { wrapper, onSave } = mountWidget(metricFixture(), {
      onSave: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await openDialog();
    await clickDialogSave();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(bodyQuery('[data-testid="metric-definition-type-select"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Error while updating');
    wrapper.unmount();
  });
});
