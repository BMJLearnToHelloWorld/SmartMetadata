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
import { createMemoryHistory, createRouter } from 'vue-router';
import OmUrlConfigView from './OmUrlConfigView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    getSettingsSource: vi.fn(),
    updateSetting: vi.fn(),
  };
});

import { getSettingsSource, getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const sourcesMock = getSettingsSource as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

async function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          omUrl: {
            title: 'OM URL',
            lead: 'Lead',
            loadFailed: 'Fetch failed',
            saved: 'Saved',
            saveFailed: 'Save failed',
            url: 'Brand Name URL',
            edit: 'Edit',
            cancel: 'Cancel',
            save: 'Save',
            fieldRequired: 'Field {field} is required',
            invalidUrl: 'Invalid URL',
            urlMustUseHttpOrHttps: 'URL must use http or https',
          },
        },
      },
    },
  });
  // The view renders a real SmBreadcrumb (RouterLink), so the mount needs
  // a real router — same pattern as TimeFormatSettingsView.test.ts: the
  // view route, the breadcrumb targets it links to by name
  // (admin-settings, settings-category), plus a catch-all keeping sibling
  // links resolvable.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings/preferences/om-url-config',
        name: 'settings-preferences-om-url',
        component: OmUrlConfigView,
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
  await router.push({ name: 'settings-preferences-om-url' });
  await router.isReady();
  return mount(OmUrlConfigView, {
    global: {
      plugins: [router, i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="om-url-config"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        SettingsSourceBanner: { template: '<div />' },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({ openMetadataUrl: 'https://om.example.com' });
  sourcesMock.mockResolvedValue([]);
  updateMock.mockResolvedValue(undefined);
});

describe('OmUrlConfigView detail', () => {
  it('renders the stored URL', async () => {
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="open-metadata-url"]').text()).toBe(
      'https://om.example.com',
    );
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
  });

  it('renders -- when no URL is stored', async () => {
    getMock.mockResolvedValue({});
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="open-metadata-url"]').text()).toBe('--');
  });

  it('hides Edit when /openMetadataUrl is deployment-managed', async () => {
    sourcesMock.mockResolvedValue([
      {
        configType: 'openMetadataBaseUrlConfiguration',
        source: 'ENV',
        editable: true,
        managedPaths: ['/openMetadataUrl'],
        overriddenFields: [],
      },
    ]);
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(false);
  });
});

describe('OmUrlConfigView edit', () => {
  it('saves a valid http(s) URL through the settings endpoint', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="open-metadata-url-input"]').setValue('http://new.example.com');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('openMetadataBaseUrlConfiguration', {
      openMetadataUrl: 'http://new.example.com',
    });
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
  });

  it('rejects an empty value under the required rule', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="open-metadata-url-input"]').setValue('');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Field Brand Name URL is required');
  });

  it('rejects an unparseable URL', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="open-metadata-url-input"]').setValue('not a url');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Invalid URL');
  });

  it('rejects a parseable non-http(s) URL', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="open-metadata-url-input"]').setValue('ftp://files.example.com');
    await wrapper.find('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('URL must use http or https');
  });

  it('returns to the detail view on cancel without saving', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="cancel-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="edit-button"]').exists()).toBe(true);
  });

  it('uses the root/openMetadataUrl-input field id', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('#root\\/openMetadataUrl-input').exists()).toBe(true);
  });
});
