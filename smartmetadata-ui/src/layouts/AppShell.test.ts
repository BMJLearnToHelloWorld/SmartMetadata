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
import { LOCALE_STORAGE_KEY } from '@/i18n/localePreference';
import { useAuthStore } from '@/stores/auth';
import { useGuardDecisionStore } from '@/stores/guardDecision';
import { usePersonaStore } from '@/stores/persona';
import { useShellConfigStore } from '@/stores/shellConfig';
import { createTestI18n } from '@/test/i18n';
import AppShell from './AppShell.vue';

const getInboxCounts = vi.fn();

vi.mock('@/api/inbox', () => ({
  getInboxCounts: (...args: unknown[]) => getInboxCounts(...args),
}));

async function mountShell(locale: 'en-US' | 'zh-CN' = 'en-US') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const i18n = createTestI18n(locale);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: AppShell,
        children: [
          { path: '', redirect: { name: 'home' } },
          { path: 'my-data', name: 'home', component: { template: '<div>home</div>' }, meta: { flush: true } },
          { path: 'search', name: 'search', component: { template: '<div>search</div>' } },
          { path: 'lineage', name: 'lineage-home', component: { template: '<div>lineage</div>' } },
          { path: 'insights', name: 'insights', component: { template: '<div>insights</div>' } },
          {
            path: 'quality/test-cases',
            name: 'quality-test-cases',
            component: { template: '<div>tc</div>' },
          },
          {
            path: 'quality/test-definitions',
            name: 'quality-test-definitions',
            component: { template: '<div>td</div>' },
          },
          {
            path: 'observability/incidents',
            name: 'observability-incidents',
            component: { template: '<div>inc</div>' },
          },
          { path: 'data-marketplace', name: 'marketplace-overview', component: { template: '<div>mkt</div>' } },
          { path: 'governance/domains', name: 'governance-domains', component: { template: '<div>dom</div>' } },
          { path: 'governance/metrics', name: 'governance-metrics', component: { template: '<div>met</div>' } },
          { path: 'context-center', name: 'context-center-overview', component: { template: '<div>cc</div>' } },
          { path: 'tour', name: 'tour', component: { template: '<div>tour</div>' } },
          { path: 'docs', name: 'docs', component: { template: '<div>docs</div>' } },
          { path: 'login', name: 'login', component: { template: '<div>login</div>' } },
          { path: 'admin/settings', name: 'admin-settings', component: { template: '<div>settings</div>' } },
          { path: 'inbox', name: 'inbox', component: { template: '<div>inbox</div>' } },
          { path: 'admin/users/:id', name: 'admin-user', component: { template: '<div>profile</div>' } },
          { path: 'users/:fqn', name: 'user-detail', component: { template: '<div>user</div>' } },
          { path: 'settings/members/users', name: 'settings-members-users', component: { template: '<div>users</div>' } },
          { path: 'create-user', name: 'create-user', component: { template: '<div>create user</div>' } },
          { path: 'create-user/bot', name: 'create-user-bot', component: { template: '<div>create bot</div>' } },
        ],
      },
    ],
  });
  await router.push('/search');
  await router.isReady();
  const wrapper = mount(AppShell, {
    global: {
      plugins: [pinia, router, Antd, i18n],
    },
  });
  await flushPromises();
  return { wrapper, i18n, router };
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getInboxCounts.mockReset();
    getInboxCounts.mockResolvedValue({ openTaskCount: 0, unreadActivityCount: 0, pendingCount: 0 });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders the custom logo URL and falls back to the bundled logo on error', async () => {
    const { wrapper } = await mountShell();
    const img = wrapper.find('.shell__logo');
    const bundledSrc = img.attributes('src');
    expect(bundledSrc).toMatch(/^data:image\/svg\+xml/);
    useShellConfigStore().uiThemePreference = {
      customLogoConfig: { customLogoUrlPath: 'https://example.com/custom-logo.svg' },
      customTheme: {},
    };
    await flushPromises();
    expect(img.attributes('src')).toBe('https://example.com/custom-logo.svg');
    await img.trigger('error');
    expect(img.attributes('src')).toBe(bundledSrc);
  });

  it('does not re-apply the fallback when the bundled logo also fails', async () => {
    const { wrapper } = await mountShell();
    const img = wrapper.find('.shell__logo');
    useShellConfigStore().uiThemePreference = {
      customLogoConfig: { customLogoUrlPath: 'https://example.com/custom-logo.svg' },
      customTheme: {},
    };
    await flushPromises();
    await img.trigger('error');
    expect(img.attributes('data-fallback-applied')).toBe('true');
    // Simulate the bundled asset failing too: point the element at a
    // third URL and fire error again — the guard must leave it alone
    // (an unguarded handler would overwrite it with the bundled src).
    (img.element as HTMLImageElement).setAttribute('src', 'https://example.com/other.svg');
    await img.trigger('error');
    expect(img.attributes('src')).toBe('https://example.com/other.svg');
  });

  it('navigates home when the logo is clicked', async () => {
    const { wrapper, router } = await mountShell();
    expect(router.currentRoute.value.name).toBe('search');
    await wrapper.find('[data-testid="shell-logo-home"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('renders reference left-nav groups, child labels, and footer Settings/Logout', async () => {
    const { wrapper } = await mountShell();
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Explore');
    expect(wrapper.text()).toContain('Lineage');
    expect(wrapper.text()).toContain('Observability');
    expect(wrapper.text()).toContain('Data Quality');
    expect(wrapper.text()).toContain('Incident Manager');
    expect(wrapper.text()).toContain('Test Library');
    expect(wrapper.text()).toContain('Insights');
    expect(wrapper.text()).toContain('Data Marketplace');
    expect(wrapper.text()).toContain('Govern');
    expect(wrapper.text()).toContain('Glossary');
    expect(wrapper.text()).toContain('Ontology Explorer');
    expect(wrapper.text()).toContain('Column Bulk Operations');
    expect(wrapper.text()).toContain('Context Center');
    expect(wrapper.find('[data-testid="observability-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="quality-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="marketplace-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="governance-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="context-center-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ingestion-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="collaboration-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-nav"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="nav-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="global-search"]').attributes('placeholder')).toBe(
      'Search for Data Assets',
    );
    expect(wrapper.find('[data-testid="user-menu-trigger"]').exists()).toBe(true);
    // dev_ui shell composition: the old header widgets (real notifications,
    // version tag, AppMode marker) are not rendered by the redesigned
    // shell; the bell is the inbox button (B5-3). The help menu is
    // rendered (B-8, pin HELP_ITEMS). The domain scope IS rendered now
    // (pin NavBar domainScopeSelector, button trigger `domain-dropdown`,
    // ADR:2026-11-25-nav-domain-persona); the standalone top-bar persona
    // Select is gone — persona switching lives in the user menu.
    expect(wrapper.find('[data-testid="notification-box-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="help-menu-trigger"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="domain-dropdown"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="persona-switcher"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="app-version"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="app-mode-residual"]').exists()).toBe(false);
    expect(wrapper.find('.shell__sider').classes().join(' ')).not.toContain('ant-layout-sider-dark');
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('Logout');
  });

  it('navigates to the Settings hub from the footer Settings entry', async () => {
    const { wrapper, router } = await mountShell();
    await wrapper.find('[data-testid="nav-settings"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('admin-settings');
  });

  it('highlights the footer Settings entry on a settings route', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'admin-settings' });
    await flushPromises();
    const settings = wrapper.find('[data-testid="nav-settings"]');
    expect(settings.exists()).toBe(true);
    expect(settings.classes()).toContain('ant-menu-item-selected');
  });

  it('logs out from the footer Logout entry', async () => {
    const { wrapper, router } = await mountShell();
    await wrapper.find('[data-testid="nav-logout"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('keeps the footer Settings/Logout entries when the sider is collapsed', async () => {
    const { wrapper } = await mountShell();
    await wrapper.find('.shell__sider-toggle').trigger('click');
    await flushPromises();
    expect(wrapper.find('.shell__sider').classes()).toContain('ant-layout-sider-collapsed');
    expect(wrapper.find('[data-testid="nav-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="nav-logout"]').exists()).toBe(true);
  });

  it('switches locale, persists sm.locale.v1, and relabels chrome', async () => {
    const { wrapper, i18n } = await mountShell('en-US');
    i18n.global.locale.value = 'zh-CN';
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('探索');
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="logout-button"]').text()).toBe('退出');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
  });

  it('keeps Explore facet query params when the header search runs', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'search', query: { q: 'orders', entityType: 'table' } });
    await flushPromises();
    const search = wrapper.find('[data-testid="global-search"]');
    expect(search.exists()).toBe(true);
    await search.setValue('customers');
    await search.trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: 'customers', entityType: 'table' });
  });

  it('keeps Explore sort and estate query params when the header search runs', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({
      name: 'search',
      query: { q: 'orders', entityType: 'table', sort: 'popularity', estate: 'databases' },
    });
    await flushPromises();
    const search = wrapper.find('[data-testid="global-search"]');
    await search.setValue('customers');
    await search.trigger('keydown.enter');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({
      q: 'customers',
      entityType: 'table',
      sort: '_score',
      estate: 'databases',
    });
  });

  it('opens the profile from the user menu only when loggedInUser has a name, and offers no Settings entry (D-9)', async () => {
    const { wrapper, router } = await mountShell();
    const { useAuthStore } = await import('@/stores/auth');
    const auth = useAuthStore();
    auth.user = { id: 'u-1', name: 'alice', displayName: 'Alice' };
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="user-profile-item"]').exists()).toBe(true);
    // D-9: the user menu carries no Settings entry — the left sidebar
    // footer is the only Settings entry.
    expect(wrapper.find('[data-testid="user-settings-item"]').exists()).toBe(false);
    await wrapper.find('[data-testid="user-profile-item"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('user-detail');
    expect(router.currentRoute.value.params.fqn).toBe('alice');
  });

  it('hides the header search on My Data so the hero owns search', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'home' });
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(false);
    expect(wrapper.find('.shell__content--flush').exists()).toBe(true);
    await router.push({ name: 'search' });
    await flushPromises();
    expect(wrapper.find('[data-testid="global-search"]').exists()).toBe(true);
  });

  it('opens Observability when a quality route is active', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'quality-test-cases' });
    await flushPromises();
    expect(wrapper.vm).toBeTruthy();
    const selected = wrapper.find('.ant-menu-item-selected');
    expect(selected.exists()).toBe(true);
    expect(selected.text()).toContain('Data Quality');
  });

  it('highlights create-user by its navigation origin, never forcing the Hub (DESIGN §6.6 / §10.6(4))', async () => {
    const { wrapper, router } = await mountShell();
    try {
      // Origin carried in router state: the Data Quality list. A
      // settings-space origin resolves to 'admin-settings' at the nav-key
      // level (unit-covered in nav.test.ts); the shell renders the
      // Settings footer entry, so it is the visible highlight target.
      window.history.pushState(
        { breadcrumbData: [{ url: '/quality/test-cases' }] },
        '',
      );
      await router.push({ name: 'create-user' });
      await flushPromises();
      const selected = wrapper.find('.ant-menu-item-selected');
      expect(selected.exists()).toBe(true);
      expect(selected.text()).toContain('Data Quality');
    } finally {
      window.history.pushState(null, '');
    }
  });

  it('highlights nothing on a direct create-user visit (no origin state)', async () => {
    const { wrapper, router } = await mountShell();
    await router.push({ name: 'create-user' });
    await flushPromises();
    expect(wrapper.find('.ant-menu-item-selected').exists()).toBe(false);
  });

  it('logs out from the header user menu', async () => {
    const { wrapper, router } = await mountShell();
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="logout-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('navigates a section title click to the section landing page (Fix6, re-applied on dev_ui shell)', async () => {
    const { wrapper, router } = await mountShell();
    await wrapper.get('[data-testid="section-title-marketplace"]').trigger('click');
    await flushPromises();
    // B3-5: the marketplace overview is a real page now, so the section
    // title lands on it instead of the Fix6 workaround target (domains).
    expect(router.currentRoute.value.name).toBe('marketplace-overview');
  });

  it('shows the inbox pending count on the bell button (B5-3)', async () => {
    getInboxCounts.mockResolvedValue({ openTaskCount: 3, unreadActivityCount: 2, pendingCount: 5 });
    const { wrapper } = await mountShell();
    expect(wrapper.find('[data-testid="inbox-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="inbox-badge"]').text()).toContain('5');
  });

  it('lands on the inbox tasks tab when open tasks exist (B5-3)', async () => {
    getInboxCounts.mockResolvedValue({ openTaskCount: 2, unreadActivityCount: 0, pendingCount: 2 });
    const { wrapper, router } = await mountShell();
    await wrapper.find('[data-testid="inbox-button"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('inbox');
    expect(router.currentRoute.value.query.tab).toBe('tasks');
  });
});

describe('AppShell help menu (B-8, pin HELP_ITEMS)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getInboxCounts.mockReset();
    getInboxCounts.mockResolvedValue({ openTaskCount: 0, unreadActivityCount: 0, pendingCount: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function openHelpMenu(version?: string) {
    const { wrapper, router } = await mountShell();
    if (version !== undefined) {
      useShellConfigStore().serverVersion = version;
      await wrapper.vm.$nextTick();
    }
    await wrapper.find('[data-testid="help-menu-trigger"]').trigger('click');
    await flushPromises();
    return { wrapper, router };
  }

  it('renders all five pin HELP_ITEMS with the right labels, links and targets', async () => {
    const { wrapper } = await openHelpMenu('1.13.202609250930');
    expect(wrapper.find('[data-testid="help-menu"]').exists()).toBe(true);
    const tour = wrapper.find('[data-testid="help-menu-tour"] a');
    expect(tour.text()).toBe('Tour');
    expect(tour.attributes('href')).toBe('/tour');
    const docs = wrapper.find('[data-testid="help-menu-docs"] a');
    expect(docs.text()).toBe('Docs');
    expect(docs.attributes('href')).toBe('https://docs.open-metadata.org/');
    expect(docs.attributes('target')).toBe('_blank');
    const api = wrapper.find('[data-testid="help-menu-api"] a');
    expect(api.text()).toBe('API');
    expect(api.attributes('href')).toBe('/docs');
    const slack = wrapper.find('[data-testid="help-menu-slack"] a');
    expect(slack.text()).toBe('Slack Support');
    expect(slack.attributes('href')).toBe('https://slack.open-metadata.org');
    expect(slack.attributes('target')).toBe('_blank');
    const version = wrapper.find('[data-testid="help-menu-version"] a');
    expect(version.text()).toContain('Version 1.13');
    expect(version.text()).toContain('Released Sep 25, 2026');
    expect(version.attributes('href')).toBe(
      'https://open-metadata.org/product-updates#1.13.202609250930',
    );
    expect(version.attributes('target')).toBe('_blank');
  });

  it('navigates to the tour page from Tour and to swagger from API', async () => {
    const { wrapper, router } = await openHelpMenu();
    await wrapper.find('[data-testid="help-menu-tour"] a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('tour');
    await wrapper.find('[data-testid="help-menu-trigger"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="help-menu-api"] a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('docs');
  });

  it('still renders the Version item with no release date when no version is loaded', async () => {
    const { wrapper } = await openHelpMenu();
    const version = wrapper.find('[data-testid="help-menu-version"] a');
    expect(version.text()).toContain('Version');
    expect(version.text()).not.toContain('Released');
    expect(version.attributes('href')).toBe('https://open-metadata.org/product-updates#');
  });

  it('shows no release date for a clean release without a build segment', async () => {
    const { wrapper } = await openHelpMenu('1.5.0');
    const version = wrapper.find('[data-testid="help-menu-version"] a');
    expect(version.text()).toContain('Version 1.5.0');
    expect(version.text()).not.toContain('Released');
  });

  it('renders the new-version alert with a Refresh button that reloads the page', async () => {
    const { wrapper, router } = await mountShell();
    expect(wrapper.find('[data-testid="version-mismatch-alert"]').exists()).toBe(false);
    const goSpy = vi.spyOn(router, 'go');
    useShellConfigStore().versionMismatch = true;
    await wrapper.vm.$nextTick();
    const alert = wrapper.find('[data-testid="version-mismatch-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('A new version is available');
    expect(alert.text()).toContain('For a seamless experience, we recommend refreshing the page.');
    await wrapper.find('[data-testid="version-mismatch-refresh"]').trigger('click');
    await flushPromises();
    expect(goSpy).toHaveBeenCalledWith(0);
    goSpy.mockRestore();
  });

  it('re-checks the version on window focus and shows the alert when it changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/system/version')) {
          return new Response(JSON.stringify({ version: '1.6.0' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountShell();
    useShellConfigStore().serverVersion = '1.5.0';
    await wrapper.vm.$nextTick();
    window.dispatchEvent(new FocusEvent('focus'));
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="version-mismatch-alert"]').exists()).toBe(true);
  });
});

describe('AppShell persona sidebar (C-4)', () => {
  const persona = { id: 'p1', name: 'analyst', fullyQualifiedName: 'analyst', displayName: 'Analyst' };

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubWithDoc(doc: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [persona], paging: { total: 1 } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return jsonResponse(doc);
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getInboxCounts.mockReset();
    getInboxCounts.mockResolvedValue({ openTaskCount: 0, unreadActivityCount: 0, pendingCount: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders the saved navigation order and hides hidden items', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {
        navigation: [
          { id: 'insights', title: 'Insights', pageId: 'insights' },
          { id: 'home', title: 'Home', pageId: 'home' },
          { id: 'search', title: 'Explore', pageId: 'search', isHidden: true },
          {
            id: 'governance',
            title: 'Govern',
            pageId: 'governance',
            children: [
              { id: 'governance-metrics', title: 'Metrics', pageId: 'governance-metrics' },
              {
                id: 'governance-glossaries',
                title: 'Glossary',
                pageId: 'governance-glossaries',
                isHidden: true,
              },
            ],
          },
        ],
      },
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountShell();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const text = wrapper.text();
    expect(text.indexOf('Insights')).toBeGreaterThan(-1);
    expect(text.indexOf('Insights')).toBeLessThan(text.indexOf('Home'));
    expect(text).not.toContain('Explore');
    expect(text).not.toContain('Lineage');
    expect(text).toContain('Metrics');
    expect(text).not.toContain('Glossary');
    wrapper.unmount();
  });

  it('renders the default sidebar when the document carries no navigation', async () => {
    stubWithDoc({
      name: 'analyst-persona',
      fullyQualifiedName: 'persona.analyst',
      entityType: 'Page',
      data: {},
    });
    localStorage.setItem('sm.persona.v1', 'p1');
    const { wrapper } = await mountShell();
    await flushPromises();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const text = wrapper.text();
    expect(text.indexOf('Home')).toBeLessThan(text.indexOf('Explore'));
    expect(text.indexOf('Explore')).toBeLessThan(text.indexOf('Lineage'));
    expect(text).toContain('Observability');
    expect(text).toContain('Glossary');
    wrapper.unmount();
  });

  describe('guard denial slot (D-3)', () => {
    async function mountDeniedShell() {
      const { wrapper, router } = await mountShell();
      await router.push('/insights');
      await router.isReady();
      await flushPromises();
      useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: false };
      await wrapper.vm.$nextTick();
      return { wrapper, router };
    }

    function contentText(wrapper: { find: (s: string) => { text: () => string } }): string {
      return wrapper.find('.shell__content').text();
    }

    it('renders the placeholder in place and never mounts the denied component', async () => {
      const { wrapper, router } = await mountDeniedShell();
      expect(contentText(wrapper)).toContain('insights');
      useGuardDecisionStore().setDecision({
        fullPath: '/insights',
        principalKey: 'alice',
        denied: true,
      });
      await wrapper.vm.$nextTick();
      // The URL is unchanged and the matched component is not mounted:
      // only the shared placeholder occupies the content slot.
      expect(router.currentRoute.value.fullPath).toBe('/insights');
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
      expect(contentText(wrapper)).toContain('Access Denied');
      expect(contentText(wrapper)).not.toContain('insights');
      wrapper.unmount();
    });

    it('ignores a decision bound to another path or another principal', async () => {
      const { wrapper } = await mountDeniedShell();
      useGuardDecisionStore().setDecision({
        fullPath: '/search',
        principalKey: 'alice',
        denied: true,
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
      expect(contentText(wrapper)).toContain('insights');
      useGuardDecisionStore().setDecision({
        fullPath: '/insights',
        principalKey: 'bob',
        denied: true,
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
      expect(contentText(wrapper)).toContain('insights');
      wrapper.unmount();
    });

    it('drops the placeholder when navigation or identity moves on', async () => {
      const { wrapper, router } = await mountDeniedShell();
      useGuardDecisionStore().setDecision({
        fullPath: '/insights',
        principalKey: 'alice',
        denied: true,
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
      // Identity change: the decision was bound to alice.
      useAuthStore().user = { id: 'u2', name: 'bob', isAdmin: false };
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
      // Navigation change: the decision was bound to /insights.
      useAuthStore().user = { id: 'u1', name: 'alice', isAdmin: false };
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
      await router.push('/search');
      await router.isReady();
      await flushPromises();
      expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(false);
      expect(contentText(wrapper)).toContain('search');
      wrapper.unmount();
    });
  });
});

describe('AppShell user menu persona section (pin UserProfileIcon "Switch persona")', () => {
  const personas = [
    { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst', displayName: 'Analyst' },
    { id: 'p2', name: 'Steward', fullyQualifiedName: 'Steward', displayName: 'Steward' },
    { id: 'p3', name: 'Zebra', fullyQualifiedName: 'Zebra', displayName: 'Zebra' },
    { id: 'p4', name: 'Mango', fullyQualifiedName: 'Mango', displayName: 'Mango' },
  ];

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubShellFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: personas, paging: { total: personas.length } });
        }
        if (url.includes('/v1/docStore/name/')) {
          return new Response('not found', { status: 404 });
        }
        if (url.includes('/v1/domains')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  }

  async function openUserMenu() {
    const { wrapper } = await mountShell();
    useAuthStore().user = {
      id: 'u1',
      name: 'alice',
      displayName: 'Alice',
      defaultPersona: { id: 'p1', name: 'Analyst', type: 'persona' },
    };
    await flushPromises();
    await flushPromises();
    await wrapper.find('[data-testid="user-menu-trigger"]').trigger('click');
    await flushPromises();
    return wrapper;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getInboxCounts.mockReset();
    getInboxCounts.mockResolvedValue({ openTaskCount: 0, unreadActivityCount: 0, pendingCount: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the current persona name on the trigger, or Default with no selection', async () => {
    sessionStorage.setItem('sm.persona.v1', 'p2');
    stubShellFetch();
    const wrapper = await openUserMenu();
    expect(wrapper.find('[data-testid="user-menu-trigger"]').text()).toContain('Steward');
    wrapper.unmount();
  });

  it('shows Default on the trigger when no personas exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/personas')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/v1/domains')) {
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { wrapper } = await mountShell();
    await flushPromises();
    await flushPromises();
    expect(wrapper.find('[data-testid="user-menu-trigger"]').text()).toContain('Default');
    wrapper.unmount();
  });

  it('lists 2 personas + more in the menu, keeps the menu open when expanding', async () => {
    sessionStorage.setItem('sm.persona.v1', 'p2');
    stubShellFetch();
    const wrapper = await openUserMenu();
    expect(wrapper.find('[data-testid="user-menu"]').text()).toContain('Switch persona');
    expect(wrapper.find('[data-testid="user-menu-persona-p1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-menu-persona-p2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-menu-persona-more"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-menu-persona-p4"]').exists()).toBe(false);
    await wrapper.find('[data-testid="user-menu-persona-more"]').trigger('click');
    await flushPromises();
    // Pin's shouldCloseOnSelect={false}: the menu stays open and the
    // full list is visible without reopening.
    expect((wrapper.vm as unknown as { userMenuOpen: boolean }).userMenuOpen).toBe(true);
    expect(wrapper.find('[data-testid="user-menu-persona-p4"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="user-menu-persona-p3"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('switches the persona from the menu and closes the menu', async () => {
    sessionStorage.setItem('sm.persona.v1', 'p2');
    stubShellFetch();
    const wrapper = await openUserMenu();
    // Mango sits behind "more": expand first, then pick it.
    await wrapper.find('[data-testid="user-menu-persona-more"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="user-menu-persona-p4"]').trigger('click');
    await flushPromises();
    expect(usePersonaStore().selectedPersonaId).toBe('p4');
    expect(wrapper.find('[data-testid="user-menu-trigger"]').text()).toContain('Mango');
    expect((wrapper.vm as unknown as { userMenuOpen: boolean }).userMenuOpen).toBe(false);
    wrapper.unmount();
  });
});
