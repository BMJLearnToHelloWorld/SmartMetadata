/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SsoSettingsView from './SsoSettingsView.vue';

const getSecurityConfig = vi.fn();
const patchAuthenticationConfiguration = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getSecurityConfig: (...args: unknown[]) => getSecurityConfig(...args),
    patchAuthenticationConfiguration: (...args: unknown[]) => patchAuthenticationConfiguration(...args),
  };
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/settings/sso', name: 'admin-settings-sso', component: SsoSettingsView }],
  });
  await router.push({ name: 'admin-settings-sso' });
  await router.isReady();
  const wrapper = mount(SsoSettingsView, { global: { plugins: [router, Antd, createTestI18n()] } });
  await flushPromises();
  return wrapper;
}

describe('SsoSettingsView', () => {
  beforeEach(() => {
    getSecurityConfig.mockReset();
    patchAuthenticationConfiguration.mockReset();
    getSecurityConfig.mockResolvedValue({
      authenticationConfiguration: {
        provider: 'google',
        clientId: 'cid',
        callbackUrl: 'https://example.test/callback',
        enableSelfSignup: false,
      },
    });
    patchAuthenticationConfiguration.mockResolvedValue({});
  });

  it('shows the loaded provider on the overview tab', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="sso-current-provider"]').text()).toBe('google');
  });

  it('saves a patch without a clientSecret op when the secret is left empty', async () => {
    const wrapper = await mountView();
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    await tabs[1].trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="sso-save"]').trigger('click');
    await flushPromises();
    expect(patchAuthenticationConfiguration).toHaveBeenCalledTimes(1);
    const ops = patchAuthenticationConfiguration.mock.calls[0][0] as { path: string }[];
    expect(ops.some((op) => op.path === '/provider')).toBe(true);
    expect(ops.some((op) => op.path === '/clientSecret')).toBe(false);
  });
});
