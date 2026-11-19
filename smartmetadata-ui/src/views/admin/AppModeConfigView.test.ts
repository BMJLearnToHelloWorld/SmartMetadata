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
          registry: {
            preferences: {
              appMode: { title: 'Default App Mode', description: 'Lead' },
            },
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
    // B-13: the ai option is disabled, so the chosen mode under test is
    // classic (from a stored no-default), not ai.
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({})),
    );
    const wrapper = mountView();
    await flushPromises();
    const radioInput = wrapper.find('[data-testid="app-mode-option-classic"] input');
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await wrapper.find('[data-testid="save-app-mode-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultAppMode: 'classic' });
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
    // B-13: ai is disabled by design even in DB-only mode; classic is the
    // option that proves the radios are enabled.
    expect(wrapper.find('[data-testid="app-mode-option-classic"] input').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="app-mode-option-ai"] input').attributes('disabled')).toBeDefined();
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

/**
 * B-13 (Bai 2026-11-18 21:43, C-4 §6.5 R-C4-APPMODE-TENANT close): the tenant
 * `ai` option is DISABLED, not hidden — the M3 precedent from the persona
 * AppLayoutEditor. A stored `ai` value still renders selected, the user
 * cannot newly select `ai`, and leaving `ai` (switch to `classic`, or the
 * no-default option) is unrestricted and saves the new value.
 *
 * Ported from the shell batch: the shell tests drove the old Select UI
 * (dropdown options + whole-config PUT); the sections rewrite is a radio
 * group with a single-key PATCH, so the cases are re-expressed on the
 * radio UI with the same assertions — the allow-clear case becomes the
 * no-default radio, and save-without-change becomes "no PATCH is issued"
 * (the radio UI disables save until dirty, a stronger guard).
 */
describe('AppModeConfigView B-13 tenant ai disable', () => {
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

  function mountStoredAi() {
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({ defaultAppMode: 'ai' })),
    );
    return mountView();
  }

  async function selectRadio(
    wrapper: ReturnType<typeof mountView>,
    testId: string,
  ): Promise<void> {
    const radioInput = wrapper.find(`[data-testid="${testId}"] input`);
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await flushPromises();
  }

  it('renders the ai option disabled while keeping its label; classic stays enabled', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').text()).toContain('AI');
    expect(wrapper.find('[data-testid="app-mode-option-ai"] input').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="app-mode-option-classic"] input').attributes('disabled')).toBeUndefined();
  });

  it('renders a stored ai value as the selected (disabled) option', async () => {
    const wrapper = mountStoredAi();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    expect(wrapper.find('[data-testid="app-mode-option-ai"] input').attributes('disabled')).toBeDefined();
  });

  it('does not select ai when the disabled option is clicked', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-classic"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    await selectRadio(wrapper, 'app-mode-option-ai');
    expect(wrapper.find('[data-testid="app-mode-option-classic"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').classes()).not.toContain(
      'ant-radio-wrapper-checked',
    );
  });

  it('switches from a stored ai value to classic and saves the new value', async () => {
    const wrapper = mountStoredAi();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    await selectRadio(wrapper, 'app-mode-option-classic');
    await wrapper.find('[data-testid="save-app-mode-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultAppMode: 'classic' });
    expect(message.success).toHaveBeenCalled();
  });

  it('does not rewrite the stored ai value when saving without changing the selection', async () => {
    // m-3: the option is disabled, not absent — a stored ai value must not
    // be dropped or rewritten. The radio UI disables save until dirty, so
    // the equivalent assertion is that mounting with stored ai issues no
    // PATCH at all.
    const wrapper = mountStoredAi();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('clears a stored ai value via the no-default option and saves null', async () => {
    const wrapper = mountStoredAi();
    await flushPromises();
    expect(wrapper.find('[data-testid="app-mode-option-ai"]').classes()).toContain(
      'ant-radio-wrapper-checked',
    );
    await selectRadio(wrapper, 'app-mode-option-null');
    await wrapper.find('[data-testid="save-app-mode-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultAppMode: null });
  });
});
