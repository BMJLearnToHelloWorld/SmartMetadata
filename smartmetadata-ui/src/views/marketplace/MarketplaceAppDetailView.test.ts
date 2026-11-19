/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd, { message } from 'ant-design-vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { getApplicationByName } from '@/api/apps';
import { getMarketPlaceApplicationByFqn } from '@/api/marketplaceApps';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';
import MarketplaceAppDetailView from './MarketplaceAppDetailView.vue';

/**
 * The carousel tests must not depend on which PNGs happen to be on disk:
 * the images are left empty (Bai 2026-11-06), so the bundled set can be
 * zero and the real resolver would return `undefined` for every name. The
 * resolver is stubbed at the module boundary with the same contract (known
 * names resolve, anything else degrades to `undefined`); the real
 * resolver-to-files wiring is covered by `appScreenshots.test.ts`, which
 * reads the same directory the resolver scans.
 */
vi.mock('./appScreenshots', () => ({
  getAppScreenshotUrl: (name: string): string | undefined =>
    name === 'DataInsightsPic1' || name === 'DataInsightsReportPic1'
      ? `/assets/appScreenshots/${name}.png`
      : undefined,
}));
vi.mock('@/api/marketplaceApps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/marketplaceApps')>();
  return { ...actual, getMarketPlaceApplicationByFqn: vi.fn() };
});
vi.mock('@/api/apps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/apps')>();
  return { ...actual, getApplicationByName: vi.fn() };
});

const mockedByFqn = vi.mocked(getMarketPlaceApplicationByFqn);
const mockedByName = vi.mocked(getApplicationByName);

const MESSAGES = {
  en: {
    product: { name: 'iSmart' },
    label: {
      'browse-app-plural': 'Browse Apps',
      install: 'Install',
      'get-app-support': 'Get App Support',
      'visit-developer-website': 'Visit developer website',
      'privacy-policy': 'Privacy Policy',
      image: 'Image',
      page: 'Page',
      play: 'Play',
      pause: 'Pause',
    },
    message: {
      'app-already-installed': 'Application already installed',
      'cache-service-not-configured-message':
        'Configure a Cache Service such as Redis or ElastiCache and make sure it is reachable to enable Cache Warmup.',
      'paid-addon-description': '{app} is a paid add-on for Collate customers.',
      'please-contact-us': "Please contact us at support{'@'}getcollate.io for further details.",
      'marketplace-verify-msg':
        '{brandName} has verified that the publisher controls the domain and meets other requirements.',
    },
  },
};

const MARKETPLACE_APP = {
  id: 'm1',
  name: 'DataInsightsApplication',
  displayName: 'Data Insights',
  description: 'Insights for your data',
  fullyQualifiedName: 'DataInsightsApplication',
  developer: 'Collate',
  developerUrl: 'https://example.test',
  privacyPolicyUrl: 'https://example.test/privacy',
  supportEmail: 'support@example.test',
  enabled: true,
};

const DUMMY = { template: '<div />' };

async function mountDetail(
  appOverrides: Record<string, unknown> = {},
  asAdmin = true,
  installed = false,
  definitionError = false,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = { name: asAdmin ? 'admin' : 'bob', isAdmin: asAdmin } as LoginUser;
  if (definitionError) {
    mockedByFqn.mockRejectedValue(new Error('gone'));
  } else {
    mockedByFqn.mockResolvedValue({ ...MARKETPLACE_APP, ...appOverrides });
  }
  if (installed) {
    mockedByName.mockResolvedValue({ id: 'a1', name: 'DataInsightsApplication' });
  } else {
    mockedByName.mockRejectedValue(new Error('not found'));
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/marketplace/apps/:fqn',
        name: 'marketplace-app-detail',
        component: DUMMY,
        props: true,
      },
      { path: '/marketplace', name: 'marketplace-app-catalog', component: DUMMY },
      { path: '/marketplace/apps/:fqn/install', name: 'marketplace-app-install', component: DUMMY },
    ],
  });
  await router.push('/marketplace/apps/DataInsightsApplication');
  await router.isReady();
  const wrapper = mount(MarketplaceAppDetailView, {
    props: { fqn: 'DataInsightsApplication' },
    global: {
      plugins: [Antd, pinia, router, createI18n({ legacy: false, locale: 'en', messages: MESSAGES })],
      stubs: {
        PermissionPlaceholder: { template: '<div data-testid="permission-error-placeholder">Access Denied</div>' },
        AppLogo: { template: '<div class="logo-stub" />' },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MarketplaceAppDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the detail with install enabled and support links', async () => {
    const { wrapper } = await mountDetail();
    expect(mockedByFqn).toHaveBeenCalledWith('DataInsightsApplication', 'owners');
    expect(mockedByName).toHaveBeenCalledWith(
      'DataInsightsApplication',
      { fields: ['owners'], include: 'all' },
    );
    expect(wrapper.find('h2').text()).toBe('Data Insights');
    expect(wrapper.text()).toContain('Insights for your data');
    expect(wrapper.find('[data-testid="install-application"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="app-support-email"]').attributes('href')).toBe(
      'mailto:support@example.test',
    );
    expect(wrapper.find('a[href="https://example.test"]').exists()).toBe(true);
    expect(wrapper.find('a[href="https://example.test/privacy"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('iSmart has verified');
    wrapper.unmount();
  });

  it('disables install when the app is already installed', async () => {
    const { wrapper } = await mountDetail({}, true, true);
    expect(
      wrapper.find('[data-testid="install-application"]').attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });

  it('disables install with the paid add-on alert carrying the bare displayName', async () => {
    const { wrapper } = await mountDetail({ enabled: false });
    expect(
      wrapper.find('[data-testid="install-application"]').attributes('disabled'),
    ).toBeDefined();
    const alert = wrapper.find('.ant-alert');
    expect(alert.text()).toContain('is a paid add-on for Collate customers.');
    expect(alert.text()).toContain('Please contact us at support@getcollate.io');
    const appName = alert.find('[data-testid="appName"]');
    expect(appName.text()).toBe('Data Insights');
    expect(appName.attributes('style')).toContain('font-weight: 600');
    wrapper.unmount();
  });

  it('renders an empty appName span when the definition has no displayName', async () => {
    // Pin passes the bare displayName, not getEntityName: without one the
    // span is empty rather than falling back to the name.
    const { wrapper } = await mountDetail({ enabled: false, displayName: undefined });
    expect(wrapper.find('.ant-alert [data-testid="appName"]').text()).toBe('');
    wrapper.unmount();
  });

  it('shows the cache message for a disabled cache warmup app by name or FQN', async () => {
    const byName = await mountDetail({
      enabled: false,
      name: 'CacheWarmupApplication',
      fullyQualifiedName: 'CacheWarmupApplication',
    });
    expect(byName.wrapper.find('.ant-alert').text()).toContain('Configure a Cache Service');
    expect(byName.wrapper.find('.ant-alert').text()).not.toContain('Please contact us');
    byName.wrapper.unmount();
    const byFqn = await mountDetail({
      enabled: false,
      // Pin falls back to the FQN only when the name is missing (??),
      // not when it merely differs.
      name: undefined,
      fullyQualifiedName: 'CacheWarmupApplication',
    });
    expect(byFqn.wrapper.find('.ant-alert').text()).toContain('Configure a Cache Service');
    byFqn.wrapper.unmount();
  });

  it('navigates to the install route on install click', async () => {
    const { wrapper, router } = await mountDetail();
    await wrapper.find('[data-testid="install-application"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-install');
    wrapper.unmount();
  });

  it('navigates back to the app catalog, not the data marketplace', async () => {
    const { wrapper, router } = await mountDetail();
    const browse = wrapper.findAll('button').find((b) => b.text() === 'Browse Apps');
    expect(browse).toBeDefined();
    await browse!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-catalog');
    wrapper.unmount();
  });

  it('renders the screenshots carousel for known screenshot names', async () => {
    const { wrapper } = await mountDetail({
      appScreenshots: ['DataInsightsPic1', 'DataInsightsReportPic1'],
    });
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-screenshots"]').attributes('aria-label')).toBe('Image');
    const slides = wrapper.findAll('[data-testid="app-screenshots-slide"]');
    expect(slides).toHaveLength(2);
    expect(slides[0].attributes('aria-hidden')).toBe('false');
    expect(slides[1].attributes('aria-hidden')).toBe('true');
    const images = wrapper.findAll('[data-testid="app-screenshots-slide"] img');
    expect(images).toHaveLength(2);
    expect(images[0].attributes('src')).toContain('DataInsightsPic1.png');
    expect(images[1].attributes('src')).toContain('DataInsightsReportPic1.png');
    expect(wrapper.findAll('[data-testid="app-screenshots-dot"]')).toHaveLength(2);
    expect(wrapper.find('[data-testid="app-screenshots-play-pause"]').text()).toBe('Pause');
    wrapper.unmount();
  });

  it('advances to the next screenshot after 3s and pauses on toggle', async () => {
    const { wrapper } = await mountDetail({
      appScreenshots: ['DataInsightsPic1', 'DataInsightsReportPic1'],
    });
    vi.advanceTimersByTime(3000);
    await nextTick();
    const slides = wrapper.findAll('[data-testid="app-screenshots-slide"]');
    expect(slides[0].attributes('aria-hidden')).toBe('true');
    expect(slides[1].attributes('aria-hidden')).toBe('false');
    await wrapper.find('[data-testid="app-screenshots-play-pause"]').trigger('click');
    expect(wrapper.find('[data-testid="app-screenshots-play-pause"]').text()).toBe('Play');
    vi.advanceTimersByTime(6000);
    await nextTick();
    const held = wrapper.findAll('[data-testid="app-screenshots-slide"]');
    expect(held[1].attributes('aria-hidden')).toBe('false');
    wrapper.unmount();
  });

  it('jumps to the selected screenshot on dot click', async () => {
    const { wrapper } = await mountDetail({
      appScreenshots: ['DataInsightsPic1', 'DataInsightsReportPic1'],
    });
    const dots = wrapper.findAll('[data-testid="app-screenshots-dot"]');
    await dots[1].trigger('click');
    await nextTick();
    const slides = wrapper.findAll('[data-testid="app-screenshots-slide"]');
    expect(slides[0].attributes('aria-hidden')).toBe('true');
    expect(slides[1].attributes('aria-hidden')).toBe('false');
    wrapper.unmount();
  });

  it('renders an empty slot for an unknown screenshot name without breaking the page', async () => {
    const { wrapper } = await mountDetail({ appScreenshots: ['NoSuchScreenshot'] });
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="app-screenshots-slide"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="app-screenshots-slide"] img').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="app-screenshots-dot"]')).toHaveLength(0);
    expect(wrapper.find('h2').text()).toBe('Data Insights');
    wrapper.unmount();
  });

  it('still renders the screenshots region when the app has no screenshots', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="app-screenshots-slide"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('renders the description as markdown through the shared renderer', async () => {
    const { wrapper } = await mountDetail({ description: 'Insights **bold** and [docs](https://example.test).' });
    const description = wrapper.find('h2').element.parentElement;
    expect(description?.querySelector('strong')?.textContent).toBe('bold');
    expect(description?.querySelector('a[href="https://example.test"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('renders the forbidden page for non-admin users without fetching', async () => {
    const { wrapper } = await mountDetail({}, false);
    expect(wrapper.find('[data-testid="marketplace-app-detail-body"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Access Denied');
    expect(mockedByFqn).not.toHaveBeenCalled();
    expect(mockedByName).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('toasts and renders an empty page when the definition fetch fails', async () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    const { wrapper } = await mountDetail({}, true, false, true);
    expect(wrapper.find('h2').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toBe('');
    expect(wrapper.find('[data-testid="install-application"]').exists()).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('gone');
    errorSpy.mockRestore();
    wrapper.unmount();
  });
});
