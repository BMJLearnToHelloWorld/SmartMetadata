/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import { useAuthStore } from '@/stores/auth';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

async function mountDetail(
  appOverrides: Record<string, unknown> = {},
  asAdmin = true,
  installed = false,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().user = asAdmin
    ? { id: 'admin', name: 'admin', isAdmin: true }
    : { id: 'u9', name: 'bob' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/marketplace/apps/:fqn',
        name: 'marketplace-app-detail',
        component: MarketplaceAppDetailView,
        props: true,
      },
      { path: '/marketplace', name: 'marketplace-overview', component: { template: '<div>mkt</div>' } },
      { path: '/marketplace/apps', name: 'marketplace-app-catalog', component: { template: '<div>catalog</div>' } },
      {
        path: '/marketplace/apps/:fqn/install',
        name: 'marketplace-app-install',
        component: { template: '<div>install</div>' },
      },
    ],
  });
  await router.push('/marketplace/apps/DataInsightsApplication');
  await router.isReady();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/apps/marketplace/name/')) {
        return jsonResponse({ ...MARKETPLACE_APP, ...appOverrides });
      }
      if (url.includes('/v1/apps/name/')) {
        return installed
          ? jsonResponse({ id: 'a1', name: 'DataInsightsApplication' })
          : jsonResponse({ message: 'not found' }, 404);
      }
      return jsonResponse({});
    }),
  );
  const wrapper = mount(MarketplaceAppDetailView, {
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('MarketplaceAppDetailView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the detail with install enabled and support links', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="marketplace-app-detail-body"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Data Insights');
    expect(wrapper.text()).toContain('Insights for your data');
    const install = wrapper.find('[data-testid="install-application"]');
    expect(install.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="app-support-email"]').attributes('href')).toBe(
      'mailto:support@example.test',
    );
    expect(wrapper.find('[data-testid="marketplace-app-detail-developer-url"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-app-detail-privacy-url"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('iSmart has verified');
  });

  it('disables install when the app is already installed', async () => {
    const { wrapper } = await mountDetail({}, true, true);
    expect(
      wrapper.find('[data-testid="install-application"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('disables install with the paid add-on alert when the app is disabled', async () => {
    const { wrapper } = await mountDetail({ enabled: false });
    expect(
      wrapper.find('[data-testid="install-application"]').attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.find('[data-testid="marketplace-app-detail-disabled-alert"]').text()).toContain(
      'is a paid add-on.',
    );
  });

  it('shows the cache message for a disabled cache warmup app', async () => {
    const { wrapper } = await mountDetail({
      enabled: false,
      name: 'CacheWarmupApplication',
      fullyQualifiedName: 'CacheWarmupApplication',
    });
    expect(wrapper.find('[data-testid="marketplace-app-detail-disabled-alert"]').text()).toContain(
      'Configure a Cache Service',
    );
  });

  it('navigates to the install route on install click', async () => {
    const { wrapper, router } = await mountDetail();
    await wrapper.find('[data-testid="install-application"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-install');
  });

  it('navigates back to the app catalog, not the data marketplace', async () => {
    // Expected-change redirection (A2): the browse target moves from
    // marketplace-overview (data market) to the new app catalog route.
    const { wrapper, router } = await mountDetail();
    await wrapper.find('[data-testid="marketplace-app-detail-browse"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('marketplace-app-catalog');
  });

  it('renders the screenshots carousel for known screenshot names', async () => {
    const { wrapper } = await mountDetail({
      appScreenshots: ['DataInsightsPic1', 'DataInsightsReportPic1'],
    });
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(true);
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
  });

  it('renders an empty slot for an unknown screenshot name without breaking the page', async () => {
    const { wrapper } = await mountDetail({ appScreenshots: ['NoSuchScreenshot'] });
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="app-screenshots-slide"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="app-screenshots-slide"] img').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="app-screenshots-dot"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="marketplace-app-detail-body"]').exists()).toBe(true);
  });

  it('renders no screenshots region when the app has no screenshots', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-testid="app-screenshots"]').exists()).toBe(false);
  });

  it('renders the description as markdown through the shared renderer', async () => {
    const { wrapper } = await mountDetail({ description: 'Insights **bold** and [docs](https://example.test).' });
    const description = wrapper.find('[data-testid="marketplace-app-detail-description"]');
    expect(description.exists()).toBe(true);
    expect(description.find('strong').text()).toBe('bold');
    expect(description.find('a').attributes('href')).toBe('https://example.test');
  });

  it('adds the contact line to the disabled alert, but not for cache warmup', async () => {
    const { wrapper } = await mountDetail({ enabled: false });
    expect(wrapper.find('[data-testid="marketplace-app-detail-contact"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-app-detail-contact"]').text()).toContain('Please contact us');
    const cache = await mountDetail({
      enabled: false,
      name: 'CacheWarmupApplication',
      fullyQualifiedName: 'CacheWarmupApplication',
    });
    expect(cache.wrapper.find('[data-testid="marketplace-app-detail-contact"]').exists()).toBe(false);
  });

  it('renders the forbidden page for non-admin users', async () => {
    const { wrapper } = await mountDetail({}, false);
    expect(wrapper.find('[data-testid="marketplace-app-detail-body"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Access not allowed');
  });

  it('shows a load error when the marketplace fetch fails', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().user = { id: 'admin', name: 'admin', isAdmin: true };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/marketplace/apps/:fqn',
          name: 'marketplace-app-detail',
          component: MarketplaceAppDetailView,
          props: true,
        },
      ],
    });
    await router.push('/marketplace/apps/Nope');
    await router.isReady();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'gone' }, 404)),
    );
    const wrapper = mount(MarketplaceAppDetailView, {
      global: {
        plugins: [pinia, router, Antd, createTestI18n()],
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="marketplace-app-detail-error"]').exists()).toBe(true);
  });
});
