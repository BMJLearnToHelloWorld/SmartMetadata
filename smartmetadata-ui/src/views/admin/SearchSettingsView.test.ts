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
import { Modal, Slider, message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import SearchSettingsView from './SearchSettingsView.vue';

vi.mock('@/api/system', async () => {
  const actual = await vi.importActual<typeof import('@/api/system')>('@/api/system');
  return {
    ...actual,
    getTypedSetting: vi.fn(),
    restoreSettingsConfig: vi.fn(),
    updateSetting: vi.fn(),
  };
});

vi.mock('@/api/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/search')>()),
  searchAssets: vi.fn(),
}));

import { searchAssets } from '@/api/search';
import { getTypedSetting, restoreSettingsConfig, settingAsSearch, updateSetting } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import type { LoginUser } from '@/types/api';

const getMock = getTypedSetting as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateSetting as unknown as ReturnType<typeof vi.fn>;
const restoreMock = restoreSettingsConfig as unknown as ReturnType<typeof vi.fn>;
const searchMock = searchAssets as unknown as ReturnType<typeof vi.fn>;

// Raw server shape: a stored range condition, the two top-level keys the
// old code dropped, and no enableColumnIndexing (absent stays absent).
const rawFixture = {
  globalSettings: {
    enableAccessControl: true,
    maxAggregateSize: 10000,
    maxResultHits: 10,
    maxAnalyzedOffset: 100000,
    highlightFields: ['name'],
    keywordWeight: 0.7,
    semanticWeight: 0.3,
    termBoosts: [],
    fieldValueBoosts: [{ field: 'usage', factor: 2, condition: { range: { gte: 10, lt: 100 } } }],
    aggregations: [{ name: 'byTier', type: 'terms', field: 'tier', script: 'doc.tier' }],
  },
  assetTypeConfigurations: [],
  defaultConfiguration: {
    assetType: 'default',
    ranking: { stages: [{ name: 'exact', fields: ['name.keyword'] }] },
  },
  allowedFields: [{ entityType: 'table', fields: [{ name: 'name' }] }],
  allowedFieldValueBoosts: [{ entityType: 'default', fields: [{ name: 'usage' }] }],
  nlqConfiguration: { promptTemplate: 'Answer: {question}' },
};

const ENTITY_LABEL_KEYS = [
  'entityTable',
  'entityDashboard',
  'entityPipeline',
  'entityTopic',
  'entityGlossaryTerm',
  'entityApiEndpoint',
  'entityDashboardDataModel',
  'entityStoredProcedure',
  'entityContainer',
  'entityMlModel',
  'entityDataProduct',
  'entityQuery',
  'entityTag',
  'entityDatabase',
  'entityDatabaseSchema',
  'entityDomain',
  'entityMetric',
  'entitySearchIndex',
  'entityDirectory',
  'entityFile',
  'entitySpreadsheet',
  'entityWorksheet',
  'entityColumn',
];

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

function mountView(router: Router, pinia: Pinia) {
  const entityMessages = Object.fromEntries(ENTITY_LABEL_KEYS.map((key) => [key, key]));
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
            enableRolesPoliciesInSearch: 'Enable roles and policies in search',
            enableColumnIndexing: 'Enable column indexing',
            columnIndexingEnabledReindex: 'Column indexing enabled, reindex required',
            columnIndexing: 'Column Indexing',
            disableColumnIndexingConfirmation: 'Disable column indexing?',
            disable: 'Disable',
            maxAggregateSize: 'Max aggregate size',
            maxResultHits: 'Max result hits',
            maxAnalyzedOffset: 'Max analyzed offset',
            value: 'Value',
            cancel: 'Cancel',
            save: 'Save',
            add: 'Add',
            editField: 'Edit {field}',
            reset: 'Reset',
            resetSearchSettingsConfirmation: 'Reset search settings?',
            termBoost: 'Term Boost',
            fieldValueBoost: 'Field Value Boost',
            searchSettingsForEntity: 'Search settings for {entity}',
            selectTag: 'Select a tag',
            boost: 'Boost',
            delete: 'Delete',
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
            ...entityMessages,
          },
        },
      },
    },
  });
  return mount(SearchSettingsView, {
    attachTo: document.body,
    global: {
      plugins: [i18n, router, pinia],
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

function loadFixture(overrides: Record<string, unknown> = {}): void {
  const raw = {
    ...rawFixture,
    globalSettings: { ...rawFixture.globalSettings, ...overrides },
  };
  getMock.mockImplementation(async (_name: string, mapper: (value: unknown) => unknown) =>
    mapper(raw),
  );
}

function clickModalOk(confirmationText: string): void {
  const modals = [...document.body.querySelectorAll('.ant-modal')];
  const modal = modals.find((item) => item.textContent?.includes(confirmationText)) as HTMLElement;
  const ok = modal.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement;
  ok.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  getMock.mockReset();
  updateMock.mockReset();
  restoreMock.mockReset();
  searchMock.mockReset();
  loadFixture();
  updateMock.mockImplementation(async (_type: string, payload: unknown) => ({
    configType: 'searchSettings',
    configValue: payload,
  }));
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

describe('SearchSettingsView immediate saves', () => {
  it('saves the access-control toggle immediately and preserves everything else', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const successSpy = vi.spyOn(message, 'success');
    await wrapper.find('[data-testid="enable-roles-polices-in-search-switch"]').trigger('click');
    await flushPromises();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][1];
    const expected = settingAsSearch(rawFixture);
    expected.globalSettings = { ...expected.globalSettings, enableAccessControl: false };
    expect(payload).toEqual(expected);
    const serialized = JSON.parse(JSON.stringify(payload)) as typeof rawFixture;
    expect(serialized.globalSettings.fieldValueBoosts[0].condition).toEqual({
      range: { gte: 10, lt: 100 },
    });
    expect(serialized.allowedFieldValueBoosts).toEqual(rawFixture.allowedFieldValueBoosts);
    expect(serialized.nlqConfiguration).toEqual(rawFixture.nlqConfiguration);
    expect(serialized.globalSettings).not.toHaveProperty('enableColumnIndexing');
    expect(successSpy).toHaveBeenCalledWith('saved');
    successSpy.mockRestore();
  });

  it('treats a failed toggle save as a toast only and rolls the display back', async () => {
    updateMock.mockRejectedValue(new Error('save down'));
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const errorSpy = vi.spyOn(message, 'error');
    const toggle = wrapper.find('[data-testid="enable-roles-polices-in-search-switch"]');
    expect(toggle.classes()).toContain('ant-switch-checked');
    await toggle.trigger('click');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('save down');
    expect(
      wrapper.find('[data-testid="enable-roles-polices-in-search-switch"]').classes(),
    ).toContain('ant-switch-checked');
    errorSpy.mockRestore();
  });

  it('asks for confirmation before disabling column indexing', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    // Absent enableColumnIndexing reads as enabled.
    expect(
      wrapper.find('[data-testid="enable-column-indexing-switch"]').classes(),
    ).toContain('ant-switch-checked');
    await wrapper.find('[data-testid="enable-column-indexing-switch"]').trigger('click');
    await flushPromises();
    expect(updateMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Disable column indexing?');
    clickModalOk("Disable column indexing?");
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].globalSettings.enableColumnIndexing).toBe(false);
  });

  it('enables column indexing immediately with the reindex message', async () => {
    loadFixture({ enableColumnIndexing: false });
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const successSpy = vi.spyOn(message, 'success');
    await wrapper.find('[data-testid="enable-column-indexing-switch"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].globalSettings.enableColumnIndexing).toBe(true);
    expect(successSpy).toHaveBeenCalledWith('Column indexing enabled, reindex required');
    successSpy.mockRestore();
  });

  it('clamps numeric edits before saving', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await wrapper
      .find('[data-testid="global-setting-edit-icon-Max aggregate size"]')
      .trigger('click');
    const input = wrapper.find('[data-testid="value-input"]');
    await input.setValue('50');
    await wrapper.find('[data-testid="inline-save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].globalSettings.maxAggregateSize).toBe(100);
  });

  it('renders defaults and toasts when the load fails', async () => {
    getMock.mockRejectedValue(new Error('load down'));
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    const errorSpy = vi.spyOn(message, 'error');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('load down');
    expect(
      wrapper.find('[data-testid="enable-roles-polices-in-search-switch"]').classes(),
    ).not.toContain('ant-switch-checked');
    expect(wrapper.find('[data-testid="global-setting-value-Max result hits"]').text()).toBe('0');
    expect(wrapper.findAll('[data-testid^="preferences.searchSettings."]')).toHaveLength(23);
    errorSpy.mockRestore();
  });
});

describe('SearchSettingsView boosts', () => {
  it('gates the term-boost save on changes and saves the edited list', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const saveBtn = wrapper.find('[data-testid="term-boost-save-btn"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="term-boost-add-btn"]').trigger('click');
    await flushPromises();
    // The panel body mounts only once expanded.
    await wrapper.findAll('.ant-collapse-header')[0].trigger('click');
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
    // A zero boost is not a complete boost: the save stays gated.
    expect(wrapper.find('[data-testid="term-boost-save-btn"]').attributes('disabled')).toBeDefined();
    const card = wrapper.find('[data-testid="term-boost-PII.Sensitive"]');
    expect(card.exists()).toBe(true);
    await card.findComponent(Slider).vm.$emit('update:value', 3);
    await flushPromises();
    expect(
      wrapper.find('[data-testid="term-boost-save-btn"]').attributes('disabled'),
    ).toBeUndefined();
    await wrapper.find('[data-testid="term-boost-save-btn"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].globalSettings.termBoosts).toEqual([
      { field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 3 },
    ]);
    expect(wrapper.find('[data-testid="term-boost-save-btn"]').attributes('disabled')).toBeDefined();
  });

  it('adds a field value boost through the dialog and saves immediately', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await wrapper.find('[data-testid="add-field-value-boost-btn"]').trigger('click');
    await flushPromises();
    const selector = document.body.querySelector(
      '[data-testid="field-select"] .ant-select-selector',
    ) as HTMLElement;
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    const option = [...document.body.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === 'usage',
    ) as HTMLElement;
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const save = document.body.querySelector(
      '[data-testid="save-field-value-boost"]',
    ) as HTMLElement;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    // The dialog replaces the stored boost for the same field.
    expect(updateMock.mock.calls[0][1].globalSettings.fieldValueBoosts).toEqual([
      { field: 'usage', factor: 0, modifier: 'none', missing: 0, condition: { range: {} } },
    ]);
  });

  it('deletes a term boost with an immediate save', async () => {
    loadFixture({
      termBoosts: [{ field: 'tags.tagFQN', value: 'PII.Sensitive', boost: 2 }],
    });
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await wrapper.findAll('.ant-collapse-header')[0].trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="delete-term-boost"]').trigger('click');
    await flushPromises();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].globalSettings.termBoosts).toEqual([]);
  });
});

describe('SearchSettingsView cards and reset', () => {
  it('renders the 23 registry cards from the table, not the server config', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    const cards = wrapper.findAll('[data-testid^="preferences.searchSettings."]');
    expect(cards).toHaveLength(23);
    expect(wrapper.find('[data-testid="search-save-global"]').exists()).toBe(false);
    await wrapper.find('[data-testid="preferences.searchSettings.tables"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings-preferences-search-entity');
    expect(router.currentRoute.value.params).toEqual({ entityType: 'tables' });
  });

  it('hides the reset button from non-admin users', async () => {
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    expect(wrapper.find('[data-testid="reset-search-settings-btn"]').exists()).toBe(false);
  });

  it('resets with confirmation, refetches, and closes the modal on failure', async () => {
    useAuthStore().user = { name: 'admin', isAdmin: true } as LoginUser;
    const router = await makeRouter();
    const wrapper = mountView(router, pinia);
    await flushPromises();
    await wrapper.find('[data-testid="reset-search-settings-btn"]').trigger('click');
    await flushPromises();
    expect(restoreMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Reset search settings?');
    clickModalOk('Reset search settings?');
    await flushPromises();
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledTimes(2);

    restoreMock.mockRejectedValue(new Error('reset down'));
    const errorSpy = vi.spyOn(message, 'error');
    await wrapper.find('[data-testid="reset-search-settings-btn"]').trigger('click');
    await flushPromises();
    clickModalOk('Reset search settings?');
    await flushPromises();
    expect(errorSpy).toHaveBeenCalledWith('reset down');
    const resetModal = wrapper
      .findAllComponents(Modal)
      .find((modal) => modal.props('title') === 'Reset');
    expect(resetModal?.props('open')).toBe(false);
    errorSpy.mockRestore();
  });
});
