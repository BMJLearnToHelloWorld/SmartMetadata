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
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import type { SettingSource } from '@/utils/settingsSource';
import SettingsSourceBanner from './SettingsSourceBanner.vue';

const { adoptMock, messageMock } = vi.hoisted(() => ({
  adoptMock: vi.fn(),
  messageMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/system')>()),
  adoptDeploymentConfig: adoptMock,
}));

vi.mock('ant-design-vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ant-design-vue')>()),
  message: messageMock,
}));

// Local messages: the banner references official keys the integration
// line has not written yet. Asserting rendered copy pins the exact key
// names; interpolation uses vue-i18n `{name}` syntax.
function createBannerI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        label: {
          'managed-by-deployment-configuration': 'Managed by the deployment configuration',
          'deployment-values-overridden': 'Saved values override the deployment configuration',
          'use-deployment-value': 'Use deployment value',
          'settings-not-applied': 'Latest saved settings not applied',
        },
        message: {
          'settings-managed-by-deployment':
            '{variable}=ENV makes the deployment configuration the source of these settings.',
          'settings-managed-by-deployment-without-variable':
            'The deployment configuration is the source of these settings.',
          'settings-deployment-values-overridden':
            'The deployment configuration sets a different value for these fields.',
          'overridden-field-env-variable': '{field} (set by {variable})',
          'settings-reload-error': 'This server could not apply the latest saved value: {error}',
          'use-deployment-value-confirmation':
            'The saved values of these fields will be replaced.',
          'deployment-values-adopted': 'The deployment configuration values are now in use.',
        },
        crud: { cancel: 'Cancel' },
      },
    },
  });
}

function source(overrides: Partial<SettingSource> = {}): SettingSource {
  return { configType: 'emailConfiguration', editable: true, source: 'DB', ...overrides };
}

function mountBanner(props: Record<string, unknown> = {}) {
  return mount(SettingsSourceBanner, {
    props: {
      sources: [],
      onRefetch: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    global: { plugins: [Antd, createBannerI18n()] },
  });
}

describe('SettingsSourceBanner (official SettingsSourceBanner.tsx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adoptMock.mockResolvedValue({});
  });

  it('renders nothing when env variables, overridden fields, and reload errors are all empty', () => {
    const wrapper = mountBanner({ sources: [source()] });
    expect(wrapper.find('[data-testid="settings-source-banner"]').exists()).toBe(false);
    // Vue renders a `<!--v-if-->` placeholder for the false branch; no banner content exists.
    expect(wrapper.text()).toBe('');
  });

  it('renders one env alert per variable, with the no-variable copy for a missing variable', () => {
    const wrapper = mountBanner({
      sources: [
        source({ source: 'ENV', sourceVariable: 'SHARED_VAR' }),
        source({ configType: 'b', source: 'ENV', sourceVariable: 'SHARED_VAR' }),
        source({ configType: 'c', source: 'ENV' }),
      ],
    });
    const alerts = wrapper.findAll('[data-testid="settings-source-env-alert"]');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].text()).toContain('SHARED_VAR=ENV makes the deployment configuration');
    expect(alerts[1].text()).toContain('The deployment configuration is the source');
  });

  it('renders overridden fields with the env-variable form only when a variable is set', () => {
    const wrapper = mountBanner({
      sources: [
        source({
          overriddenFields: [{ path: '/x', envVariable: 'X_VAR' }, { path: '/y' }],
        }),
      ],
    });
    expect(wrapper.find('[data-testid="settings-source-overridden-alert"]').exists()).toBe(true);
    const items = wrapper.find('[data-testid="overridden-field-list"]').findAll('li');
    expect(items.map((item) => item.text())).toEqual(['/x (set by X_VAR)', '/y']);
  });

  it('renders one reload-error alert per failing source', () => {
    const wrapper = mountBanner({
      sources: [
        source({ lastReloadError: 'boom' }),
        source({ configType: 'b', lastReloadError: '' }),
        source({ configType: 'c', lastReloadError: 'bad value' }),
      ],
    });
    const alerts = wrapper.findAll('[data-testid="settings-source-reload-error-alert"]');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].text()).toContain('boom');
    expect(alerts[1].text()).toContain('bad value');
  });

  it('adopts per config type, refetches, and calls onAdopted on full success', async () => {
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onAdopted = vi.fn();
    const wrapper = mountBanner({
      sources: [
        source({
          configType: 'a',
          overriddenFields: [{ path: '/x' }, { path: '/y' }],
        }),
        source({ configType: 'b', overriddenFields: [{ path: '/z' }] }),
      ],
      onRefetch,
      onAdopted,
    });
    await wrapper.find('[data-testid="use-deployment-value-button"]').trigger('click');
    const modal = wrapper.findComponent({ name: 'AModal' });
    expect(modal.props('open')).toBe(true);
    await modal.vm.$emit('ok');
    await flushPromises();
    expect(adoptMock).toHaveBeenCalledTimes(2);
    expect(adoptMock).toHaveBeenCalledWith('a', ['/x', '/y']);
    expect(adoptMock).toHaveBeenCalledWith('b', ['/z']);
    expect(messageMock.success).toHaveBeenCalledWith(
      'The deployment configuration values are now in use.',
      3,
    );
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onAdopted).toHaveBeenCalledTimes(1);
  });

  it('still refetches and calls onAdopted on partial success, with an error toast per failure', async () => {
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onAdopted = vi.fn();
    adoptMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('adopt failed'));
    const wrapper = mountBanner({
      sources: [
        source({ configType: 'a', overriddenFields: [{ path: '/x' }] }),
        source({ configType: 'b', overriddenFields: [{ path: '/z' }] }),
      ],
      onRefetch,
      onAdopted,
    });
    await wrapper.find('[data-testid="use-deployment-value-button"]').trigger('click');
    await wrapper.findComponent({ name: 'AModal' }).vm.$emit('ok');
    await flushPromises();
    expect(messageMock.error).toHaveBeenCalledWith('adopt failed');
    expect(messageMock.success).not.toHaveBeenCalled();
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onAdopted).toHaveBeenCalledTimes(1);
  });

  it('does not call onAdopted when every adopt fails', async () => {
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onAdopted = vi.fn();
    adoptMock.mockRejectedValue(new Error('nope'));
    const wrapper = mountBanner({
      sources: [source({ overriddenFields: [{ path: '/x' }] })],
      onRefetch,
      onAdopted,
    });
    await wrapper.find('[data-testid="use-deployment-value-button"]').trigger('click');
    await wrapper.findComponent({ name: 'AModal' }).vm.$emit('ok');
    await flushPromises();
    expect(onRefetch).toHaveBeenCalledTimes(1);
    expect(onAdopted).not.toHaveBeenCalled();
  });
});
