/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptDeploymentConfig } from '@/api/system';
import type { SsoSettingSource } from '@/admin/ssoSettingsSource';
import { createTestI18n } from '@/test/i18n';
import SsoSettingsSourceBanner from './SsoSettingsSourceBanner.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return { ...actual, adoptDeploymentConfig: vi.fn() };
});

const mockedAdopt = vi.mocked(adoptDeploymentConfig);

function source(overrides: Partial<SsoSettingSource> = {}): SsoSettingSource {
  return {
    configType: 'authenticationConfiguration',
    editable: true,
    source: 'DB',
    ...overrides,
  };
}

function mountBanner(props: Record<string, unknown> = {}) {
  return mount(SsoSettingsSourceBanner, {
    attachTo: document.body,
    props: {
      sources: [],
      onRefetch: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

beforeEach(() => {
  mockedAdopt.mockReset();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SsoSettingsSourceBanner', () => {
  it('renders nothing when nothing is managed, overridden or failing', () => {
    const wrapper = mountBanner({ sources: [source()] });
    expect(wrapper.find('[data-testid="settings-source-banner"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('renders one brand alert per deployment variable', () => {
    const wrapper = mountBanner({
      sources: [
        source({ source: 'ENV', sourceVariable: 'AUTH_PROVIDER', editable: false }),
        source({
          configType: 'authorizerConfiguration',
          source: 'ENV',
          sourceVariable: 'AUTH_PROVIDER',
          editable: false,
        }),
        source({
          configType: 'otherSetting',
          source: 'ENV',
          editable: false,
        }),
      ],
    });
    const alerts = wrapper.findAll('[data-testid="settings-source-env-alert"]');
    expect(alerts.length).toBe(2);
    expect(alerts[0].text()).toContain('Managed by the deployment configuration');
    wrapper.unmount();
  });

  it('renders overridden fields with the adopt button and modal', async () => {
    const wrapper = mountBanner({
      sources: [
        source({
          overriddenFields: [
            { path: '/provider', envVariable: 'AUTH_PROVIDER' },
            { path: '/authority' },
          ],
        }),
      ],
    });
    const alert = wrapper.find(
      '[data-testid="settings-source-overridden-alert"]',
    );
    expect(alert.exists()).toBe(true);
    const items = alert.findAll('[data-testid="overridden-field-list"] li');
    expect(items.length).toBe(2);
    await wrapper
      .find('[data-testid="use-deployment-value-button"]')
      .trigger('click');
    await wrapper.vm.$nextTick();
    expect(
      document.querySelector('[data-testid="use-deployment-value-modal"]'),
    ).not.toBeNull();
    wrapper.unmount();
  });

  it('adopts per setting, refetches and notifies on success', async () => {
    mockedAdopt.mockResolvedValue(source());
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onAdopted = vi.fn();
    const wrapper = mountBanner({
      sources: [
        source({
          overriddenFields: [{ path: '/provider', envVariable: 'AUTH_PROVIDER' }],
        }),
        source({
          configType: 'authorizerConfiguration',
          overriddenFields: [{ path: '/adminEmails' }],
        }),
      ],
      onRefetch,
      onAdopted,
    });
    await wrapper
      .find('[data-testid="use-deployment-value-button"]')
      .trigger('click');
    await wrapper.vm.$nextTick();
    const okButton = [...document.querySelectorAll('.ant-modal-footer button')].find(
      (button) => button.classList.contains('ant-btn-primary'),
    ) as HTMLElement;
    okButton.click();
    await vi.waitFor(() => {
      expect(mockedAdopt).toHaveBeenCalledTimes(2);
    });
    expect(mockedAdopt).toHaveBeenCalledWith('authenticationConfiguration', [
      '/provider',
    ]);
    expect(mockedAdopt).toHaveBeenCalledWith('authorizerConfiguration', [
      '/adminEmails',
    ]);
    await vi.waitFor(() => {
      expect(onRefetch).toHaveBeenCalledTimes(1);
      expect(onAdopted).toHaveBeenCalledTimes(1);
    });
    wrapper.unmount();
  });

  it('still refetches and notifies when one setting fails', async () => {
    mockedAdopt
      .mockResolvedValueOnce(source())
      .mockRejectedValueOnce(new Error('adopt failed'));
    const onRefetch = vi.fn().mockResolvedValue(undefined);
    const onAdopted = vi.fn();
    const wrapper = mountBanner({
      sources: [
        source({ overriddenFields: [{ path: '/provider' }] }),
        source({
          configType: 'authorizerConfiguration',
          overriddenFields: [{ path: '/adminEmails' }],
        }),
      ],
      onRefetch,
      onAdopted,
    });
    await wrapper
      .find('[data-testid="use-deployment-value-button"]')
      .trigger('click');
    await wrapper.vm.$nextTick();
    const okButton = [...document.querySelectorAll('.ant-modal-footer button')].find(
      (button) => button.classList.contains('ant-btn-primary'),
    ) as HTMLElement;
    okButton.click();
    await vi.waitFor(() => {
      expect(onRefetch).toHaveBeenCalledTimes(1);
      expect(onAdopted).toHaveBeenCalledTimes(1);
    });
    wrapper.unmount();
  });

  it('renders one error alert per reload failure', () => {
    const wrapper = mountBanner({
      sources: [source({ lastReloadError: 'boom' })],
    });
    const alerts = wrapper.findAll(
      '[data-testid="settings-source-reload-error-alert"]',
    );
    expect(alerts.length).toBe(1);
    expect(alerts[0].text()).toContain('Latest saved settings not applied');
    wrapper.unmount();
  });
});
