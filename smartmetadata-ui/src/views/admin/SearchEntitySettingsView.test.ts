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
import { Slider, message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import SearchEntitySettingsView from './SearchEntitySettingsView.vue';

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    restoreSettingsConfig: vi.fn(),
    updateSetting: vi.fn(),
  };
});

vi.mock('@/api/customProperties', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/customProperties')>()),
  listCustomProperties: vi.fn(),
}));

vi.mock('@/api/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/search')>()),
  searchAssets: vi.fn(),
  searchPreview: vi.fn(),
}));

import { listCustomProperties } from '@/api/customProperties';
import { searchAssets, searchPreview } from '@/api/search';
import {
  getEffectiveRankingConfiguration,
  getTypedSetting,
  restoreSettingsConfig,
  settingAsSearch,
  updateSetting,
} from '@/api/system';
import type { SearchSettings } from '@/types/admin';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;
const customPropsMock = listCustomProperties as unknown as ReturnType<typeof vi.fn>;
const previewMock = searchPreview as unknown as ReturnType<typeof vi.fn>;
const restoreMock = restoreSettingsConfig as unknown as ReturnType<typeof vi.fn>;
const searchMock = searchAssets as unknown as ReturnType<typeof vi.fn>;

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
    allowedFields: [
      {
        entityType: 'table',
        fields: [
          { name: 'name', description: 'The entity name', highlight: true },
          { name: 'columns.name', description: 'Column names', highlight: false },
        ],
      },
    ],
    allowedFieldValueBoosts: [
      { entityType: 'default', fields: [{ name: 'totalVotes' }, { name: 'upVotes' }] },
    ],
  };
}

async function makeRouter(param: string): Promise<Router> {
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
  await router.push(`/entity/${param}`);
  await router.isReady();
  return router;
}

function mountView(router: Router, pinia: Pinia) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        settings: {
          searchPrefs: {
            entityLead: 'Lead',
            unknownEntity: 'Unknown entity {type}',
            searchSettingsForEntity: 'Search settings for {entity}',
            entityTable: 'Tables',
            ranking: 'Ranking',
            noDataAvailable: 'No data available',
            weight: 'Weight',
            signals: 'Signals',
            rankingSignalsExplanation: 'Signals explanation',
            boostMode: 'Boost Mode',
            scoreMode: 'Score Mode',
            maxBoost: 'Max Boost',
            matchingFields: 'Matching Fields',
            add: 'Add',
            termBoost: 'Term Boost',
            fieldValueBoost: 'Field Value Boost',
            saved: 'saved',
            saveFailed: 'save fail',
            loadFailed: 'load fail',
            restored: 'restored',
            customProperty: 'Custom Property',
            custom: 'Custom',
            noDescription: 'No description',
            delete: 'Delete',
            highlightFields: 'Highlight Fields',
            fieldCannotBeHighlighted: 'This field cannot be highlighted',
            value: 'Value',
            matchType: 'Match Type',
            exactMatch: 'Exact Match',
            phraseMatch: 'Phrase Match',
            fuzzyMatch: 'Fuzzy Match',
            standardMatch: 'Standard Match',
            selectTag: 'Select a tag',
            boost: 'Boost',
            field: 'Field',
            factor: 'Factor',
            modifier: 'Modifier',
            missingValue: 'Missing value',
            greaterThan: 'Greater than',
            greaterThanOrEqualTo: 'Greater than or equal to',
            lessThan: 'Less than',
            lessThanOrEqualTo: 'Less than or equal to',
            actions: 'Actions',
            editFieldValueBoost: 'Edit Field Value Boost',
            deleteFieldValueBoost: 'Delete Field Value Boost',
            addFieldValueBoost: 'Add Field Value Boost',
            fieldRequired: 'Field is required',
            selectField: 'Select a field',
            impact: 'Impact',
            rangeCondition: 'Range condition',
            cancel: 'Cancel',
            save: 'Save',
            preview: 'Preview',
            rankingDetails: 'Ranking Details',
            restoreDefaults: 'Restore Defaults',
            searchPlaceholder: 'Search for data assets',
            score: 'SCORE',
          },
        },
        label: {
          'page-plural': 'Pages',
          previous: 'Previous',
          next: 'Next',
          page: 'Page',
          of: 'of',
        },
      },
    },
  });
  return mount(SearchEntitySettingsView, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router, pinia],
      stubs: {
        PreferencePageShell: {
          template: '<div data-testid="search-entity-settings"><slot /></div>',
          props: ['title', 'lead', 'testId', 'errorMessage', 'loading'],
        },
        RouterLink: true,
      },
    },
  });
}

function loadFixture(tableRanking: unknown): void {
  const raw = rawFixture(tableRanking);
  getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
    mapper(raw),
  );
}

type Wrapper = ReturnType<typeof mountView>;

async function openOuterPanel(wrapper: Wrapper, index: number): Promise<void> {
  const headers = wrapper.findAll(
    '.entity-search-settings__editor > .ant-collapse > .ant-collapse-item > .ant-collapse-header',
  );
  await headers[index].trigger('click');
  await flushPromises();
}

async function selectOption(
  wrapper: Wrapper,
  selectTestId: string,
  optionLabel: string,
): Promise<void> {
  const selector = wrapper.find(`[data-testid="${selectTestId}"] .ant-select-selector`);
  await selector.trigger('mousedown');
  await flushPromises();
  const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
    (item) => item.textContent === optionLabel,
  ) as HTMLElement;
  option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
}

async function saveViaPreview(wrapper: Wrapper): Promise<void> {
  await wrapper.find('[data-testid="save-btn"]').trigger('click');
  await flushPromises();
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  getMock.mockReset();
  updateMock.mockReset();
  customPropsMock.mockReset();
  previewMock.mockReset();
  restoreMock.mockReset();
  searchMock.mockReset();
  updateMock.mockImplementation(async (_type: string, payload: unknown) => ({
    configType: 'searchSettings',
    configValue: payload,
  }));
  customPropsMock.mockResolvedValue([
    { name: 'owner', displayName: 'Owner', description: 'The owner' },
  ]);
  previewMock.mockResolvedValue({ hits: [], total: 0 });
  restoreMock.mockResolvedValue(undefined);
  searchMock.mockResolvedValue({
    total: 1,
    hits: [{ fullyQualifiedName: 'PII.Sensitive' }],
    facets: [],
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SearchEntitySettingsView header and seeding', () => {
  it('renders the header, seeded field cards, and mode selects for the entity key param', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="entity-search-settings-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="heading"]').text()).toBe('Tables');
    expect(wrapper.find('[data-testid="sub-heading"]').text()).toBe('Search settings for Tables');
    await openOuterPanel(wrapper, 1);
    expect(wrapper.find('[data-testid="field-name"]').text()).toBe('name');
    expect(wrapper.text()).toContain('columns.name');
    expect(wrapper.find('[data-testid="score-mode-select"]').text()).toContain('Avg');
    expect(wrapper.find('[data-testid="boost-mode-select"]').text()).toContain('Multiply');
    expect(wrapper.find('[data-testid="search-entity-back"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="search-entity-add-field"]').exists()).toBe(false);
  });

  it('resolves the segment param to the same entity', async () => {
    loadFixture(undefined);
    const router = await makeRouter('tables');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="heading"]').text()).toBe('Tables');
    await openOuterPanel(wrapper, 1);
    expect(wrapper.find('[data-testid="field-name"]').text()).toBe('name');
  });

  it('shows the in-page error state for an unknown segment', async () => {
    loadFixture(undefined);
    const router = await makeRouter('bogus');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.text()).toContain('Unknown entity bogus');
    expect(wrapper.find('[data-testid="entity-search-settings-header"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(false);
  });
});

describe('SearchEntitySettingsView save preservation', () => {
  it('persists the derived effective ranking and preserves unedited fields', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeDefined();
    // Toggle the ranking switch twice: an edit that restores the value.
    await wrapper.find('[data-testid="ranking-enabled-switch"]').trigger('click');
    await wrapper.find('[data-testid="ranking-enabled-switch"]').trigger('click');
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined();
    await saveViaPreview(wrapper);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const loaded = settingAsSearch(rawFixture(undefined));
    const tableConfig = loaded.assetTypeConfigurations?.find((c) => c.assetType === 'table');
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(
      getEffectiveRankingConfiguration(loaded, tableConfig ?? null),
    );
    expect(payload.assetTypeConfigurations?.[0]?.searchFields).toEqual(tableConfig?.searchFields);
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
    expect(payload.assetTypeConfigurations?.[1]).toEqual(loaded.assetTypeConfigurations?.[1]);
    expect(payload.defaultConfiguration).toEqual(loaded.defaultConfiguration);
    expect(payload.allowedFields).toEqual(loaded.allowedFields);
  });

  it('keeps the load-time ranking after fields are edited', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await openOuterPanel(wrapper, 1);
    await wrapper.find('[data-testid="add-field-btn"]').trigger('click');
    await flushPromises();
    const item = [...document.body.querySelectorAll('.ant-dropdown-menu-item')].find(
      (el) => el.textContent === 'extension.owner',
    ) as HTMLElement;
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await saveViaPreview(wrapper);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const loaded = settingAsSearch(rawFixture(undefined));
    const tableConfig = loaded.assetTypeConfigurations?.find((c) => c.assetType === 'table');
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(
      getEffectiveRankingConfiguration(loaded, tableConfig ?? null),
    );
    expect(payload.assetTypeConfigurations?.[0]?.searchFields).toHaveLength(3);
    expect(payload.assetTypeConfigurations?.[0]?.searchFields?.[0]).toEqual({
      field: 'extension.owner',
      boost: 0,
    });
  });

  it('writes back an entity-owned ranking untouched', async () => {
    const ownRanking = { stages: [{ name: 'exact', fields: ['name.keyword'], weight: 9 }] };
    loadFixture(ownRanking);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    // Edit a mode twice: the ranking object itself is never touched.
    await openOuterPanel(wrapper, 1);
    await selectOption(wrapper, 'score-mode-select', 'Max');
    await selectOption(wrapper, 'score-mode-select', 'Avg');
    await saveViaPreview(wrapper);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    expect(payload.assetTypeConfigurations?.[0]?.ranking).toEqual(ownRanking);
  });

  it('renders no field cards and no-ops the save when the entity has no configuration', async () => {
    const raw = rawFixture(undefined);
    const configs = raw.assetTypeConfigurations as unknown[];
    raw.assetTypeConfigurations = [configs[1]];
    getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
      mapper(raw),
    );
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.text()).toContain('No data available');
    expect(wrapper.find('[data-testid="field-name"]').exists()).toBe(false);
    await openOuterPanel(wrapper, 1);
    await selectOption(wrapper, 'score-mode-select', 'Max');
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined();
    await saveViaPreview(wrapper);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('SearchEntitySettingsView ranking editing', () => {
  const richRanking = {
    algorithm: 'hybrid',
    enabled: true,
    stages: [
      {
        name: 'exact_match',
        fields: ['name.keyword'],
        weight: 10,
        purpose: 'Exact matches first',
        matchType: 'exact',
        minimumShouldMatch: '75%',
      },
    ],
    signals: {
      fields: ['usage'],
      purpose: 'Usage signals',
      boostMode: 'multiply',
      scoreMode: 'avg',
      maxBoost: 2,
    },
  };

  it('edits stage weights and omits a cleared weight', async () => {
    loadFixture(richRanking);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="ranking-stage-exact_match"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Exact (75%)');
    expect(wrapper.text()).toContain('Exact matches first');
    const stageInput = wrapper.find(
      '[data-testid="ranking-stage-exact_match"] .ant-input-number-input',
    );
    await stageInput.setValue('20');
    await saveViaPreview(wrapper);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const stages = payload.assetTypeConfigurations?.[0]?.ranking?.stages as unknown[];
    expect(stages[0]).toMatchObject({ name: 'exact_match', weight: 20, matchType: 'exact' });

    await stageInput.setValue('');
    await saveViaPreview(wrapper);
    const cleared = updateMock.mock.calls[1][1] as SearchSettings;
    const clearedStages = cleared.assetTypeConfigurations?.[0]?.ranking?.stages as Record<
      string,
      unknown
    >[];
    expect(clearedStages[0]).not.toHaveProperty('weight');
    expect(clearedStages[0]).toHaveProperty('matchType', 'exact');
  });

  it('edits signals modes and omits a cleared maxBoost', async () => {
    loadFixture(richRanking);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="ranking-signals"]').exists()).toBe(true);
    const signalsCard = wrapper.find('[data-testid="ranking-signals"]');
    const selects = signalsCard.findAll('.ant-select-selector');
    await selects[0].trigger('mousedown');
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === 'Sum',
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const maxBoostInput = signalsCard.find('.ant-input-number-input');
    await maxBoostInput.setValue('');
    await saveViaPreview(wrapper);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    const signals = payload.assetTypeConfigurations?.[0]?.ranking?.signals as Record<
      string,
      unknown
    >;
    expect(signals.boostMode).toBe('sum');
    expect(signals.scoreMode).toBe('avg');
    expect(signals).not.toHaveProperty('maxBoost');
    expect(signals.fields).toEqual(['usage']);
  });
});

describe('SearchEntitySettingsView local-only edits and restore', () => {
  it('keeps term-boost edits local until the preview save', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await openOuterPanel(wrapper, 2);
    await wrapper.find('[data-testid="add-term-boost-btn"]').trigger('click');
    await flushPromises();
    const selector = wrapper.find(
      '[data-testid="term-boost-new"] [data-testid="term-boost-select"] .ant-select-selector',
    );
    await selector.trigger('mousedown');
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === 'PII.Sensitive',
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await wrapper
      .find('[data-testid="term-boost-PII.Sensitive"]')
      .findComponent(Slider)
      .vm.$emit('update:value', 4);
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    await saveViaPreview(wrapper);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    expect(payload.assetTypeConfigurations?.[0]?.termBoosts).toEqual([
      { field: 'name', value: 'tier', boost: 2 },
      { field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 4 },
    ]);
  });

  it('keeps field-value-boost edits local until the preview save', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await openOuterPanel(wrapper, 3);
    await wrapper.find('[data-testid="add-field-value-boost-btn"]').trigger('click');
    await flushPromises();
    const selector = document.body.querySelector(
      '[data-testid="field-select"] .ant-select-selector',
    ) as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === 'totalVotes',
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const save = document.body.querySelector(
      '[data-testid="save-field-value-boost"]',
    ) as HTMLElement;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    await saveViaPreview(wrapper);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    expect(payload.assetTypeConfigurations?.[0]?.fieldValueBoosts).toEqual([
      { field: 'usage', factor: 2 },
      { field: 'totalVotes', factor: 0, modifier: 'none', missing: 0, condition: { range: {} } },
    ]);
  });

  it('toggles highlight flags through the field card', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await openOuterPanel(wrapper, 1);
    const headers = wrapper.findAll('.ant-collapse-header');
    const columnsHeader = headers.find((header) => header.text().includes('columns.name'));
    await columnsHeader!.trigger('click');
    await flushPromises();
    // columns.name cannot be highlighted: the switch is disabled.
    const switches = wrapper.findAll('[data-testid="highlight-field-switch"]');
    expect(switches).toHaveLength(1);
    expect(switches[0].classes()).toContain('ant-switch-disabled');
    const nameHeader = headers.find((header) => header.text().includes('name'));
    await nameHeader!.trigger('click');
    await flushPromises();
    const nameSwitch = wrapper
      .findAll('[data-testid="highlight-field-switch"]')
      .find((toggle) => !toggle.classes().includes('ant-switch-disabled'));
    await nameSwitch!.trigger('click');
    await saveViaPreview(wrapper);
    const payload = updateMock.mock.calls[0][1] as SearchSettings;
    expect(payload.assetTypeConfigurations?.[0]?.highlightFields).toEqual([]);
  });

  it('restores defaults without confirmation and re-seeds the edit state', async () => {
    loadFixture(undefined);
    const restored = rawFixture(undefined);
    const restoredConfigs = restored.assetTypeConfigurations as Record<string, unknown>[];
    restoredConfigs[0].searchFields = [
      { field: 'name', boost: 5, matchType: 'exact' },
    ];
    restoreMock.mockResolvedValue(restored);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const successSpy = vi.spyOn(message, 'success');
    await wrapper.find('[data-testid="restore-defaults-btn"]').trigger('click');
    await flushPromises();
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith('restored');
    await openOuterPanel(wrapper, 1);
    const names = wrapper.findAll('[data-testid="field-name"]').map((el) => el.text());
    expect(names).toEqual(['name']);
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeDefined();
    successSpy.mockRestore();
  });

  it('keeps the edit state when restore fails', async () => {
    loadFixture(undefined);
    restoreMock.mockRejectedValue(new Error('restore down'));
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await wrapper.find('[data-testid="ranking-enabled-switch"]').trigger('click');
    const errorSpy = vi.spyOn(message, 'error');
    await wrapper.find('[data-testid="restore-defaults-btn"]').trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('restore down');
    expect(wrapper.find('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined();
    errorSpy.mockRestore();
  });

  it('runs the preview against the edit state, not the loaded config', async () => {
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const initialCalls = previewMock.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);
    await openOuterPanel(wrapper, 1);
    await selectOption(wrapper, 'score-mode-select', 'Max');
    await flushPromises();
    const last = previewMock.mock.calls[previewMock.mock.calls.length - 1][0];
    const tableConfig = last.searchSettings.assetTypeConfigurations.find(
      (item: { assetType: string }) => item.assetType === 'table',
    );
    expect(tableConfig.scoreMode).toBe('max');
  });

  it('carries on with allowed fields only when custom properties fail', async () => {
    customPropsMock.mockRejectedValue(new Error('props down'));
    loadFixture(undefined);
    const router = await makeRouter('table');
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await openOuterPanel(wrapper, 1);
    await wrapper.find('[data-testid="add-field-btn"]').trigger('click');
    await flushPromises();
    const items = [...document.body.querySelectorAll('.ant-dropdown-menu-item')];
    expect(items).toHaveLength(0);
    expect(wrapper.find('[data-testid="field-name"]').exists()).toBe(true);
  });
});
