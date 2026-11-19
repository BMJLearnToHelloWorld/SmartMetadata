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
import { createMemoryHistory, createRouter } from 'vue-router';
import GlossarySettingsView from './GlossarySettingsView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    updateSetting: vi.fn(),
  };
});

import { getTypedSetting, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

async function mountView() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          glossaryPrefs: {
            title: 'Glossary',
            lead: 'Lead',
            tagPropagation: 'Tag Propagation',
            reindexHint: 'Reindex hint',
            loading: 'Loading…',
            loadFailed: 'Fetch failed',
            retry: 'Retry',
            saved: 'Saved',
            saveFailed: 'Save failed',
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
        path: '/settings/preferences/glossary',
        name: 'settings-preferences-glossary',
        component: GlossarySettingsView,
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
  await router.push({ name: 'settings-preferences-glossary' });
  await router.isReady();
  return mount(GlossarySettingsView, {
    global: {
      plugins: [router, i18n],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="glossary-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
      },
    },
  });
}

describe('GlossarySettingsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({ enableTagPropagation: true })),
    );
    updateMock.mockImplementation((_name: string, value: unknown) =>
      Promise.resolve({ configType: 'glossarySettings', configValue: value }),
    );
    vi.spyOn(message, 'success');
    vi.spyOn(message, 'error');
  });

  it('shows the toggle on when propagation is enabled', async () => {
    const wrapper = await mountView();
    await flushPromises();
    const toggle = wrapper.find('[data-testid="glossary-tag-propagation"]');
    expect(toggle.classes()).toContain('ant-switch-checked');
    expect(wrapper.text()).toContain('Reindex hint');
  });

  it('treats an absent value as on', async () => {
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({})),
    );
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').classes()).toContain(
      'ant-switch-checked',
    );
  });

  it('saves immediately on toggle and updates from the response', async () => {
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="glossary-tag-propagation"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledWith('glossarySettings', { enableTagPropagation: false });
    expect(message.success).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').classes()).not.toContain(
      'ant-switch-checked',
    );
  });

  it('leaves the switch unchanged when save fails', async () => {
    updateMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('[data-testid="glossary-tag-propagation"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').classes()).toContain(
      'ant-switch-checked',
    );
    expect(message.error).toHaveBeenCalled();
  });

  it('shows the error text and retry without a toggle on load failure', async () => {
    getMock.mockRejectedValue(new Error('boom'));
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Fetch failed');
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').exists()).toBe(false);
    getMock.mockImplementation((_name: string, mapper: (value: unknown) => unknown) =>
      Promise.resolve(mapper({ enableTagPropagation: false })),
    );
    await wrapper.find('[data-testid="glossary-settings-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="glossary-tag-propagation"]').classes()).not.toContain(
      'ant-switch-checked',
    );
  });
});
