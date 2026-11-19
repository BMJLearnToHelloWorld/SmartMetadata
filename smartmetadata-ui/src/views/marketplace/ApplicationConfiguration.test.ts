/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import ApplicationConfiguration from './ApplicationConfiguration.vue';

const MCP_SCHEMA = {
  title: 'MCP Server',
  type: 'object',
  additionalProperties: false,
  required: ['allowedOrigins'],
  properties: {
    baseUrl: { title: 'Base URL', type: 'string', format: 'uri' },
    allowedOrigins: {
      title: 'Allowed Origins',
      type: 'array',
      default: ['http://localhost:3000'],
      items: { type: 'string' },
    },
    maxResponseChars: { title: 'Max Response Chars', type: 'integer', default: 100000 },
  },
};

function createConfigI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        label: {
          back: 'Back',
          save: 'Save',
          cancel: 'Cancel',
          submit: 'Submit',
          submitting: 'Submitting...',
          remove: 'Remove',
          expand: 'Expand',
          collapse: 'Collapse',
          'add-entity': 'Add {entity}',
        },
        message: {
          'field-text-is-required': '{fieldText} is required.',
        },
      },
    },
  });
}

function mountConfig(props: Record<string, unknown> = {}) {
  return mount(ApplicationConfiguration, {
    props: {
      appData: { name: 'McpApplication', appConfiguration: { baseUrl: 'https://example.com' } },
      isLoading: false,
      jsonSchema: MCP_SCHEMA,
      onConfigSave: vi.fn(),
      ...props,
    },
    global: { plugins: [Antd, createConfigI18n()] },
    attachTo: document.body,
  });
}

describe('ApplicationConfiguration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '# MCP doc' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the form and the doc panel in resizable panels', () => {
    const wrapper = mountConfig({});
    expect(wrapper.text()).toContain('Base URL');
    expect(wrapper.find('[data-testid="service-requirements"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content-resizable-panel-container"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the Back button only when onCancel exists', () => {
    const withCancel = mountConfig({ onCancel: vi.fn() });
    expect(withCancel.findAll('button').some((button) => button.text() === 'Back')).toBe(true);
    withCancel.unmount();
    const withoutCancel = mountConfig({});
    expect(withoutCancel.findAll('button').some((button) => button.text() === 'Back')).toBe(false);
    withoutCancel.unmount();
  });

  it('submits cleaned form data to onConfigSave', async () => {
    const onConfigSave = vi.fn();
    const wrapper = mountConfig({ onConfigSave });
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    expect(onConfigSave).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      allowedOrigins: ['http://localhost:3000'],
      maxResponseChars: 100000,
    });
    wrapper.unmount();
  });

  it('seeds the doc panel field after the focus delay', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountConfig({});
      await wrapper.find('input').trigger('focusin');
      await vi.advanceTimersByTimeAsync(50);
      const docPanel = wrapper.findComponent({ name: 'ServiceDocPanel' });
      expect(docPanel.exists()).toBe(true);
      expect(docPanel.props('activeField')).toBe('root/baseUrl');
      expect(docPanel.props('activeFieldMeta')).toEqual({ title: 'Base URL', description: undefined });
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
