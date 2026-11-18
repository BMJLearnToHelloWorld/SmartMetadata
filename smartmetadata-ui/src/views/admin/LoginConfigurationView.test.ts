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
import Antd from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import LoginConfigurationView from './LoginConfigurationView.vue';

const getTypedSetting = vi.fn();
const updateSetting = vi.fn();

vi.mock('@/api/system', () => ({
  getTypedSetting: (...args: unknown[]) => getTypedSetting(...args),
  updateSetting: (...args: unknown[]) => updateSetting(...args),
  // Identity: the mocked getTypedSetting already returns shaped config.
  settingAsLoginConfig: (value: unknown) => value,
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      // Breadcrumb links resolve these names; the stubs never render.
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

describe('LoginConfigurationView shell (§8.1/§9.3)', () => {
  beforeEach(() => {
    getTypedSetting.mockReset();
    updateSetting.mockReset();
    getTypedSetting.mockResolvedValue({
      maxLoginFailAttempts: 5,
      accessBlockTime: 300,
      jwtTokenExpiryTime: 3600,
    });
    updateSetting.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders Settings > Preferences > Login Configuration above the header, last crumb plain text', async () => {
    const wrapper = await mountView();
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
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="login-configuration-heading"]').text()).toBe('Login Configuration');
    expect(wrapper.get('[data-testid="login-configuration-sub"]').text()).toContain(
      'Define the handling of failed login attempts and JWT token expiry.',
    );
    expect(wrapper.find('[data-testid="settings-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-configuration-beta"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads the three login policies into the form and saves the same three fields', async () => {
    const wrapper = await mountView();
    expect(getTypedSetting).toHaveBeenCalledWith('loginConfiguration', expect.any(Function));
    expect(wrapper.find('[data-testid="login-max-fail"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-block-time"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-jwt-expiry"]').exists()).toBe(true);
    await wrapper.get('[data-testid="save-login-config"]').trigger('click');
    await flushPromises();
    expect(updateSetting).toHaveBeenCalledWith('loginConfiguration', {
      maxLoginFailAttempts: 5,
      accessBlockTime: 300,
      jwtTokenExpiryTime: 3600,
    });
    wrapper.unmount();
  });

  it('shows the load error in an Alert while the header still renders', async () => {
    getTypedSetting.mockRejectedValue(new Error('login boom'));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('login boom');
    expect(wrapper.get('[data-testid="login-configuration-heading"]').text()).toBe('Login Configuration');
    wrapper.unmount();
  });
});
