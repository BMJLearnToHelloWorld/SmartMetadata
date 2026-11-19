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
import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import OmHealthView from './OmHealthView.vue';

vi.mock('@/api/client', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('@/utils/codeMirrorUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/codeMirrorUtils')>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn(),
  };
});

import { apiRequest } from '@/api/client';
import { copyTextToClipboard } from '@/utils/codeMirrorUtils';

const requestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;
const copyMock = copyTextToClipboard as unknown as ReturnType<typeof vi.fn>;

const STATUS_RESPONSE = {
  database: { description: 'DB check', message: 'DB ok', passed: true },
  searchInstance: { description: 'Search check', message: 'ES down', passed: false },
  futureCheck: { description: 'Future check', message: 'Future ok', passed: true },
  emptyCheck: null,
};

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
    ],
  });
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          health: {
            title: 'Health Check',
            lead: 'Lead',
            refresh: 'Refresh',
            loadFailed: 'load fail',
            passed: 'Success',
            failed: 'Failed',
            showLogs: 'Show logs',
            copyToClipboard: 'Copy to clipboard',
            noLogs: 'No logs',
          },
        },
      },
    },
  });
  return mount(OmHealthView, {
    global: {
      plugins: [router, i18n],

    },
  });
}

describe('OmHealthView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    requestMock.mockReset();
    copyMock.mockReset();
    requestMock.mockResolvedValue(STATUS_RESPONSE);
    copyMock.mockResolvedValue(true);
    vi.spyOn(message, 'error');
  });

  it('fetches the raw status and renders one card per truthy key', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(requestMock).toHaveBeenCalledWith('/v1/system/status');
    expect(wrapper.find('[data-testid="database"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="searchInstance"]').exists()).toBe(true);
    // Unknown future keys render too: the response type has an index
    // signature and the page maps every key.
    expect(wrapper.find('[data-testid="futureCheck"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="emptyCheck"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="database"]').text()).toContain('Database');
    expect(wrapper.find('[data-testid="searchInstance"]').text()).toContain('Search Instance');
  });

  it('shows the success badge and the message for a passing check', async () => {
    const wrapper = mountView();
    await flushPromises();
    const card = wrapper.find('[data-testid="database"]');
    expect(card.find('[data-testid="success-badge"]').exists()).toBe(true);
    expect(card.text()).toContain('DB ok');
    expect(card.find('[data-testid="lazy-log"]').exists()).toBe(false);
  });

  it('shows the failure badge, the description, and the log accordion for a failing check', async () => {
    const wrapper = mountView();
    await flushPromises();
    const card = wrapper.find('[data-testid="searchInstance"]');
    expect(card.find('[data-testid="fail-badge"]').exists()).toBe(true);
    // Failing result message is the description; the message becomes the
    // error log.
    expect(card.text()).toContain('Search check');
    expect(card.find('[data-testid="lazy-log"]').exists()).toBe(true);
    expect(card.find('.health-card__log-text').exists()).toBe(false);
    await card.find('.health-card__logs-toggle').trigger('click');
    expect(card.find('.health-card__log-text').text()).toBe('ES down');
  });

  it('copies the error log from the copy button', async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper
      .find('[data-testid="searchInstance"] [data-testid="query-entity-copy-button"]')
      .trigger('click');
    expect(copyMock).toHaveBeenCalledWith('ES down');
  });

  it('refetches on refresh and toasts while keeping old cards on failure', async () => {
    const wrapper = mountView();
    await flushPromises();
    requestMock.mockRejectedValue(new Error('boom'));
    await wrapper.find('[data-testid="om-health-refresh"]').trigger('click');
    await flushPromises();
    expect(message.error).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="database"]').exists()).toBe(true);
  });
});

describe('OmHealthView shell (§8.1/§9.3)', () => {
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
    const wrapper = mount(OmHealthView, {
      global: { plugins: [router, Antd, createTestI18n()] },
    });
    await flushPromises();
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders Settings > Preferences > Health Check above the header, last crumb plain text', async () => {
    const wrapper = await mountShellView();
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
    const wrapper = await mountShellView();
    expect(wrapper.get('[data-testid="om-health-heading"]').text()).toBe('Health Check');
    expect(wrapper.get('[data-testid="om-health-sub"]').text()).toContain(
      'Check database access, ES health, Pipeline Service Client',
    );
    expect(wrapper.find('[data-testid="settings-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="om-health-beta"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('drops null steps and reloads on refresh', async () => {
    requestMock.mockResolvedValue({
      database: { passed: true, message: 'db ok', description: 'db desc' },
    });
    const wrapper = await mountShellView();
    const text = wrapper.text();
    expect(text).toContain('Database');
    expect(text).not.toContain('JWKS');
    expect(text).not.toContain('Migrations');
    await wrapper.get('[data-testid="om-health-refresh"]').trigger('click');
    await flushPromises();
    expect(requestMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
