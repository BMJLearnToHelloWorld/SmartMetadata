/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent, h } from 'vue';
import { ApiError } from '@/api/client';
import { useMcpConfiguration } from './useMcpConfiguration';

const getMcpConfig = vi.hoisted(() => vi.fn());
const updateMcpConfig = vi.hoisted(() => vi.fn());
const getSettingsSource = vi.hoisted(() => vi.fn());

vi.mock('@/api/mcpConfig', () => ({ getMcpConfig, updateMcpConfig }));
vi.mock('@/api/system', () => ({ getSettingsSource }));

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountHook() {
  let exposed: ReturnType<typeof useMcpConfiguration> | undefined;
  const host = defineComponent({
    setup() {
      exposed = useMcpConfiguration();
      return () => h('div');
    },
  });
  const wrapper = mount(host, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          messages: {
            en: {
              label: { configuration: 'Configuration' },
              message: { 'entity-saved-successfully': '{entity} saved successfully.' },
            },
          },
        }),
      ],
    },
  });
  if (!exposed) {
    throw new Error('hook did not mount');
  }
  return { wrapper, hook: exposed };
}

describe('useMcpConfiguration', () => {
  beforeEach(() => {
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('picks only the editable fields into the form', async () => {
    getMcpConfig.mockResolvedValue({
      baseUrl: 'https://example.com',
      allowedOrigins: ['https://a.example'],
      maxResponseChars: 100000,
      enabled: true,
      connectTimeout: 5,
    });
    getSettingsSource.mockResolvedValue([]);
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.isFetching.value).toBe(false);
    expect(hook.formConfig.value).toEqual({
      baseUrl: 'https://example.com',
      allowedOrigins: ['https://a.example'],
      maxResponseChars: 100000,
    });
    wrapper.unmount();
  });

  it('treats a 404 as an empty config without an error toast', async () => {
    getMcpConfig.mockRejectedValue(new ApiError(404, 'not found'));
    getSettingsSource.mockResolvedValue([]);
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.formConfig.value).toEqual({});
    expect(hook.isFetching.value).toBe(false);
    expect(message.error).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('toasts other fetch failures', async () => {
    getMcpConfig.mockRejectedValue(new Error('boom'));
    getSettingsSource.mockResolvedValue([]);
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.isFetching.value).toBe(false);
    expect(message.error).toHaveBeenCalledWith('boom');
    wrapper.unmount();
  });

  it('merges stored fields back on save and toasts success', async () => {
    getMcpConfig.mockResolvedValue({ baseUrl: 'https://old.example', enabled: true });
    getSettingsSource.mockResolvedValue([]);
    updateMcpConfig.mockImplementation(async (payload: unknown) => payload);
    const { wrapper, hook } = mountHook();
    await flush();
    await hook.saveMcpConfig({ baseUrl: 'https://new.example' });
    expect(updateMcpConfig).toHaveBeenCalledWith({
      baseUrl: 'https://new.example',
      enabled: true,
    });
    expect(message.success).toHaveBeenCalledWith('Configuration saved successfully.');
    wrapper.unmount();
  });

  it('derives managed fields from the shared predicates', async () => {
    getMcpConfig.mockResolvedValue({});
    getSettingsSource.mockResolvedValue([
      {
        configType: 'mcpConfiguration',
        editable: true,
        source: 'ENV',
        managedPaths: ['/baseUrl'],
      },
      { configType: 'other', editable: true, source: 'ENV', managedPaths: ['/'] },
    ]);
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.managedFields.value).toEqual(['baseUrl']);
    expect(hook.isEveryFieldManaged.value).toBe(false);
    expect(hook.sources.value).toHaveLength(1);
    wrapper.unmount();
  });

  it('treats a whole-setting managed pointer as every field managed', async () => {
    getMcpConfig.mockResolvedValue({});
    getSettingsSource.mockResolvedValue([
      { configType: 'mcpConfiguration', editable: true, source: 'ENV', managedPaths: ['/'] },
    ]);
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.isEveryFieldManaged.value).toBe(true);
    wrapper.unmount();
  });

  it('renders database-only when the sources fetch fails', async () => {
    getMcpConfig.mockResolvedValue({});
    getSettingsSource.mockRejectedValue(new Error('403'));
    const { wrapper, hook } = mountHook();
    await flush();
    expect(hook.sources.value).toEqual([]);
    expect(hook.managedFields.value).toEqual([]);
    wrapper.unmount();
  });
});
