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
import Antd, { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LoginConfigurationView from './LoginConfigurationView.vue';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from '@/api/client';

const apiRequestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
      {
        path: '/settings/preferences/loginConfiguration/edit',
        name: 'settings-preferences-login-edit',
        component: { template: '<div />' },
      },
    ],
  });
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          login: {
            title: 'Login',
            lead: 'Lead',
            loadFailed: 'Fetch failed',
            saved: 'Saved',
            saveFailed: 'Save failed',
            edit: 'Edit',
            cancel: 'Cancel',
            seconds: 'seconds',
            maxFailHint: 'Max fail hint',
            blockTimeHint: 'Block time hint',
            jwtHint: 'JWT hint',
            minZero: '{field} must be 0 or more',
          },
          system: {
            maxFail: 'Max Login Fail Attempts',
            blockTime: 'Access Block Time',
            jwtExpiry: 'JWT Token Expiry Time',
            saveLogin: 'Save',
          },
        },
      },
    },
  });
  const wrapper = mount(LoginConfigurationView, {
    global: {
      plugins: [router, i18n],
      stubs: {
        Tooltip: { template: '<span><slot /></span>' },
      },
    },
  });
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockResolvedValue({
    maxLoginFailAttempts: 5,
    accessBlockTime: 600,
    jwtTokenExpiryTime: 3600,
  });
});

describe('LoginConfigurationView detail', () => {
  it('loads from the dedicated login-config endpoint and renders all three values', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/system/config/loginConfig');
    expect(wrapper.find('[data-testid="max-login-fail-attempts"]').text()).toBe('5');
    expect(wrapper.find('[data-testid="access-block-time"]').text()).toBe('600');
    expect(wrapper.find('[data-testid="jwt-token-expiry-time"]').text()).toBe('3600 seconds');
  });

  it('renders -- for missing values and still appends seconds to the JWT row', async () => {
    apiRequestMock.mockResolvedValue({});
    const { wrapper } = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="max-login-fail-attempts"]').text()).toBe('--');
    expect(wrapper.find('[data-testid="access-block-time"]').text()).toBe('--');
    expect(wrapper.find('[data-testid="jwt-token-expiry-time"]').text()).toBe('-- seconds');
  });

  it('toasts on load failure', async () => {
    apiRequestMock.mockRejectedValue(new Error('down'));
    const errorSpy = vi.spyOn(message, 'error');
    mountView();
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('down');
    errorSpy.mockRestore();
  });

  it('is read-only: no form inputs and no save button', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    expect(wrapper.find('[data-testid="save-login-config"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-cancel"]').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('navigates to the standalone edit route on Edit', async () => {
    const { wrapper, router } = mountView();
    await flushPromises();
    await wrapper.find('[data-testid="edit-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-preferences-login-edit');
  });
});

describe('LoginConfigurationView shell (§8.1/§9.3)', () => {
  async function mountShellView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(LoginConfigurationView, {
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders Settings > Preferences > Login Configuration above the header, last crumb plain text', async () => {
    const wrapper = await mountShellView();
    const breadcrumb = wrapper.get('[data-testid="sm-breadcrumb"]');
    const text = breadcrumb.text();
    expect(text).toContain('Settings');
    expect(text).toContain('Preferences');
    expect(text).toContain('Login Configuration');
    expect(text.indexOf('Settings')).toBeLessThan(text.indexOf('Preferences'));
    expect(text.indexOf('Preferences')).toBeLessThan(text.indexOf('Login Configuration'));
    const links = breadcrumb.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].text()).toBe('Settings');
    expect(links[1].text()).toBe('Preferences');
    const lastItem = breadcrumb.findAll('.ant-breadcrumb-link')[2];
    expect(lastItem.find('a').exists()).toBe(false);
    expect(lastItem.find('span').text()).toBe('Login Configuration');
    const html = wrapper.html();
    expect(html.indexOf('sm-breadcrumb')).toBeLessThan(html.indexOf('login-configuration-heading'));
    wrapper.unmount();
  });

  it('renders the registry header and description without the shell back link or Beta badge', async () => {
    const wrapper = await mountShellView();
    expect(wrapper.get('[data-testid="login-configuration-heading"]').text()).toBe('Login Configuration');
    expect(wrapper.get('[data-testid="login-configuration-sub"]').text()).toContain(
      'Define the handling of failed login attempts and JWT token expiry.',
    );
    expect(wrapper.find('[data-testid="settings-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-configuration-beta"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
