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
import { Slider } from 'ant-design-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import FieldValueBoostDialog from './FieldValueBoostDialog.vue';
import type { SearchFieldValueBoost } from '@/types/admin';

function mountDialog(boost?: SearchFieldValueBoost) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            editFieldValueBoost: 'Edit Field Value Boost',
            addFieldValueBoost: 'Add Field Value Boost',
            field: 'Field',
            fieldRequired: 'Field is required',
            selectField: 'Select a field',
            impact: 'Impact',
            modifier: 'Modifier',
            missingValue: 'Missing value',
            rangeCondition: 'Range condition',
            greaterThanOrEqualTo: 'Greater than or equal to',
            lessThanOrEqualTo: 'Less than or equal to',
            greaterThan: 'Greater than',
            lessThan: 'Less than',
            cancel: 'Cancel',
            save: 'Save',
          },
        },
      },
    },
  });
  return mount(FieldValueBoostDialog, {
    attachTo: document.body,
    props: {
      boost,
      fieldOptions: ['totalVotes', 'upVotes'],
    },
    global: { plugins: [i18n] },
  });
}

function bodyInput(testId: string): HTMLInputElement {
  return document.body.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
}

function setBodyInput(testId: string, value: string): void {
  const input = bodyInput(testId);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function selectFieldOption(label: string) {
  const selector = document.body.querySelector(
    '[data-testid="field-select"] .ant-select-selector',
  ) as HTMLElement;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flushPromises();
  const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
    (item) => item.textContent === label,
  ) as HTMLElement;
  option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function clickSave() {
  const save = document.body.querySelector(
    '[data-testid="save-field-value-boost"]',
  ) as HTMLElement;
  save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FieldValueBoostDialog', () => {
  it('seeds defaults and emits the mapped payload on save', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    expect(bodyInput('missing-value-input').value).toBe('0');
    expect(bodyInput('gte-input').value).toBe('');
    await selectFieldOption('totalVotes');
    await wrapper.findComponent(Slider).vm.$emit('update:value', 2.5);
    setBodyInput('gte-input', '5');
    await clickSave();
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          field: 'totalVotes',
          factor: 2.5,
          modifier: 'none',
          missing: 0,
          condition: { range: { gte: 5 } },
        },
      ],
    ]);
  });

  it('requires a field before saving', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await clickSave();
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(document.body.textContent).toContain('Field is required');
  });

  it('seeds from the boost and locks the field when editing', async () => {
    const wrapper = mountDialog({
      field: 'upVotes',
      factor: 3,
      modifier: 'ln',
      missing: 7,
      condition: { range: { lt: 9 } },
    });
    await flushPromises();
    expect(bodyInput('missing-value-input').value).toBe('7');
    expect(bodyInput('lt-input').value).toBe('9');
    const select = document.body.querySelector('[data-testid="field-select"]') as HTMLElement;
    expect(select.className).toContain('ant-select-disabled');
    expect(document.body.textContent).toContain('Edit Field Value Boost');
    await clickSave();
    expect(wrapper.emitted('save')).toEqual([
      [
        {
          field: 'upVotes',
          factor: 3,
          modifier: 'ln',
          missing: 7,
          condition: { range: { lt: 9 } },
        },
      ],
    ]);
  });

  it('emits close on cancel', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    const footer = document.body.querySelector('.field-value-boost-dialog__footer') as HTMLElement;
    const cancel = [...footer.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cancel',
    ) as HTMLElement;
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
