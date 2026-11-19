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
import Antd, { Tag, Tooltip } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { IntakeForm } from '@/api/intakeForms';
import IntakeFormsTable from './IntakeFormsTable.vue';

const WITH_FIELDS = {
  id: 'f1',
  name: 'dataProduct',
  displayName: 'Intake form for Data Product',
  entityType: 'dataProduct',
  enabled: true,
  formFields: [
    { fieldPath: 'displayName', fieldLabel: 'Display name', fieldKind: 'native', required: true },
    { fieldPath: 'priority', fieldLabel: 'Priority', fieldKind: 'customProperty', required: false },
  ],
} as unknown as IntakeForm;

const NO_FIELDS = {
  id: 'f2',
  name: 'domain',
  displayName: 'Intake form for Domain',
  entityType: 'domain',
  enabled: false,
  formFields: [],
} as unknown as IntakeForm;

function mountTable(forms: IntakeForm[] = [WITH_FIELDS, NO_FIELDS]) {
  return mount(IntakeFormsTable, {
    props: { forms, loading: false },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('IntakeFormsTable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders -- for zero fields and brand/gray field badges', async () => {
    const wrapper = mountTable();
    await flushPromises();
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[1].text()).toContain('--');
    expect(wrapper.text()).not.toContain('No fields');
    const tagColors = wrapper.findAllComponents(Tag).map((tag) => tag.props('color'));
    expect(tagColors).toEqual(['blue', 'default']);
    expect(rows[0].text()).toContain('Display name');
    expect(rows[0].text()).toContain('(displayName)');
    expect(rows[0].text()).toContain('Priority');
  });

  it('renders icon action buttons with tooltips and keeps the testids', async () => {
    const wrapper = mountTable();
    await flushPromises();
    const i18n = createTestI18n();
    const titles = wrapper.findAllComponents(Tooltip).map((tip) => tip.props('title'));
    expect(titles).toEqual([
      i18n.global.t('crud.edit'),
      i18n.global.t('crud.delete'),
      i18n.global.t('crud.edit'),
      i18n.global.t('crud.delete'),
    ]);
    const edit = wrapper.find('[data-testid="edit-dataProduct"]');
    const del = wrapper.find('[data-testid="delete-dataProduct"]');
    expect(edit.exists()).toBe(true);
    expect(del.exists()).toBe(true);
    expect(edit.text()).toBe('');
    expect(del.text()).toBe('');
    await edit.trigger('click');
    await del.trigger('click');
    expect(wrapper.emitted('edit')?.[0]?.[0]).toEqual(WITH_FIELDS);
    expect(wrapper.emitted('delete')?.[0]?.[0]).toEqual(WITH_FIELDS);
  });

  it('renders the enabled toggle with its aria label and emits flips', async () => {
    const wrapper = mountTable();
    await flushPromises();
    const toggle = wrapper.find('[data-testid="toggle-dataProduct"]');
    expect(toggle.attributes('aria-label')).toBe(createTestI18n().global.t('crud.enabled'));
    await toggle.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('toggleEnabled')).toEqual([[WITH_FIELDS, false]]);
  });
});
