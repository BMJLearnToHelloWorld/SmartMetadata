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
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
import AppInstallView from './AppInstallView.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const MARKETPLACE_APP = {
  id: 'm1',
  name: 'DataInsightsReportApplication',
  displayName: 'Data Insights Report',
  description: 'Scheduled insights',
  developer: 'Collate',
  developerUrl: 'https://example.test',
  updatedAt: Date.now(),
  appType: 'Internal',
  scheduleType: 'Scheduled',
  allowConfiguration: true,
  appConfiguration: { lookbackDays: 7 },
};

async function mountInstall(appOverrides: Record<string, unknown> = {}, asAdmin = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/marketplace/apps/:fqn/install',
        name: 'marketplace-app-install',
        component: AppInstallView,
        props: true,
      },
      { path: '/marketplace', name: 'marketplace-overview', component: { template: '<div>mkt</div>' } },
      { path: '/admin/apps', name: 'admin-apps', component: { template: '<div>apps</div>' } },
    ],
  });
  await router.push('/marketplace/apps/DataInsightsReportApplication/install');
  await router.isReady();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/v1/apps/marketplace/name/')) {
        return jsonResponse({ ...MARKETPLACE_APP, ...appOverrides });
      }
      if (url.includes('/v1/apps') && init?.method === 'POST') {
        return jsonResponse({ id: 'a1', name: 'DataInsightsReportApplication' });
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(AppInstallView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router, requests };
}

describe('AppInstallView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the verify card and steps for a configurable app', async () => {
    const { wrapper } = await mountInstall();
    expect(wrapper.find('[data-testid="app-install-verify"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-install-steps"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights Report');
    expect(wrapper.find('[data-testid="app-install-next"]').text()).toContain('Configure');
  });

  it('skips the configure step when the app does not allow configuration', async () => {
    const { wrapper } = await mountInstall({ allowConfiguration: false });
    expect(wrapper.find('[data-testid="app-install-next"]').text()).toContain('Schedule');
    await wrapper.find('[data-testid="app-install-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="app-install-schedule"]').exists()).toBe(true);
  });

  it('installs with a custom schedule and navigates to the apps list', async () => {
    const { wrapper, router, requests } = await mountInstall();
    await wrapper.find('[data-testid="app-install-next"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="app-install-configure"]').exists()).toBe(true);
    await wrapper.find('[data-testid="app-install-save-config"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="app-install-schedule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-schedule-preview"]').text()).toContain('0 0 * * 0');
    await wrapper.find('[data-testid="app-install-deploy"]').trigger('click');
    await flushPromises();
    const install = requests.find((request) => request.init?.method === 'POST');
    expect(install).toBeDefined();
    const body = JSON.parse(String(install?.init?.body)) as Record<string, unknown>;
    expect(body.name).toBe('DataInsightsReportApplication');
    const schedule = body.appSchedule as Record<string, unknown>;
    expect(schedule.scheduleTimeline).toBe('Custom');
    expect(schedule.cronExpression).toBe('0 0 * * 0');
    expect(router.currentRoute.value.name).toBe('admin-apps');
  });

  it('sends no schedule for a NoSchedule app', async () => {
    const { wrapper, requests } = await mountInstall({
      scheduleType: 'NoSchedule',
      allowConfiguration: true,
    });
    await wrapper.find('[data-testid="app-install-next"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="app-install-save-config"]').trigger('click');
    await flushPromises();
    const install = requests.find((request) => request.init?.method === 'POST');
    const body = JSON.parse(String(install?.init?.body)) as Record<string, unknown>;
    expect(body.appSchedule).toBeUndefined();
  });

  it('renders the forbidden page for non-admin users', async () => {
    const { wrapper } = await mountInstall({}, false);
    expect(wrapper.find('[data-testid="app-install-verify"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Access not allowed');
  });
});
