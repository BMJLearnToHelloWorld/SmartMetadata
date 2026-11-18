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
import SearchSettingsView from './SearchSettingsView.vue';

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
        path: '/entity/:entityType',
        name: 'settings-preferences-search-entity',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push('/');
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
            enableAccessControl: 'Enable access control',
            enableColumnIndexing: 'Enable column indexing',
            maxAggregateSize: 'Max aggregate size',
            maxResultHits: 'Max result hits',
            maxAnalyzedOffset: 'Max analyzed offset',
            save: 'Save',
            entityTypes: 'Entity types',
            editEntity: 'Edit',
          },
        },
      },
    },
  });
  return mount(SearchSettingsView, {
    global: {
      plugins: [i18n, Antd, router],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="search-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        RouterLink: true,
      },
    },
  });
}

describe('SearchSettingsView save preservation', () => {
  beforeEach(() => {
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
