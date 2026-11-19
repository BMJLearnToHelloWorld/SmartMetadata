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
import Antd, { InputNumber, message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import EditLoginConfigurationView from './EditLoginConfigurationView.vue';

vi.mock('@/api/system', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/system')>();
  return { ...actual, updateSetting: vi.fn() };
});

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from '@/api/client';
import { updateSetting } from '@/api/system';

const apiRequestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

async function mountEditView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
      {
        path: '/settings/preferences/loginConfiguration',
        name: 'settings-preferences-login',
        component: { template: '<div />' },
      },
      {
        path: '/settings/preferences/loginConfiguration/edit',
        name: 'settings-preferences-login-edit',
        component: EditLoginConfigurationView,
      },
    ],
  });
  // The detail page is the previous history entry, so router.back()
  // (pin navigate(-1)) returns to it.
  await router.push({ name: 'settings-preferences-login' });
  await router.push({ name: 'settings-preferences-login-edit' });
  await router.isReady();
  const wrapper = mount(EditLoginConfigurationView, {
    global: {
      plugins: [router, Antd, createTestI18n()],
      stubs: {
        Tooltip: { template: '<span><slot /></span>' },
      },
    },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({
    maxLoginFailAttempts: 5,
    accessBlockTime: 600,
    jwtTokenExpiryTime: 3600,
  });
  updateMock.mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('EditLoginConfigurationView', () => {
  it('loads the current values into the form', async () => {
    const { wrapper } = await mountEditView();
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/system/config/loginConfig');
    const inputs = wrapper.findAllComponents(InputNumber);
    expect(inputs).toHaveLength(3);
    expect(inputs[0].props('value')).toBe(5);
    expect(inputs[1].props('value')).toBe(600);
    expect(inputs[2].props('value')).toBe(3600);
    wrapper.unmount();
  });

  it('saves through the settings endpoint, dropping emptied fields, then goes back', async () => {
    const { wrapper, router } = await mountEditView();
    const inputs = wrapper.findAllComponents(InputNumber);
    await inputs[0].vm.$emit('update:value', undefined);
    await wrapper.find('[data-testid="save-login-config"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [configType, payload] = updateMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(configType).toBe('loginConfiguration');
    expect(payload).toEqual({
      maxLoginFailAttempts: undefined,
      accessBlockTime: 600,
      jwtTokenExpiryTime: 3600,
    });
    expect(router.currentRoute.value.name).toBe('settings-preferences-login');
    wrapper.unmount();
  });

  it('rejects negative values under the min-zero rule', async () => {
    const { wrapper, router } = await mountEditView();
    const inputs = wrapper.findAllComponents(InputNumber);
    await inputs[1].vm.$emit('update:value', -5);
    await wrapper.find('[data-testid="save-login-config"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('must be 0 or more');
    expect(router.currentRoute.value.name).toBe('settings-preferences-login-edit');
    wrapper.unmount();
  });

  it('carries no lower bound on max attempts or JWT expiry', async () => {
    const { wrapper } = await mountEditView();
    const inputs = wrapper.findAllComponents(InputNumber);
    expect(inputs[0].props('min')).toBeUndefined();
    expect(inputs[2].props('min')).toBeUndefined();
    expect(inputs[1].props('min')).toBe(0);
    wrapper.unmount();
  });

  it('returns to the detail view on cancel without saving', async () => {
    const { wrapper, router } = await mountEditView();
    await wrapper.find('[data-testid="login-cancel"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('settings-preferences-login');
    wrapper.unmount();
  });

  it('uses root/<name> field ids for the doc-panel drop-in', async () => {
    const { wrapper } = await mountEditView();
    expect(wrapper.find('#root\\/maxLoginFailAttempts').exists()).toBe(true);
    expect(wrapper.find('#root\\/accessBlockTime').exists()).toBe(true);
    expect(wrapper.find('#root\\/jwtTokenExpiryTime').exists()).toBe(true);
    wrapper.unmount();
  });

  it('toasts on load failure', async () => {
    apiRequestMock.mockRejectedValue(new Error('down'));
    const errorSpy = vi.spyOn(message, 'error');
    const { wrapper } = await mountEditView();
    expect(errorSpy).toHaveBeenCalledWith('down');
    errorSpy.mockRestore();
    wrapper.unmount();
  });
});

describe('EditLoginConfigurationView shell', () => {
  it('renders Settings > Preferences > Login Configuration > Edit Login Configuration, last crumb plain text', async () => {
    const { wrapper, router } = await mountEditView();
    const breadcrumb = wrapper.get('[data-testid="sm-breadcrumb"]');
    const text = breadcrumb.text();
    expect(text).toContain('Settings');
    expect(text).toContain('Preferences');
    expect(text).toContain('Login Configuration');
    expect(text).toContain('Edit Login Configuration');
    expect(text.indexOf('Login Configuration')).toBeLessThan(text.indexOf('Edit Login Configuration'));
    const links = breadcrumb.findAll('a');
    expect(links).toHaveLength(3);
    expect(links[0].text()).toBe('Settings');
    expect(links[1].text()).toBe('Preferences');
    expect(links[2].text()).toBe('Login Configuration');
    const lastItem = breadcrumb.findAll('.ant-breadcrumb-link')[3];
    expect(lastItem.find('a').exists()).toBe(false);
    expect(lastItem.find('span').text()).toBe('Edit Login Configuration');
    expect(wrapper.get('[data-testid="edit-login-configuration-heading"]').text()).toBe(
      'Edit Login Configuration',
    );
    // The Login Configuration crumb links back to the detail route.
    await links[2].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-preferences-login');
    wrapper.unmount();
  });
});
