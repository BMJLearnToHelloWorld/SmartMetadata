/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { Input } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import McpApplicationConfiguration from './McpApplicationConfiguration.vue';

const getMcpConfig = vi.hoisted(() => vi.fn());
const updateMcpConfig = vi.hoisted(() => vi.fn());
const getSettingsSource = vi.hoisted(() => vi.fn());

vi.mock('@/api/mcpConfig', () => ({ getMcpConfig, updateMcpConfig }));
vi.mock('@/api/system', () => ({ getSettingsSource }));

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

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountMcp() {
  return mount(McpApplicationConfiguration, {
    props: { appName: 'McpApplication', jsonSchema: MCP_SCHEMA },
    global: {
      plugins: [
        Antd,
        createI18n({
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
                configuration: 'Configuration',
                'add-entity': 'Add {entity}',
                'managed-by-deployment-configuration': 'Managed by deployment configuration',
                'deployment-values-overridden': 'Deployment values overridden',
                'use-deployment-value': 'Use deployment value',
                'settings-not-applied': 'Settings not applied',
              },
              message: {
                'entity-saved-successfully': '{entity} saved successfully.',
                'settings-managed-by-deployment': 'Settings managed by deployment.',
                'settings-managed-by-deployment-without-variable':
                  'Settings managed by deployment.',
                'settings-deployment-values-overridden': 'Deployment values overridden.',
                'overridden-field-env-variable': 'Overridden field env variable.',
                'settings-reload-error': 'Settings reload error.',
                'use-deployment-value-confirmation': 'Use deployment value?',
                'deployment-values-adopted': 'Deployment values adopted.',
              },
            },
          },
        }),
      ],
    },
    attachTo: document.body,
  });
}

describe('McpApplicationConfiguration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '# MCP doc' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('shows a loader while fetching, then the three editable fields', async () => {
    getMcpConfig.mockResolvedValue({ baseUrl: 'https://example.com' });
    getSettingsSource.mockResolvedValue([]);
    const wrapper = mountMcp();
    expect(wrapper.find('[data-testid="mcp-config-loader"]').exists()).toBe(true);
    await flush();
    expect(wrapper.find('[data-testid="mcp-config-loader"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Base URL');
    expect(wrapper.text()).toContain('Allowed Origins');
    expect(wrapper.text()).toContain('Max Response Chars');
    wrapper.unmount();
  });

  it('disables the form and hides the footer when every field is managed', async () => {
    getMcpConfig.mockResolvedValue({});
    getSettingsSource.mockResolvedValue([
      { configType: 'mcpConfiguration', editable: true, source: 'ENV', managedPaths: ['/'] },
    ]);
    const wrapper = mountMcp();
    await flush();
    expect(wrapper.find('[data-testid="submit-btn"]').exists()).toBe(false);
    expect(wrapper.findComponent(Input).props('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('marks only the managed field readonly otherwise', async () => {
    getMcpConfig.mockResolvedValue({});
    getSettingsSource.mockResolvedValue([
      {
        configType: 'mcpConfiguration',
        editable: true,
        source: 'ENV',
        managedPaths: ['/baseUrl'],
      },
    ]);
    const wrapper = mountMcp();
    await flush();
    expect(wrapper.find('[data-testid="submit-btn"]').exists()).toBe(true);
    const inputs = wrapper.findAllComponents(Input);
    expect(inputs[0].props('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('saves through formatFormDataForSubmit with stored fields merged', async () => {
    getMcpConfig.mockResolvedValue({ baseUrl: 'https://old.example', enabled: true });
    getSettingsSource.mockResolvedValue([]);
    updateMcpConfig.mockImplementation(async (payload: unknown) => payload);
    const wrapper = mountMcp();
    await flush();
    await wrapper.find('input').setValue('https://new.example');
    await wrapper.find('[data-testid="submit-btn"]').trigger('click');
    await flush();
    expect(updateMcpConfig).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://new.example', enabled: true }),
    );
    wrapper.unmount();
  });
});
