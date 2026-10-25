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
import SystemSettingsView from './SystemSettingsView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mountSystem() {
  const i18n = createTestI18n('en-US');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>hub</div>' } },
      { path: '/admin/settings/system', name: 'admin-settings-system', component: SystemSettingsView },
    ],
  });
  await router.push('/admin/settings/system');
  await router.isReady();
  const wrapper = mount(SystemSettingsView, {
    global: {
      plugins: [router, Antd, i18n],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('SystemSettingsView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/system/version')) {
          return jsonResponse({ version: '1.11.0', revision: 'abc' });
        }
        if (url.includes('/system/config/auth')) {
          return jsonResponse({ provider: 'basic', enableSelfSignup: false });
        }
        if (url.endsWith('/api/v1/system/settings') && !url.includes('login')) {
          return jsonResponse({
            data: [
              {
                config_type: 'loginConfiguration',
                config_value: { maxLoginFailAttempts: 3, accessBlockTime: 30, jwtTokenExpiryTime: 3600 },
              },
              {
                config_type: 'emailConfiguration',
                config_value: { enableSmtpServer: false, senderMail: 'ops@example.com' },
              },
              { config_type: 'themeConfiguration', config_value: { customTheme: {} } },
            ],
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads auth + login/email from existing system APIs and links back to the hub', async () => {
    const { wrapper, router } = await mountSystem();
    expect(wrapper.find('[data-testid="system-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="auth-config"]').text()).toContain('basic');
    expect(wrapper.find('[data-testid="save-login-config"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="save-email-config"]').exists()).toBe(true);
    await wrapper.find('[data-testid="settings-back"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings');
  });
});
