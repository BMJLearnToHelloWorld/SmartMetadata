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
import OmHealthView from './OmHealthView.vue';

const fetchSystemStatus = vi.fn();

vi.mock('@/api/system', () => ({
  fetchSystemStatus: (...args: unknown[]) => fetchSystemStatus(...args),
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
  const wrapper = mount(OmHealthView, {
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

const FULL_STATUS = {
  database: { passed: true, message: 'db ok', description: 'db desc' },
  searchInstance: { passed: true, message: 'search ok', description: 'search desc' },
  pipelineServiceClient: { passed: false, message: 'pipeline down', description: 'pipeline desc' },
  jwks: { passed: true, description: 'jwks desc' },
  migrations: { passed: true, message: 'migrations ok', description: 'migrations desc' },
  logStorage: { passed: false, description: 'log desc' },
};

describe('OmHealthView shell (§8.1/§9.3)', () => {
  beforeEach(() => {
    fetchSystemStatus.mockReset();
    fetchSystemStatus.mockResolvedValue(FULL_STATUS);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders Settings > Preferences > Health Check above the header, last crumb plain text', async () => {
    const wrapper = await mountView();
    const breadcrumb = wrapper.get('[data-testid="sm-breadcrumb"]');
    const text = breadcrumb.text();
    expect(text).toContain('Settings');
    expect(text).toContain('Preferences');
    expect(text).toContain('Health Check');
    expect(text.indexOf('Settings')).toBeLessThan(text.indexOf('Preferences'));
    expect(text.indexOf('Preferences')).toBeLessThan(text.indexOf('Health Check'));
    const links = breadcrumb.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].text()).toBe('Settings');
    expect(links[1].text()).toBe('Preferences');
    const lastItem = breadcrumb.findAll('.ant-breadcrumb-link')[2];
    expect(lastItem.find('a').exists()).toBe(false);
    expect(lastItem.find('span').text()).toBe('Health Check');
    const html = wrapper.html();
    expect(html.indexOf('sm-breadcrumb')).toBeLessThan(html.indexOf('om-health-heading'));
    wrapper.unmount();
  });

  it('renders the registry header and description without the shell back link or Beta badge', async () => {
    const wrapper = await mountView();
    expect(wrapper.get('[data-testid="om-health-heading"]').text()).toBe('Health Check');
    expect(wrapper.get('[data-testid="om-health-sub"]').text()).toContain(
      'Check database access, ES health, Pipeline Service Client',
    );
    expect(wrapper.find('[data-testid="settings-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="om-health-beta"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders one row per step validation with passed/failed tags and message-first detail', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="om-health-table"]').exists()).toBe(true);
    const text = wrapper.text();
    for (const label of ['Database', 'Search instance', 'Pipeline service client', 'JWKS', 'Migrations', 'Log storage']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('Passed');
    expect(text).toContain('Failed');
    expect(text).toContain('db ok');
    expect(text).toContain('pipeline down');
    expect(text).toContain('jwks desc');
    wrapper.unmount();
  });

  it('drops null steps and reloads on refresh', async () => {
    fetchSystemStatus.mockResolvedValue({
      database: { passed: true, message: 'db ok', description: 'db desc' },
    });
    const wrapper = await mountView();
    const text = wrapper.text();
    expect(text).toContain('Database');
    expect(text).not.toContain('JWKS');
    expect(text).not.toContain('Migrations');
    await wrapper.get('[data-testid="om-health-refresh"]').trigger('click');
    await flushPromises();
    expect(fetchSystemStatus).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('shows the load error in an Alert while the header still renders', async () => {
    fetchSystemStatus.mockRejectedValue(new Error('status down'));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('status down');
    expect(wrapper.get('[data-testid="om-health-heading"]').text()).toBe('Health Check');
    wrapper.unmount();
  });
});
