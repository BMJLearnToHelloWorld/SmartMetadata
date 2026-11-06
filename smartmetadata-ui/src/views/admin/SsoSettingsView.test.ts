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
const getSettingsSource = vi.fn();
const patchSecurityConfiguration = vi.fn();

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getSecurityConfig: (...args: unknown[]) => getSecurityConfig(...args),
    getSettingsSource: (...args: unknown[]) => getSettingsSource(...args),
    patchSecurityConfiguration: (...args: unknown[]) => patchSecurityConfiguration(...args),
  };
});

async function mountView(locale: 'en-US' | 'zh-CN' = 'en-US') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/settings/sso', name: 'admin-settings-sso', component: SsoSettingsView }],
  });
  await router.push({ name: 'admin-settings-sso' });
  await router.isReady();
  const wrapper = mount(SsoSettingsView, { global: { plugins: [router, Antd, createTestI18n(locale)] } });
  await flushPromises();
  return wrapper;
}

describe('SsoSettingsView', () => {
  beforeEach(() => {
    getSecurityConfig.mockReset();
    getSettingsSource.mockReset();
    patchSecurityConfiguration.mockReset();
    getSecurityConfig.mockResolvedValue({
      authenticationConfiguration: {
        provider: 'google',
        clientId: 'cid',
        callbackUrl: 'https://example.test/callback',
        enableSelfSignup: false,
      },
    });
    getSettingsSource.mockResolvedValue({ authenticationEditable: true, authenticationManagedPaths: [] });
    patchSecurityConfiguration.mockResolvedValue(undefined);
  });

  async function openConfigurationTab(wrapper: Awaited<ReturnType<typeof mountView>>) {
    const tabs = wrapper.findAll('.ant-tabs-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    await tabs[1].trigger('click');
    await flushPromises();
  }

  it('shows the loaded provider on the overview tab', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="sso-current-provider"]').text()).toBe('google');
  });

  it('saves a document-rooted patch without a clientSecret op when the secret is left empty', async () => {
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
    await wrapper.find('[data-testid="sso-save"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    const ops = patchSecurityConfiguration.mock.calls[0][0] as { path: string }[];
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientSecret')).toBe(false);
  });

  it('sends no patch when nothing changed', async () => {
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    await wrapper.find('[data-testid="sso-save"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).not.toHaveBeenCalled();
  });

  it('locks deployment-owned fields and never sends an op for them', async () => {
    getSettingsSource.mockResolvedValue({
      authenticationEditable: true,
      authenticationManagedPaths: ['/provider'],
    });
    const wrapper = await mountView();
    await openConfigurationTab(wrapper);
    // Ant Design renders Radio.Group's disabled onto its inner radio
    // inputs, not the group root carrying the test id.
    expect(wrapper.find('[data-testid="sso-provider-group"]').findAll('input[disabled]').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="sso-managed-note"]').exists()).toBe(true);
    await wrapper.find('[data-testid="sso-client-id"]').setValue('cid2');
    await wrapper.find('[data-testid="sso-save"]').trigger('click');
    await flushPromises();
    expect(patchSecurityConfiguration).toHaveBeenCalledTimes(1);
    const ops = patchSecurityConfiguration.mock.calls[0][0] as { path: string }[];
    expect(ops.some((op) => op.path === '/authenticationConfiguration/provider')).toBe(false);
    expect(ops.some((op) => op.path === '/authenticationConfiguration/clientId')).toBe(true);
  });

  it('labels the built-in provider iSmart in both locales while keeping the openmetadata key (Wave 0 (h))', async () => {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const wrapper = await mountView(locale);
      await openConfigurationTab(wrapper);
      const group = wrapper.find('[data-testid="sso-provider-group"]');
      // Display label is the product name; the enum key is the API contract.
      expect(group.text()).toContain('iSmart');
      expect(group.text()).not.toContain('OpenMetadata');
      expect(group.find('input[value="openmetadata"]').exists()).toBe(true);
    }
  });
});
