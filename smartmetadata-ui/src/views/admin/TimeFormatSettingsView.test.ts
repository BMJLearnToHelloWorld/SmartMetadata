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
import { createMemoryHistory, createRouter } from 'vue-router';
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

async function mountView() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          registry: {
            preferences: {
              timeFormat: {
                title: 'Time Format Settings',
                description: 'Time format lead',
              },
            },
          },
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
  // The resolved view renders a real SmBreadcrumb (RouterLink), so the
  // mount needs a real router — same pattern as
  // ProfilerConfigurationView.test.ts: the view route, the breadcrumb
  // targets it links to by name (admin-settings, settings-category),
  // plus a catch-all keeping sibling links resolvable.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings/preferences/timeFormat',
        name: 'settings-preferences-time-format',
        component: TimeFormatSettingsView,
      },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div />' },
      },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  });
  await router.push({ name: 'settings-preferences-time-format' });
  await router.isReady();
  return mount(TimeFormatSettingsView, {
    global: {
      plugins: [router, i18n, pinia],
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

  it('renders the registry title and lead in the PageHeader', async () => {
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="time-format-settings-heading"]').text()).toBe(
      'Time Format Settings',
    );
    expect(wrapper.find('[data-testid="time-format-settings-sub"]').text()).toBe(
      'Time format lead',
    );
  });

  it('initializes from the stored format and disables save until dirty', async () => {
    const wrapper = await mountView();
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
    const wrapper = await mountView();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="time-format-option-12h"]').classes(),
    ).toContain('ant-radio-wrapper-checked');
  });

  it('patches only defaultTimeFormat and updates the store on success', async () => {
    const wrapper = await mountView();
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
    const wrapper = await mountView();
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
    const wrapper = await mountView();
    await flushPromises();
    expect(message.error).toHaveBeenCalled();
    expect(
      wrapper.find('[data-testid="time-format-option-12h"]').classes(),
    ).toContain('ant-radio-wrapper-checked');
  });
});
