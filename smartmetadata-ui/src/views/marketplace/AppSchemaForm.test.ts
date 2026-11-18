/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { Input, InputNumber, Select } from 'ant-design-vue';
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppSchemaForm from './AppSchemaForm.vue';

function createFormI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        label: {
          all: 'All',
          cancel: 'Cancel',
          submit: 'Submit',
          submitting: 'Submitting...',
          remove: 'Remove',
          'add-entity': 'Add {entity}',
        },
        message: {
          'field-text-is-required': '{fieldText} is required.',
          'value-must-be-greater-than': '{field} must be greater than {minimum}.',
          'value-must-be-less-than-or-equal': '{field} must be less than or equal to {maximum}.',
        },
      },
    },
  });
}

const MCP_LIKE_SCHEMA = {
  title: 'MCP Server',
  type: 'object',
  additionalProperties: false,
  required: ['allowedOrigins'],
  properties: {
    baseUrl: { title: 'Base URL', type: 'string', format: 'uri' },
    allowedOrigins: {
      title: 'Allowed Origins',
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      default: ['http://localhost:3000'],
      items: { type: 'string' },
    },
    maxResponseChars: { title: 'Max Response Chars', type: 'integer', minimum: 25000, default: 100000 },
    type: { type: 'string', enum: ['McpApplication'] },
  },
};

function mountForm(props: Record<string, unknown> = {}) {
  return mount(AppSchemaForm, {
    props: {
      schema: MCP_LIKE_SCHEMA,
      formData: {},
      hiddenPaths: new Set(['type']),
      ...props,
    },
    global: { plugins: [Antd, createFormI18n()] },
    attachTo: document.body,
  });
}

describe('AppSchemaForm', () => {
  it('seeds schema defaults and submits them untouched', async () => {
    const wrapper = mountForm({ formData: { baseUrl: 'https://example.com' } });
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      baseUrl: 'https://example.com',
      allowedOrigins: ['http://localhost:3000'],
      maxResponseChars: 100000,
    });
    wrapper.unmount();
  });

  it('hides hidden paths but keeps their values in the payload', async () => {
    const wrapper = mountForm({ formData: { type: 'McpApplication' } });
    expect(wrapper.text()).not.toContain('McpApplication');
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ type: 'McpApplication' });
    wrapper.unmount();
  });

  it('omits extra data not declared in the schema', async () => {
    const wrapper = mountForm({ formData: { baseUrl: 'https://example.com', rogue: 1 } });
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload.rogue).toBeUndefined();
    wrapper.unmount();
  });

  it('edits text values and emits change events', async () => {
    const wrapper = mountForm({});
    const input = wrapper.find('input');
    await input.setValue('https://example.com');
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({
      baseUrl: 'https://example.com',
    });
    wrapper.unmount();
  });

  it('reports minimum errors and blocks submit', async () => {
    const wrapper = mountForm({ formData: { maxResponseChars: 1 } });
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Max Response Chars must be greater than 25000.');
    wrapper.unmount();
  });

  it('reports required errors for missing fields without defaults', async () => {
    const wrapper = mountForm({
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { title: 'Name', type: 'string' } },
      },
      formData: {},
      hiddenPaths: new Set(),
    });
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Name is required.');
    wrapper.unmount();
  });

  it('resets to the render state on cancel', async () => {
    const wrapper = mountForm({ formData: { baseUrl: 'https://example.com' } });
    await wrapper.find('input').setValue('https://other.example');
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({
      baseUrl: 'https://other.example',
    });
    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')?.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe(
      'https://example.com',
    );
    wrapper.unmount();
  });

  it('re-seeds when formData changes', async () => {
    const wrapper = mountForm({ formData: { baseUrl: 'https://a.example' } });
    await wrapper.setProps({ formData: { baseUrl: 'https://b.example' } });
    expect(wrapper.findComponent(Input).props('value')).toBe('https://b.example');
    wrapper.unmount();
  });

  it('renders enum options and treeSelect All handling', async () => {
    const wrapper = mountForm({
      schema: {
        type: 'object',
        properties: {
          language: { title: 'Language', type: 'string', enum: ['EN', 'JP'] },
          entities: {
            title: 'Entities',
            type: 'array',
            uiFieldType: 'treeSelect',
            items: { type: 'string', enum: ['all', 'table', 'databaseSchema'] },
          },
        },
      },
      formData: { entities: ['table'] },
      hiddenPaths: new Set(),
    });
    const selects = wrapper.findAllComponents(Select);
    expect(selects).toHaveLength(2);
    const treeSelect = selects[1];
    expect(treeSelect.props('options')).toEqual([
      { value: 'all', label: 'All' },
      { value: 'table', label: 'Table' },
      { value: 'databaseSchema', label: 'Database Schema' },
    ]);
    await treeSelect.vm.$emit('update:value', ['table', 'all']);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ entities: ['all'] });
    wrapper.unmount();
  });

  it('adds and removes string array rows', async () => {
    const wrapper = mountForm({ formData: { allowedOrigins: ['https://a.example'] } });
    const addButton = wrapper.find('[data-testid="add-item-Allowed Origins"]');
    await addButton.trigger('click');
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({
      allowedOrigins: ['https://a.example', ''],
    });
    const removeButtons = wrapper.findAll('button[aria-label="Remove"]');
    expect(removeButtons.length).toBe(2);
    await removeButtons[0].trigger('click');
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toMatchObject({ allowedOrigins: [''] });
    wrapper.unmount();
  });

  it('edits additional-properties maps with newKey rows', async () => {
    const wrapper = mountForm({
      schema: {
        type: 'object',
        properties: {
          extensions: {
            title: 'Extensions',
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 },
          },
        },
      },
      formData: { extensions: {} },
      hiddenPaths: new Set(),
    });
    await wrapper.find('[data-testid="add-item-Extensions"]').trigger('click');
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({ extensions: { newKey1: undefined } });
    const number = wrapper.findComponent(InputNumber);
    await number.vm.$emit('change', 7);
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({ extensions: { newKey1: 7 } });
    wrapper.unmount();
  });

  it('emits focus with the RJSF id and field meta', async () => {
    const wrapper = mountForm({ formData: {} });
    const input = wrapper.find('input');
    await input.trigger('focusin');
    expect(wrapper.emitted('focus')?.[0]).toEqual([
      'root/baseUrl',
      { title: 'Base URL', description: undefined },
    ]);
    wrapper.unmount();
  });

  it('honors hideFooter, hideCancelButton, and the waiting status', async () => {
    const noFooter = mountForm({ hideFooter: true });
    expect(noFooter.find('[data-testid="submit-btn"]').exists()).toBe(false);
    noFooter.unmount();

    const noCancel = mountForm({ hideCancelButton: true });
    expect(noCancel.findAll('button').some((button) => button.text() === 'Cancel')).toBe(false);
    expect(noCancel.find('[data-testid="submit-btn"]').exists()).toBe(true);
    noCancel.unmount();

    const waiting = mountForm({ status: 'waiting' });
    const submit = waiting.find('[data-testid="submit-btn"]');
    expect(submit.text()).toContain('Submitting...');
    expect(submit.attributes('disabled')).toBeDefined();
    waiting.unmount();
  });

  it('disables controls when the form is disabled or a field is readonly', () => {
    const disabled = mountForm({ disabled: true });
    expect(disabled.findComponent(Input).props('disabled')).toBe(true);
    disabled.unmount();

    const readonlyField = mountForm({
      isFieldReadonly: (dotPath: string) => dotPath === 'baseUrl',
    });
    const inputs = readonlyField.findAllComponents(Input);
    expect(inputs[0].props('disabled')).toBe(true);
    readonlyField.unmount();
  });
});
