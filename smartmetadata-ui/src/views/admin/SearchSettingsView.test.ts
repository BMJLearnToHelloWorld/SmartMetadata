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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import SearchSettingsView from './SearchSettingsView.vue';

const permissionFixture = {
  isAdminUser: true,
  authProvider: 'basic' as string | undefined,
};

vi.mock('@/stores/permissions', () => ({
  usePermissionStore: () => ({
    get isAdminUser() {
      return permissionFixture.isAdminUser;
    },
    getResourcePermission: async () => ({}),
  }),
}));

vi.mock('@/settings/permissionRules', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('@/settings/permissionRules');
  return {
    ...original,
    loadAuthProvider: async () => permissionFixture.authProvider,
  };
});

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    updateSetting: vi.fn(),
  };
});

import { getTypedSetting, settingAsSearch, updateSetting } from '@/api/system';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

// Raw server shape, as the mapper receives it: a stored range condition,
// the two top-level keys the old code dropped, and no enableColumnIndexing.
const rawFixture = {
  globalSettings: {
    enableAccessControl: true,
    maxAggregateSize: 10000,
    maxResultHits: 10,
    maxAnalyzedOffset: 100000,
    highlightFields: ['name'],
    keywordWeight: 0.7,
    semanticWeight: 0.3,
    termBoosts: [{ field: 'name', value: 'tier', boost: 2 }],
    fieldValueBoosts: [{ field: 'usage', factor: 2, condition: { range: { gte: 10, lt: 100 } } }],
    aggregations: [{ name: 'byTier', type: 'terms', field: 'tier', script: 'doc.tier' }],
  },
  assetTypeConfigurations: [
    {
      assetType: 'table',
      searchFields: [{ field: 'name', boost: 10, matchType: 'exact' }],
      highlightFields: ['name'],
      scoreMode: 'avg',
      boostMode: 'multiply',
      matchTypeBoostMultipliers: {
        exactMatchMultiplier: 2,
        phraseMatchMultiplier: 1.5,
        fuzzyMatchMultiplier: 1,
      },
    },
  ],
  defaultConfiguration: {
    assetType: 'default',
    ranking: { stages: [{ name: 'exact', fields: ['name.keyword'] }] },
  },
  allowedFields: [{ entityType: 'table', fields: [{ name: 'name' }] }],
  allowedFieldValueBoosts: [{ entityType: 'default', fields: [{ name: 'usage' }] }],
  nlqConfiguration: { promptTemplate: 'Answer: {question}' },
};

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'settings-preferences-search', component: { template: '<div />' } },
      {
        path: '/settings/preferences/search-settings/:tab',
        name: 'settings-preferences-search-entity',
        component: { template: '<div />' },
      },
      { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
      {
        path: '/settings/:category',
        name: 'settings-category',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  return router;
}

function mountView(router: Router, stubRouterLink = true) {
  return mount(SearchSettingsView, {
    global: {
      plugins: [createTestI18n(), Antd, router],
      stubs: {
        ...(stubRouterLink ? { RouterLink: true } : {}),
      },
    },
  });
}

describe('SearchSettingsView save preservation', () => {
  beforeEach(() => {
    permissionFixture.isAdminUser = true;
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
      mapper(rawFixture),
    );
    updateMock.mockResolvedValue({ configType: 'searchSettings', configValue: {} });
  });

  it('saves the full loaded configuration, including condition, boosts and NLQ', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.find('[data-testid="search-save-global"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1];
    expect(payload).toEqual(settingAsSearch(rawFixture));
    const serialized = JSON.parse(JSON.stringify(payload)) as typeof rawFixture;
    expect(serialized.globalSettings.fieldValueBoosts[0].condition).toEqual({
      range: { gte: 10, lt: 100 },
    });
    expect(serialized.allowedFieldValueBoosts).toEqual(rawFixture.allowedFieldValueBoosts);
    expect(serialized.nlqConfiguration).toEqual(rawFixture.nlqConfiguration);
    // Absent stays absent: the old Boolean() coercion wrote false here.
    expect(serialized.globalSettings).not.toHaveProperty('enableColumnIndexing');
  });

  it('changes only the toggled switch and keeps everything else', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.find('[data-testid="search-column-indexing"]').trigger('click');
    await wrapper.find('[data-testid="search-save-global"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const expected = settingAsSearch(rawFixture);
    expected.globalSettings = { ...expected.globalSettings, enableColumnIndexing: true };
    expect(updateMock.mock.calls[0][1]).toEqual(expected);
  });
});

describe('SearchSettingsView breadcrumb and entity navigation', () => {
  beforeEach(() => {
    permissionFixture.isAdminUser = true;
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
      mapper(rawFixture),
    );
    updateMock.mockResolvedValue({ configType: 'searchSettings', configValue: {} });
  });

  it('renders Settings > Preferences > Search above the header', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, false);
    await flushPromises();
    const text = wrapper.find('[data-testid="sm-breadcrumb"]').text();
    expect(text).toContain('Settings');
    expect(text).toContain('Preferences');
    expect(text).toContain('Search');
    expect(text.indexOf('Settings')).toBeLessThan(text.indexOf('Preferences'));
    expect(text.indexOf('Preferences')).toBeLessThan(text.indexOf('Search'));
  });

  it('renders the 23 registry entity cards sorted by rendered title', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.vm.$nextTick();
    const cards = wrapper.find('[data-testid="search-entity-cards"]');
    const titles = cards
      .findAll('.setting-item-card__title')
      .map((node) => node.text());
    expect(titles).toHaveLength(23);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    // The server payload lists one asset type only; the cards do not
    // come from it.
    expect(wrapper.find('[data-testid="preferences.search-settings.tables"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preferences.search-settings.column"]').exists()).toBe(true);
  });

  it('renders the registry header above the global toggles', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    const heading = wrapper.find('[data-testid="search-settings-heading"]');
    expect(heading.text()).toBe('Search');
    expect(wrapper.text()).toContain(
      'Ability to configure the search settings to suit your needs.',
    );
  });

  it('navigates an entity card to the :tab segment via three-segment dispatch', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="preferences.search-settings.tables"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-preferences-search-entity');
    expect(router.currentRoute.value.params.tab).toBe('tables');
  });

  it('shows no entity cards to a non-admin (registry ADMIN rule)', async () => {
    permissionFixture.isAdminUser = false;
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(
      wrapper.find('[data-testid="search-entity-cards"]').findAll('.setting-item-card__title'),
    ).toHaveLength(0);
  });
});
