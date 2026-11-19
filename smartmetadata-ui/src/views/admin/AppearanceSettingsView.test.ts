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
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import logoUrl from '@/assets/iqvia-logo.svg';
import monogramUrl from '@/assets/iqvia-monogram.svg';
import { useShellConfigStore } from '@/stores/shellConfig';
import AppearanceSettingsView from './AppearanceSettingsView.vue';

const backMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: backMock }),
}));

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getSetting: vi.fn(),
    updateSetting: vi.fn(),
  };
});

import { getSetting, updateSetting } from '@/api/system';

const getMock = getSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

const RAW_CONFIG = {
  configType: 'customUiThemePreference',
  configValue: {
    topExtra: true,
    customLogoConfig: {
      customLogoUrlPath: 'https://example.com/logo.svg',
      customMonogramUrlPath: '',
      customFaviconUrlPath: '',
      extraLogoKey: 'keep-logo',
    },
    customTheme: {
      primaryColor: '#112233',
      hoverColor: '#445566',
      selectedColor: '#778899',
      extraThemeKey: 7,
    },
  },
};

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          appearance: {
            title: 'Appearance',
            lead: 'Lead',
            loadFailed: 'load fail',
            saveFailed: 'save fail',
            resetFailed: 'reset fail',
            customLogo: 'Custom Logo',
            customTheme: 'Custom Theme',
            logoUrl: 'Logo URL',
            monogramUrl: 'Monogram URL',
            faviconUrl: 'Favicon URL',
            logoUrlPlaceholder: 'logo placeholder',
            monogramUrlPlaceholder: 'monogram placeholder',
            faviconUrlPlaceholder: 'favicon placeholder',
            primaryColor: 'Primary Color',
            selectedColor: 'Selected Color',
            hoverColor: 'Hover Color',
            panelBackgroundColor: 'Panel Background Color',
            errorColor: 'Error Color',
            successColor: 'Success Color',
            warningColor: 'Warning Color',
            infoColor: 'Info Color',
            hexPlaceholder: '#RRGGBB',
            hexValidation: 'hex invalid',
            invalidUrl: '{field} is not a valid URL',
            selectColor: 'Select {field}',
            linkLabel: 'Link',
            save: 'Save',
            reset: 'Reset',
            cancel: 'Cancel',
          },
          registry: {
            preferences: {
              appearance: { title: 'Appearance', description: 'Lead' },
            },
          },
        },
      },
    },
  });
  return mount(AppearanceSettingsView, {
    global: {
      plugins: [i18n, pinia],
      stubs: {
        SmBreadcrumb: { template: '<div class="breadcrumb-stub" />' },
      },
    },
  });
}

async function setInputValue(wrapper: ReturnType<typeof mountView>, testId: string, value: string) {
  await wrapper.find(`[data-testid="${testId}"]`).setValue(value);
  await flushPromises();
}

describe('AppearanceSettingsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    backMock.mockReset();
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockResolvedValue(RAW_CONFIG);
    updateMock.mockResolvedValue({ configType: 'customUiThemePreference', configValue: {} });
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('loads the raw setting into the form and keeps the header in the loop', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith('customUiThemePreference');
    expect(
      (wrapper.find('[data-testid="customLogoUrlPath"]').element as HTMLInputElement).value,
    ).toBe('https://example.com/logo.svg');
    expect(
      (wrapper.find('[data-testid="primaryColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('#112233');
  });

  it('renders color fields in official order', async () => {
    const wrapper = mountView();
    await flushPromises();
    const order = wrapper
      .findAll('[data-testid$="-color-input"]')
      .map((node) => node.attributes('data-testid'));
    expect(order).toEqual([
      'primaryColor-color-input',
      'selectedColor-color-input',
      'hoverColor-color-input',
      'panelBackgroundColor-color-input',
      'errorColor-color-input',
      'successColor-color-input',
      'warningColor-color-input',
      'infoColor-color-input',
    ]);
  });

  it('previews the custom logo URL and falls back to bundled assets', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="customLogoUrlPath-preview"]').attributes('src')).toBe(
      'https://example.com/logo.svg',
    );
    expect(wrapper.find('[data-testid="customMonogramUrlPath-preview"]').attributes('src')).toBe(
      monogramUrl,
    );
    // Official renders the favicon field with isMonoGram: its empty-state
    // fallback is the monogram.
    expect(wrapper.find('[data-testid="customFaviconUrlPath-preview"]').attributes('src')).toBe(
      monogramUrl,
    );
    expect(wrapper.find('[data-testid="customLogoUrlPath-preview"]').attributes('width')).toBe('120');
    expect(wrapper.find('[data-testid="customMonogramUrlPath-preview"]').attributes('width')).toBe('75');
    expect(wrapper.find('[data-testid="customLogoUrlPath-preview"]').attributes('height')).toBe('70');
    // Clearing the custom URL falls back to the bundled logo.
    await setInputValue(wrapper, 'customLogoUrlPath', '');
    expect(wrapper.find('[data-testid="customLogoUrlPath-preview"]').attributes('src')).toBe(logoUrl);
  });

  it('regenerates hover and selected from a new primary color', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'primaryColor-color-input', '#005587');
    expect(
      (wrapper.find('[data-testid="hoverColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('#54d2ff');
    expect(
      (wrapper.find('[data-testid="selectedColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('#043f69');
  });

  it('does not regenerate when the primary color is cleared', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'primaryColor-color-input', '#005587');
    await setInputValue(wrapper, 'hoverColor-color-input', '#111111');
    await setInputValue(wrapper, 'primaryColor-color-input', '');
    expect(
      (wrapper.find('[data-testid="hoverColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('#111111');
  });

  it('blocks save on an invalid hex color and shows the per-field error', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'errorColor-color-input', '#zzz');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('hex invalid');
  });

  it('accepts a 3-digit hex color', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'errorColor-color-input', '#abc');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalled();
  });

  it('blocks save on an invalid logo URL and shows the per-field error', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'customLogoUrlPath', 'not-a-url');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Logo URL is not a valid URL');
  });

  it('saves the 11 fields overlaid on the snapshot, preserving unknown keys', async () => {
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'primaryColor-color-input', '#005587');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('customUiThemePreference', {
      topExtra: true,
      customLogoConfig: {
        customLogoUrlPath: 'https://example.com/logo.svg',
        customMonogramUrlPath: '',
        customFaviconUrlPath: '',
        extraLogoKey: 'keep-logo',
      },
      customTheme: {
        primaryColor: '#005587',
        hoverColor: '#54d2ff',
        selectedColor: '#043f69',
        errorColor: '',
        successColor: '',
        warningColor: '',
        infoColor: '',
        panelBackgroundColor: '',
        extraThemeKey: 7,
      },
    });
    // Success updates the slice from the payload just saved, with no
    // success toast (matching official).
    expect(useShellConfigStore().uiThemePreference?.customTheme.primaryColor).toBe('#005587');
    expect(message.success).not.toHaveBeenCalled();
  });

  it('does not update the slice when save fails', async () => {
    updateMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(useShellConfigStore().uiThemePreference).toBeNull();
    expect(message.error).toHaveBeenCalled();
  });

  it('resets all 11 fields to empty strings overlaid on the snapshot', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('customUiThemePreference', {
      topExtra: true,
      customLogoConfig: {
        customLogoUrlPath: '',
        customMonogramUrlPath: '',
        customFaviconUrlPath: '',
        extraLogoKey: 'keep-logo',
      },
      customTheme: {
        primaryColor: '',
        hoverColor: '',
        selectedColor: '',
        errorColor: '',
        successColor: '',
        warningColor: '',
        infoColor: '',
        panelBackgroundColor: '',
        extraThemeKey: 7,
      },
    });
    expect(
      (wrapper.find('[data-testid="primaryColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(useShellConfigStore().uiThemePreference?.customTheme.primaryColor).toBeUndefined();
  });

  it('navigates back on cancel', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(backMock).toHaveBeenCalled();
  });

  it('surfaces a load failure as a page error alert', async () => {
    getMock.mockRejectedValue(new Error('load boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('.ant-alert-message').text()).toBe('load boom');
  });

  it('refuses save without a PUT while the GET stays unreachable', async () => {
    getMock.mockRejectedValue(new Error('load boom'));
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'primaryColor-color-input', '#005587');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    // The save refetched once (mount load + save refetch) and refused.
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(updateMock).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith('load boom');
    // The edit survives the refusal (the refetch never touches the form).
    expect(
      (wrapper.find('[data-testid="primaryColor-color-input"]').element as HTMLInputElement).value,
    ).toBe('#005587');
  });

  it('refetches the snapshot before save after a failed load, preserving unknown keys', async () => {
    getMock.mockReset();
    getMock.mockRejectedValueOnce(new Error('load boom'));
    getMock.mockResolvedValue(RAW_CONFIG);
    const wrapper = mountView();
    await flushPromises();
    await setInputValue(wrapper, 'primaryColor-color-input', '#005587');
    await wrapper.find('[data-testid="save-btn"]').trigger('click');
    await flushPromises();
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith('customUiThemePreference', {
      topExtra: true,
      customLogoConfig: {
        customLogoUrlPath: '',
        customMonogramUrlPath: '',
        customFaviconUrlPath: '',
        extraLogoKey: 'keep-logo',
      },
      customTheme: {
        primaryColor: '#005587',
        hoverColor: '#54d2ff',
        selectedColor: '#043f69',
        errorColor: '',
        successColor: '',
        warningColor: '',
        infoColor: '',
        panelBackgroundColor: '',
        extraThemeKey: 7,
      },
    });
    // Recovery clears the stale load error.
    expect(wrapper.find('.ant-alert').exists()).toBe(false);
  });

  it('refuses reset without a PUT while the GET stays unreachable', async () => {
    getMock.mockRejectedValue(new Error('load boom'));
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(updateMock).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith('load boom');
  });
});
