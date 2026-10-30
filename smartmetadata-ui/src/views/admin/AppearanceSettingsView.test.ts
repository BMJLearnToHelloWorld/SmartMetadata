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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import AppearanceSettingsView from './AppearanceSettingsView.vue';

vi.mock('@/api/system', () => ({
  getTypedSetting: vi.fn(),
  settingAsUiTheme: (v: unknown) => v,
  updateSetting: vi.fn(),
}));

import { getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          back: 'Back',
          appearance: {
            title: 'Appearance',
            lead: 'Lead',
            loadFailed: 'load fail',
            saved: 'saved',
            saveFailed: 'save fail',
            resetDone: 'reset',
            resetFailed: 'reset fail',
            invalidColor: 'bad {field}',
            logoUrl: 'Logo',
            monogramUrl: 'Mono',
            faviconUrl: 'Fav',
            primaryColor: 'Primary',
            selectedColor: 'Selected',
            hoverColor: 'Hover',
            errorColor: 'Error',
            successColor: 'Success',
            warningColor: 'Warning',
            infoColor: 'Info',
            panelBackgroundColor: 'Panel',
            save: 'Save',
            reset: 'Reset',
          },
        },
      },
    },
  });
  return mount(AppearanceSettingsView, {
    global: {
      plugins: [i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="appearance-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        RouterLink: true,
      },
    },
  });
}

describe('AppearanceSettingsView', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockResolvedValue({
      customLogoConfig: { customLogoUrlPath: '/a.svg' },
      customTheme: { primaryColor: '#112233' },
    });
    updateMock.mockResolvedValue({});
  });

  it('loads theme preference into form fields', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith('customUiThemePreference', expect.any(Function));
    const logo = wrapper.find('[data-testid="appearance-logo"]');
    expect((logo.element as HTMLInputElement).value || logo.attributes('value')).toBeTruthy();
  });

  it('saves customUiThemePreference on save click', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="appearance-save"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith(
      'customUiThemePreference',
      expect.objectContaining({
        customLogoConfig: expect.any(Object),
        customTheme: expect.any(Object),
      }),
    );
  });
});
