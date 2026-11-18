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
import { useShellConfigStore } from '@/stores/shellConfig';
import TimeFormatSettingsView from './TimeFormatSettingsView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    patchAppConfiguration: vi.fn(),
  };
});

import { getTypedSetting, patchAppConfiguration } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const patchMock = patchAppConfiguration as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          timeFormat: {
            title: 'Default Time Format',
            lead: 'Lead',
            loadFailed: 'load fail',
            saveFailed: 'save fail',
            saved: 'Saved',
            format12h: '12-hour',
            format24h: '24-hour',
            save: 'Save',
          },
        },
      },
    },
  });
  return mount(TimeFormatSettingsView, {
    global: {
      plugins: [i18n, pinia],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="time-format-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
      },
    },
  });
}

describe('TimeFormatSettingsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getMock.mockReset();
    patchMock.mockReset();
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({ defaultTimeFormat: '24h' })),
    );
    patchMock.mockResolvedValue(undefined);
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('initializes from the stored format and disables save until dirty', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="time-format-option-24h"]').classes(),
    ).toContain('ant-radio-wrapper-checked');
    expect(
      (wrapper.find('[data-testid="save-time-format-settings"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('defaults to 12h when the stored value is absent', async () => {
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({})),
    );
    const wrapper = mountView();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="time-format-option-12h"]').classes(),
    ).toContain('ant-radio-wrapper-checked');
  });

  it('patches only defaultTimeFormat and updates the store on success', async () => {
    const wrapper = mountView();
    await flushPromises();
    const radioInput = wrapper.find('[data-testid="time-format-option-12h"] input');
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await wrapper.find('[data-testid="save-time-format-settings"]').trigger('click');
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith({ defaultTimeFormat: '12h' });
    expect(useShellConfigStore().timeFormat).toBe('12h');
    expect(message.success).toHaveBeenCalled();
    expect(
      (wrapper.find('[data-testid="save-time-format-settings"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('does not update the store when the patch fails', async () => {
    patchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    const radioInput = wrapper.find('[data-testid="time-format-option-12h"] input');
    (radioInput.element as HTMLInputElement).checked = true;
    await radioInput.trigger('change');
    await wrapper.find('[data-testid="save-time-format-settings"]').trigger('click');
    await flushPromises();
    expect(useShellConfigStore().timeFormat).toBeUndefined();
    expect(message.error).toHaveBeenCalled();
  });

  it('toasts on load failure and keeps the 12h default', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountView();
    await flushPromises();
    expect(message.error).toHaveBeenCalled();
    expect(
      wrapper.find('[data-testid="time-format-option-12h"]').classes(),
    ).toContain('ant-radio-wrapper-checked');
  });
});
