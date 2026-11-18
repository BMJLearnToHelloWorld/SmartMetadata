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
import { message } from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppModeConfigView from './AppModeConfigView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getSettingsSource: vi.fn(),
    getTypedSetting: vi.fn(),
    patchAppConfiguration: vi.fn(),
  };
});

import { getSettingsSource, getTypedSetting, patchAppConfiguration } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const sourcesMock = getSettingsSource as unknown as ReturnType<typeof vi.fn>;
const patchMock = patchAppConfiguration as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          appMode: {
            title: 'Default App Mode',
            lead: 'Lead',
            loadFailed: 'load fail',
            saveFailed: 'save fail',
            saved: 'Saved',
            noDefault: 'No default',
            classic: 'Classic',
            ai: 'AI',
            deprecated: 'Deprecated',
            classicRetiring: 'Classic is retiring.',
            readReleaseNotes: 'Read the release notes',
            save: 'Save',
          },
        },
        label: {
          managedByDeploymentConfiguration: 'Managed',
          deploymentValuesOverridden: 'Overridden',
          useDeploymentValue: 'Use deployment value',
          settingsNotApplied: 'Not applied',
        },
        message: {
          settingsManagedByDeployment: 'managed {variable}',
          settingsManagedByDeploymentWithoutVariable: 'managed',
          settingsDeploymentValuesOverridden: 'overridden',
          overriddenFieldEnvVariable: 'field {field} {variable}',
          settingsReloadError: 'reload error',
          useDeploymentValueConfirmation: 'confirm?',
          deploymentValuesAdopted: 'adopted',
        },
      },
    },
  });
  return mount(AppModeConfigView, {
    global: {
      plugins: [i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="app-mode-config"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
      },
    },
  });
}

describe('AppModeConfigView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getMock.mockReset();
    sourcesMock.mockReset();
    patchMock.mockReset();
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({ defaultAppMode: 'classic' })),
    );
    sourcesMock.mockResolvedValue([]);
    patchMock.mockResolvedValue(undefined);
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('initializes from the stored mode and disables save until dirty', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-classic"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    expect(
      (wrapper.find('[data-testid="save-app-mode-settings"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('selects the no-default sentinel when no mode is stored', async () => {
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({})),
    );
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-null"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
  });

  it('renders options in official order with the classic deprecation hint', async () => {
    const wrapper = mountView();
    await flushPromises();
    const order = wrapper
      .findAll('[data-testid^="app-mode-option-"]')
      .map((node) => node.attributes('data-testid'));
    expect(order).toEqual(['app-mode-option-null', 'app-mode-option-classic', 'app-mode-option-ai']);
    expect(wrapper.find('[data-testid="classic-deprecated-badge"]').text()).toBe('Deprecated');
    expect(wrapper.find('[data-testid="classic-deprecation-hint"]').text()).toContain(
      'Classic is retiring.',
    );
    const link = wrapper.find('[data-testid="classic-deprecation-release-notes"]');
    expect(link.attributes('href')).toBe('https://docs.open-metadata.org/latest/releases/all-releases');
    expect(link.attributes('target')).toBe('_blank');
  });

  it('patches the chosen mode and re-bases dirty state on success', async () => {
    const wrapper = mountView();
    await flushPromises();
    const radioInput = wrapper.find('[data-testid="app-mode-option-ai"] input');
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await wrapper.find('[data-testid="save-app-mode-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultAppMode: 'ai' });
    expect(message.success).toHaveBeenCalled();
    expect(
      (wrapper.find('[data-testid="save-app-mode-settings"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('patches JSON null for the no-default sentinel', async () => {
    const wrapper = mountView();
    await flushPromises();
    const radioInput = wrapper.find('[data-testid="app-mode-option-null"] input');
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await wrapper.find('[data-testid="save-app-mode-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultAppMode: null });
  });

  it('disables the radios and hides save when the path is deployment-managed', async () => {
    sourcesMock.mockResolvedValue([
      {
        configType: 'appConfiguration',
        editable: true,
        source: 'ENV',
        sourceVariable: 'APP_CONFIGURATION',
        managedPaths: ['/defaultAppMode'],
      },
    ]);
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"] input').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="save-app-mode-settings"]').exists()).toBe(false);
  });

  it('renders as DB-only when the sources request fails', async () => {
    sourcesMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="save-app-mode-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-mode-option-ai"] input').attributes('disabled')).toBeUndefined();
  });

  it('toasts on load failure and keeps the no-default sentinel', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(message.error).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="app-mode-option-null"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
  });
});
