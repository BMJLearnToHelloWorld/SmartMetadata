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
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import SearchEntitySettingsView from './SearchEntitySettingsView.vue';

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    updateSetting: vi.fn(),
  };
});

import {
  getEffectiveRankingConfiguration,
  getTypedSetting,
  settingAsSearch,
  updateSetting,
} from '@/api/system';
import type { SearchSettings } from '@/types/admin';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;

const defaultRanking = {
  algorithm: 'default',
  enabled: true,
  signals: { fields: ['usage'] },
  stages: [
    { name: 'exact_match', fields: ['fallback.exact'], weight: 10 },
    { name: 'semantic', fields: ['fallback.semantic'], weight: 1 },
  ],
  stopWords: ['the'],
  stopWordsByLanguage: { en: ['the'] },
};

function rawFixture(tableRanking: unknown): Record<string, unknown> {
  const table: Record<string, unknown> = {
    assetType: 'table',
    searchFields: [
      { field: 'name', boost: 10, matchType: 'exact' },
      { field: 'columns.name', boost: 1, matchType: 'standard' },
    ],
    highlightFields: ['name'],
    scoreMode: 'avg',
    boostMode: 'multiply',
    termBoosts: [{ field: 'name', value: 'tier', boost: 2 }],
    fieldValueBoosts: [{ field: 'usage', factor: 2 }],
    aggregations: [{ name: 'byTier', type: 'terms', field: 'tier', script: 'doc.tier' }],
    additionalSettings: { customFlag: true },
    matchTypeBoostMultipliers: {
      exactMatchMultiplier: 2,
      phraseMatchMultiplier: 1.5,
      fuzzyMatchMultiplier: 1,
    },
  };
  if (tableRanking !== undefined) {
    table.ranking = tableRanking;
  }
  return {
    globalSettings: { enableAccessControl: true },
    assetTypeConfigurations: [
      table,
      {
        assetType: 'dashboard',
        searchFields: [{ field: 'name', boost: 5, matchType: 'exact' }],
        ranking: { stages: [{ name: 'exact', fields: ['name.keyword'] }] },
      },
    ],
    defaultConfiguration: { assetType: 'default', ranking: defaultRanking },
    allowedFields: [{ entityType: 'table', fields: [{ name: 'name' }] }],
  };
}

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'settings-preferences-search', component: { template: '<div />' } },
      {
        path: '/entity/:entityType',
        name: 'settings-preferences-search-entity',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push('/entity/table');
  await router.isReady();
  return router;
}

function mountView(router: Router) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            title: 'Search settings',
            lead: 'Lead',
            loadFailed: 'load fail',
            saved: 'saved',
            saveFailed: 'save fail',
            entityTitle: 'Entity {type}',
            entityLead: 'Lead',
            entityMissing: 'Missing {type}',
            back: 'Back',
            addField: 'Add field',
            save: 'Save',
            highlightFields: 'Highlight fields',
            fieldName: 'Field',
            boost: 'Boost',
            remove: 'Remove',
          },
        },
      },
    },
  });
  return mount(SearchEntitySettingsView, {
    global: {
      plugins: [i18n, Antd, router],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="search-entity-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        SmTable: { template: '<div />' },
        RouterLink: true,
      },
    },
  });
}

describe('SearchEntitySettingsView save preservation', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    updateMock.mockResolvedValue({ configType: 'searchSettings', configValue: {} });
  });

  function loadFixture(tableRanking: unknown): void {
    const raw = rawFixture(tableRanking);
    getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
      mapper(raw),
    );
  }

  it('persists the derived effective ranking for an entity without one', async () => {
    loadFixture(undefined);
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.find('[data-testid="search-entity-save"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const loaded = settingAsSearch(rawFixture(undefined));
    const tableConfig = loaded.assetTypeConfigurations?.find((c) => c.assetType === 'table');
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(
      getEffectiveRankingConfiguration(loaded, tableConfig ?? null),
    );
    expect(payload.assetTypeConfigurations?.[0]?.searchFields).toEqual(
      tableConfig?.searchFields,
    );
    expect(payload.assetTypeConfigurations?.[0]?.termBoosts).toEqual(tableConfig?.termBoosts);
    expect(payload.assetTypeConfigurations?.[0]?.fieldValueBoosts).toEqual(
      tableConfig?.fieldValueBoosts,
    );
    expect(payload.assetTypeConfigurations?.[0]?.aggregations).toEqual(tableConfig?.aggregations);
    expect(payload.assetTypeConfigurations?.[0]?.additionalSettings).toEqual(
      tableConfig?.additionalSettings,
    );
    expect(payload.assetTypeConfigurations?.[0]?.matchTypeBoostMultipliers).toEqual(
      tableConfig?.matchTypeBoostMultipliers,
    );
    expect(payload.assetTypeConfigurations?.[1]).toEqual(
      loaded.assetTypeConfigurations?.[1],
    );
    expect(payload.defaultConfiguration).toEqual(loaded.defaultConfiguration);
    expect(payload.allowedFields).toEqual(loaded.allowedFields);
  });

  it('keeps the load-time ranking after the search fields are edited', async () => {
    loadFixture(undefined);
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    // Adding a field changes the configured fields a recomputation would
    // derive from: the structural stage would gain the empty field.
    await wrapper.find('[data-testid="search-entity-add-field"]').trigger('click');
    await wrapper.find('[data-testid="search-entity-save"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const loaded = settingAsSearch(rawFixture(undefined));
    const tableConfig = loaded.assetTypeConfigurations?.find((c) => c.assetType === 'table');
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(
      getEffectiveRankingConfiguration(loaded, tableConfig ?? null),
    );
    expect(payload.assetTypeConfigurations?.[0]?.searchFields).toHaveLength(3);
    expect(payload.assetTypeConfigurations?.[0]?.searchFields?.[2]).toEqual({
      field: '',
      boost: 1,
    });
  });

  it('writes back an entity-owned ranking untouched', async () => {
    const ownRanking = { stages: [{ name: 'exact', fields: ['name.keyword'], weight: 9 }] };
    loadFixture(ownRanking);
    const router = await makeRouter();
    const wrapper = mountView(router);
    await flushPromises();
    await wrapper.find('[data-testid="search-entity-save"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(ownRanking);
  });
});
