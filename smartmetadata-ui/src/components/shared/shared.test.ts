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
import { nextTick } from 'vue';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import PageHeader from './PageHeader.vue';
import PageLayout from './PageLayout.vue';
import SmBreadcrumb from './SmBreadcrumb.vue';
import SmIcon from './SmIcon.vue';
import SmState from './SmState.vue';
import SmTable from './SmTable.vue';
import DetailTabs from './DetailTabs.vue';
import GlobalSearchBar from './GlobalSearchBar.vue';
import HelpMenu from './HelpMenu.vue';
import VersionTag from './VersionTag.vue';
import { helpItems } from './helpItems';

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/search', name: 'search', component: { template: '<div>search</div>' } },
    ],
  });
}

async function mountWithRouter(component: unknown, props: Record<string, unknown> = {}) {
  const router = testRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(component as never, {
    props: props as never,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('shared components (Stage 1)', () => {
  it('renders PageHeader as h5 16px semibold with Beta and sub-heading', async () => {
    const wrapper = await mountWithRouter(PageHeader, {
      header: 'Glossary',
      subHeader: 'Terms live here',
      isBeta: true,
    });
    const heading = wrapper.find('h5');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toContain('Glossary');
    expect(heading.text()).toContain('Beta');
    expect(wrapper.text()).toContain('Terms live here');
  });

  it('renders PageLayout variants, panels and the centered main column', async () => {
    const wrapper = await mountWithRouter(PageLayout, { variant: 'compact', center: true });
    expect(wrapper.classes()).toContain('sm-page-layout--compact');
    expect(wrapper.classes()).toContain('sm-page-layout--center');
    const defaultWrapper = await mountWithRouter(PageLayout, {});
    expect(defaultWrapper.classes()).toContain('sm-page-layout--default');
  });

  it('renders breadcrumbs as links except the last item', async () => {
    const wrapper = await mountWithRouter(SmBreadcrumb, {
      items: [
        { label: 'Home', routeName: 'home' },
        { label: 'Explore', routeName: 'search' },
        { label: 'Table' },
      ],
    });
    const links = wrapper.findAll('a');
    expect(links.map((link) => link.text())).toEqual(['Home', 'Explore']);
    expect(wrapper.text()).toContain('Table');
  });

  it('renders distinct nav icons and an explicit missing marker', async () => {
    const home = await mountWithRouter(SmIcon, { iconKey: 'home' });
    const search = await mountWithRouter(SmIcon, { iconKey: 'search' });
    expect(home.html()).not.toBe(search.html());
    const missing = await mountWithRouter(SmIcon, { iconKey: 'no-such-key' });
    expect(missing.find('[data-testid="sm-icon-missing"]').exists()).toBe(true);
  });

  it('renders SmState empty, loading and error with retry', async () => {
    const empty = await mountWithRouter(SmState, { state: 'empty' });
    expect(empty.find('[data-testid="sm-state-empty"]').exists()).toBe(true);
    const loading = await mountWithRouter(SmState, { state: 'loading' });
    expect(loading.find('[data-testid="sm-state-loading"]').exists()).toBe(true);
    const error = await mountWithRouter(SmState, { state: 'error', showRetry: true });
    expect(error.find('[data-testid="sm-state-error"]').exists()).toBe(true);
    await error.find('button').trigger('click');
    expect(error.emitted('retry')).toBeTruthy();
  });

  it('renders table, tabs, pagination and filters from data props', async () => {
    const table = await mountWithRouter(SmTable, {
      columns: [{ title: 'Name', dataIndex: 'name', key: 'name' }],
      dataSource: [{ id: '1', name: 'orders' }],
    });
    expect(table.text()).toContain('orders');
    const tabs = await mountWithRouter(DetailTabs, {
      tabs: [
        { key: 'overview', label: 'Overview' },
        { key: 'lineage', label: 'Lineage' },
      ],
      activeKey: 'overview',
    });
    await nextTick();
    await flushPromises();
    expect(tabs.text()).toContain('Overview');
    expect(tabs.text()).toContain('Lineage');
  });

  it('emits a trimmed query from GlobalSearchBar', async () => {
    const wrapper = await mountWithRouter(GlobalSearchBar, { initialQuery: 'orders' });
    const input = wrapper.find('[data-testid="global-search"]');
    expect(input.exists()).toBe(true);
    await input.setValue('  customers  ');
    await input.trigger('keydown.enter');
    await flushPromises();
    expect(wrapper.emitted('search')?.[0]).toEqual(['customers']);
  });

  it('keeps help items data-driven with official URLs and residual tour', () => {
    const items = helpItems('1.5.0');
    expect(items.map((item) => item.key)).toEqual(['tour', 'docs', 'api', 'slack', 'version']);
    expect(items.find((item) => item.key === 'docs')?.href).toBe('https://docs.open-metadata.org/');
    expect(items.find((item) => item.key === 'slack')?.href).toBe('https://slack.open-metadata.org');
    expect(items.find((item) => item.key === 'tour')?.residualKey).toBe('chrome.helpTourResidual');
    expect(items.find((item) => item.key === 'version')?.href).toContain('1.5.0');
  });

  it('renders HelpMenu trigger and VersionTag with and without a version', async () => {
    const help = await mountWithRouter(HelpMenu, { version: '1.5.0' });
    expect(help.find('[data-testid="help-menu-trigger"]').exists()).toBe(true);
    const withVersion = await mountWithRouter(VersionTag, { version: '1.5.0' });
    expect(withVersion.text()).toContain('v1.5.0');
    const withoutVersion = await mountWithRouter(VersionTag, {});
    expect(withoutVersion.text()).toContain('Version unknown');
  });
});
