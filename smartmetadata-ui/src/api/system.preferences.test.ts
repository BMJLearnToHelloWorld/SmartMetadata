/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntitySearchSettingsPayload,
  buildSearchSettingsPayload,
  EDITABLE_SETTING_TYPES,
  fetchSystemStatus,
  getEffectiveRankingConfiguration,
  getCustomUiThemePreference,
  getTypedSetting,
  patchAppConfiguration,
  restoreSettingsConfig,
  settingAsAppConfiguration,
  settingAsEntityRules,
  settingAsLineage,
  settingAsProfiler,
  settingAsSearch,
  settingAsUiTheme,
  testEmailConnection,
  updateSetting,
} from './system';
import type { AssetTypeConfiguration, SearchSettings } from '@/types/admin';

vi.mock('./client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from './client';

const mocked = apiRequest as unknown as ReturnType<typeof vi.fn>;

describe('preferences system API', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('exposes Apache Preference SettingsTypes as editable', () => {
    expect(EDITABLE_SETTING_TYPES.has('customUiThemePreference')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('searchSettings')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('profilerConfiguration')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('lineageSettings')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('openMetadataBaseUrlConfiguration')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('glossarySettings')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('entityRulesSettings')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('appConfiguration')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('loginConfiguration')).toBe(true);
    expect(EDITABLE_SETTING_TYPES.has('emailConfiguration')).toBe(true);
  });

  it('maps ui theme preference', () => {
    const theme = settingAsUiTheme({
      customLogoConfig: { customLogoUrlPath: '/logo.svg' },
      customTheme: { primaryColor: '#112233' },
    });
    expect(theme.customLogoConfig.customLogoUrlPath).toBe('/logo.svg');
    expect(theme.customTheme.primaryColor).toBe('#112233');
  });

  it('maps profiler metric configuration', () => {
    const cfg = settingAsProfiler({
      metricConfiguration: [{ dataType: 'INT', metrics: ['mean', 'max'], disabled: false }],
    });
    expect(cfg.metricConfiguration?.[0]?.dataType).toBe('INT');
    expect(cfg.metricConfiguration?.[0]?.metrics).toEqual(['mean', 'max']);
  });

  it('maps search settings asset types', () => {
    const cfg = settingAsSearch({
      globalSettings: { enableAccessControl: true, maxResultHits: 50 },
      assetTypeConfigurations: [{ assetType: 'table', searchFields: [{ field: 'name', boost: 2 }] }],
    });
    expect(cfg.globalSettings?.enableAccessControl).toBe(true);
    expect(cfg.assetTypeConfigurations?.[0]?.assetType).toBe('table');
    expect(cfg.assetTypeConfigurations?.[0]?.searchFields?.[0]?.field).toBe('name');
  });

  it('maps lineage / entity rules / app configuration', () => {
    expect(settingAsLineage({ upstreamDepth: 3, lineageLayer: 'EntityLineage' }).upstreamDepth).toBe(3);
    expect(
      settingAsEntityRules({ entitySemantics: [{ name: 'r1', enabled: true }] }).entitySemantics[0].name,
    ).toBe('r1');
    expect(settingAsAppConfiguration({ defaultAppMode: 'ai', defaultTimeFormat: '24h' })).toEqual({
      defaultAppMode: 'ai',
      defaultColumnOrder: null,
      defaultTimeFormat: '24h',
    });
  });

  it('fetchSystemStatus maps step validations', async () => {
    mocked.mockResolvedValueOnce({
      database: { passed: true, message: 'ok' },
      searchInstance: { passed: false, message: 'down' },
    });
    const status = await fetchSystemStatus();
    expect(status.database?.passed).toBe(true);
    expect(status.searchInstance?.passed).toBe(false);
    expect(mocked).toHaveBeenCalledWith('/v1/system/status');
  });

  it('fetchSystemStatus preserves unknown response keys', async () => {
    mocked.mockResolvedValueOnce({
      database: { passed: true, message: 'ok' },
      futureCheck: { passed: true, description: 'Future check', message: 'ok' },
      emptyCheck: null,
    });
    const status = await fetchSystemStatus();
    expect(status.futureCheck).toEqual({
      description: 'Future check',
      passed: true,
      message: 'ok',
    });
    expect(status.emptyCheck).toBeUndefined();
  });

  it('getTypedSetting + updateSetting round-trip shape', async () => {
    mocked.mockResolvedValueOnce({
      configType: 'customUiThemePreference',
      configValue: { customLogoConfig: {}, customTheme: { primaryColor: '#abc' } },
    });
    const theme = await getTypedSetting('customUiThemePreference', settingAsUiTheme);
    expect(theme.customTheme.primaryColor).toBe('#abc');

    mocked.mockResolvedValueOnce({
      config_type: 'customUiThemePreference',
      config_value: { customLogoConfig: {}, customTheme: { primaryColor: '#def' } },
    });
    const updated = await updateSetting('customUiThemePreference', {
      customLogoConfig: {},
      customTheme: { primaryColor: '#def' },
    });
    expect(updated.configType).toBe('customUiThemePreference');
    expect(mocked).toHaveBeenLastCalledWith('/v1/system/settings', {
      method: 'PUT',
      json: {
        config_type: 'customUiThemePreference',
        config_value: { customLogoConfig: {}, customTheme: { primaryColor: '#def' } },
      },
    });
  });
});

// Hand-picked from openmetadata-service/src/main/resources/json/data/settings/
// searchSettings.json (the product seed is byte-identical to pin a3012259ca):
// every key the parser must carry, including the ones the old parser dropped.
const seedShaped = {
  globalSettings: {
    enableAccessControl: true,
    enableColumnIndexing: false,
    maxAggregateSize: 10000,
    maxResultHits: 10,
    maxAnalyzedOffset: 100000,
    highlightFields: ['name', 'displayName'],
    keywordWeight: 0.7,
    semanticWeight: 0.3,
    termBoosts: [{ field: 'name', value: 'tier', boost: 2 }],
    fieldValueBoosts: [{ field: 'usage', factor: 1.5, modifier: 'ln', missing: 1 }],
    aggregations: [{ name: 'byTier', type: 'terms', field: 'tier', script: 'doc.tier' }],
  },
  assetTypeConfigurations: [
    {
      assetType: 'table',
      searchFields: [
        { field: 'name', boost: 10, matchType: 'exact' },
        { field: 'displayName', boost: 5, matchType: 'phrase' },
        { field: 'description', boost: 1, matchType: 'fuzzy' },
        { field: 'columns.name', boost: 1, matchType: 'standard' },
      ],
      highlightFields: ['name'],
      scoreMode: 'avg',
      boostMode: 'multiply',
      termBoosts: [],
      fieldValueBoosts: [
        { field: 'usage', factor: 2, modifier: 'ln1p', missing: 0 },
        { field: 'tier', factor: 1.5 },
      ],
      aggregations: [{ name: 'byTier', type: 'terms', field: 'tier', script: 'doc.tier' }],
      matchTypeBoostMultipliers: {
        exactMatchMultiplier: 2,
        phraseMatchMultiplier: 1.5,
        fuzzyMatchMultiplier: 1,
      },
    },
    {
      assetType: 'tableColumn',
      searchFields: [{ field: 'name', boost: 5, matchType: 'exact' }],
      highlightFields: [],
      termBoosts: [],
      fieldValueBoosts: [],
      aggregations: [],
      matchTypeBoostMultipliers: {
        exactMatchMultiplier: 2,
        phraseMatchMultiplier: 1.5,
        fuzzyMatchMultiplier: 1,
      },
    },
  ],
  defaultConfiguration: {
    assetType: 'default',
    searchFields: [{ field: 'name', boost: 10, matchType: 'exact' }],
    highlightFields: ['name'],
    aggregations: [],
    matchTypeBoostMultipliers: {
      exactMatchMultiplier: 2,
      phraseMatchMultiplier: 1.5,
      fuzzyMatchMultiplier: 1,
    },
    ranking: {
      algorithm: 'default',
      enabled: true,
      disMaxTieBreaker: 0.1,
      signals: { fields: ['usage'], weights: { usage: 2 } },
      stages: [
        { name: 'exact', fields: ['name.keyword'], weight: 10 },
        { name: 'close', fields: ['name'], weight: 5 },
      ],
      stopWords: ['the'],
      stopWordsByLanguage: { en: ['the'] },
    },
  },
  allowedFields: [
    { entityType: 'table', fields: [{ name: 'name', description: 'Name', highlight: false }] },
  ],
  allowedFieldValueBoosts: [
    {
      entityType: 'default',
      fields: [{ name: 'usage' }, { name: 'tier', description: 'Tier' }],
    },
  ],
};

// Shapes the seed never has but the official UI can produce: partial range
// bounds, an empty range, a custom ranking, and unknown nested keys inside
// the pass-through subtrees.
const adminConfigured = {
  globalSettings: {
    fieldValueBoosts: [{ field: 'usage', factor: 2, condition: { range: { gte: 10, lt: 100 } } }],
    aggregations: [{ name: 'byOwner', type: 'terms', field: 'owner', script: 'doc.owner' }],
  },
  assetTypeConfigurations: [
    {
      assetType: 'dashboard',
      searchFields: [{ field: 'name', boost: 5, matchType: 'exact' }],
      fieldValueBoosts: [{ field: 'usage', factor: 1, condition: { range: {} } }],
      ranking: { customStage: true, stages: [{ name: 'custom', fields: ['name'] }] },
      additionalSettings: { customFlag: true, nested: { a: 1 } },
    },
  ],
  defaultConfiguration: { assetType: 'default' },
  nlqConfiguration: {
    promptTemplate: 'Answer: {question}',
    globalInstructions: [{ text: 'Be brief' }],
    unknownFutureKey: { deep: [1, 2] },
  },
};

describe('settingAsSearch preserves the schema in full', () => {
  it('round-trips the seed-shaped fixture without dropping a key', () => {
    expect(settingAsSearch(seedShaped)).toEqual(seedShaped);
  });

  it('round-trips administrator-configured shapes and clones pass-through subtrees', () => {
    const parsed = settingAsSearch(adminConfigured);
    expect(parsed).toEqual(adminConfigured);
    const dashboard = parsed.assetTypeConfigurations?.[0];
    const rawDashboard = adminConfigured.assetTypeConfigurations[0];
    expect(dashboard?.ranking).not.toBe(rawDashboard.ranking);
    expect(dashboard?.additionalSettings).not.toBe(rawDashboard.additionalSettings);
    expect(parsed.nlqConfiguration).not.toBe(adminConfigured.nlqConfiguration);
    // A stored empty range stays an empty range object after serialization.
    const serialized = JSON.parse(JSON.stringify(parsed)) as typeof adminConfigured;
    expect(serialized.assetTypeConfigurations[0].fieldValueBoosts[0].condition).toEqual({
      range: {},
    });
    expect(
      serialized.globalSettings.fieldValueBoosts[0].condition,
    ).toEqual({ range: { gte: 10, lt: 100 } });
  });

  it('keeps absence absent and empty arrays empty', () => {
    const parsed = settingAsSearch({});
    expect(parsed.allowedFieldValueBoosts).toBeUndefined();
    expect(parsed.nlqConfiguration).toBeUndefined();
    expect(parsed.defaultConfiguration).toBeUndefined();
    expect(parsed.allowedFields).toBeUndefined();
    expect(parsed.globalSettings?.enableAccessControl).toBeUndefined();
    expect(parsed.globalSettings?.termBoosts).toBeUndefined();
    expect(parsed.assetTypeConfigurations).toEqual([]);

    const noCondition = settingAsSearch({
      globalSettings: { fieldValueBoosts: [{ field: 'usage', factor: 2 }] },
    });
    const serialized = JSON.parse(JSON.stringify(noCondition)) as {
      globalSettings: { fieldValueBoosts: Array<Record<string, unknown>> };
    };
    expect(serialized.globalSettings.fieldValueBoosts[0]).not.toHaveProperty('condition');

    const emptyLists = settingAsSearch({
      assetTypeConfigurations: [{ assetType: 'table', termBoosts: [], fieldValueBoosts: [] }],
    });
    expect(emptyLists.assetTypeConfigurations?.[0]?.termBoosts).toEqual([]);
    expect(emptyLists.assetTypeConfigurations?.[0]?.fieldValueBoosts).toEqual([]);
  });

  it('tolerates malformed subtrees without throwing and keeps unknown enum values', () => {
    const parsed = settingAsSearch({
      assetTypeConfigurations: [
        {
          assetType: 'table',
          searchFields: [{ field: 'name', boost: 1, matchType: 'bogus' }],
          fieldValueBoosts: 'x',
          ranking: null,
        },
      ],
    });
    const table = parsed.assetTypeConfigurations?.[0];
    expect(table?.searchFields?.[0]?.matchType).toBe('bogus');
    expect(table?.fieldValueBoosts).toBeUndefined();
    expect(table?.ranking).toBeUndefined();
  });

  it('preserves every field of the real seed file', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const seedPath = join(
      here,
      '..',
      '..',
      '..',
      'openmetadata-service',
      'src',
      'main',
      'resources',
      'json',
      'data',
      'settings',
      'searchSettings.json',
    );
    if (!existsSync(seedPath)) {
      // Fallback when the checkout cannot reach the Java resources tree:
      // the hand-picked fixture above stands in for the real seed file.
      expect(settingAsSearch(seedShaped)).toEqual(seedShaped);
      return;
    }
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as unknown as SearchSettings;
    const parsed = settingAsSearch(seed);
    expect(parsed).toEqual(seed);
    expect(parsed.assetTypeConfigurations).toHaveLength(27);
    const fields = (parsed.assetTypeConfigurations ?? []).flatMap((c) => c.searchFields ?? []);
    expect(fields).toHaveLength(317);
    expect(fields.every((f) => typeof f.matchType === 'string')).toBe(true);
    expect(
      (parsed.assetTypeConfigurations ?? []).every((c) => c.matchTypeBoostMultipliers !== undefined),
    ).toBe(true);
    expect(
      ((parsed.defaultConfiguration?.ranking ?? {}) as { stages?: unknown[] }).stages,
    ).toHaveLength(8);
    expect(parsed.allowedFieldValueBoosts?.[0]?.fields).toHaveLength(5);
  });
});

describe('search settings payload builders', () => {
  it('buildSearchSettingsPayload spreads the loaded config and keeps absence absent', () => {
    const loaded = settingAsSearch(seedShaped);
    const payload = buildSearchSettingsPayload(loaded);
    expect(payload).toEqual(loaded);
    expect(payload).not.toBe(loaded);
    expect(payload.globalSettings).not.toBe(loaded.globalSettings);
    expect(payload.assetTypeConfigurations).toBe(loaded.assetTypeConfigurations);

    const withoutGlobal = buildSearchSettingsPayload({ assetTypeConfigurations: [] });
    const serialized = JSON.parse(JSON.stringify(withoutGlobal)) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('globalSettings');
  });

  it('buildEntitySearchSettingsPayload only touches the target entity draft keys', () => {
    const loaded = settingAsSearch(seedShaped);
    const table = loaded.assetTypeConfigurations?.[0];
    const draftRanking = { stages: [{ name: 'exact', fields: ['name.keyword'] }] };
    const payload = buildEntitySearchSettingsPayload(loaded, 'table', {
      searchFields: [{ field: 'name', boost: 99, matchType: 'exact' }],
      highlightFields: ['displayName'],
      scoreMode: undefined,
      boostMode: 'sum',
      ranking: draftRanking,
    });
    const nextTable = payload.assetTypeConfigurations?.[0];
    expect(nextTable).not.toBe(table);
    expect(nextTable?.searchFields).toEqual([{ field: 'name', boost: 99, matchType: 'exact' }]);
    expect(nextTable?.highlightFields).toEqual(['displayName']);
    expect(nextTable?.boostMode).toBe('sum');
    expect(nextTable?.ranking).toBe(draftRanking);
    expect(nextTable?.termBoosts).toEqual(table?.termBoosts);
    expect(nextTable?.fieldValueBoosts).toEqual(table?.fieldValueBoosts);
    expect(nextTable?.aggregations).toEqual(table?.aggregations);
    expect(nextTable?.additionalSettings).toEqual(table?.additionalSettings);
    expect(nextTable?.matchTypeBoostMultipliers).toEqual(table?.matchTypeBoostMultipliers);
    expect(payload.assetTypeConfigurations?.[1]).toBe(loaded.assetTypeConfigurations?.[1]);
    expect(payload.defaultConfiguration).toBe(loaded.defaultConfiguration);
    expect(payload.allowedFieldValueBoosts).toBe(loaded.allowedFieldValueBoosts);
    expect(payload.nlqConfiguration).toBe(loaded.nlqConfiguration);
    // An undefined draft key serializes away instead of clearing the value.
    const serialized = JSON.parse(JSON.stringify(payload)) as SearchSettings;
    expect(serialized.assetTypeConfigurations?.[0]).not.toHaveProperty('scoreMode');
  });

  it('buildEntitySearchSettingsPayload leaves the config untouched when nothing matches', () => {
    const loaded = settingAsSearch(seedShaped);
    const payload = buildEntitySearchSettingsPayload(loaded, 'nope', {
      searchFields: [],
      highlightFields: [],
    });
    expect(payload).toEqual(loaded);
    expect(payload.assetTypeConfigurations?.[0]).toBe(loaded.assetTypeConfigurations?.[0]);
  });

  it('buildEntitySearchSettingsPayload drops the ranking key when the draft has none', () => {
    const loaded = settingAsSearch(seedShaped);
    const payload = buildEntitySearchSettingsPayload(loaded, 'table', {
      searchFields: [],
      highlightFields: [],
      ranking: undefined,
    });
    const serialized = JSON.parse(JSON.stringify(payload)) as SearchSettings;
    expect(serialized.assetTypeConfigurations?.[0]).not.toHaveProperty('ranking');
  });
});

describe('getEffectiveRankingConfiguration', () => {
  const defaultRanking = {
    algorithm: 'default',
    enabled: true,
    unknownTopLevelKey: { keep: 'me' },
    signals: { fields: ['usage', 'tier'], boost: 2 },
    stages: [
      { name: 'exact_match', fields: ['fallback.exact'], weight: 10 },
      { name: 'partial_match', fields: ['fallback.partial'], weight: 8 },
      { name: 'ngram_match', fields: ['fallback.ngram'], weight: 7 },
      { name: 'close_match', fields: ['fallback.close'], weight: 6 },
      { name: 'name_match', fields: ['fallback.name'], weight: 5 },
      { name: 'description_match', fields: ['fallback.description'], weight: 4 },
      { name: 'other', fields: ['fallback.other'], weight: 1 },
    ],
    stopWords: ['the', 'a'],
    stopWordsByLanguage: { en: ['the'] },
  };
  const configuredEntity: AssetTypeConfiguration = {
    assetType: 'table',
    searchFields: [
      { field: 'displayName.keyword', boost: 10 },
      { field: 'name', boost: 5 },
      { field: 'description', boost: 1 },
      { field: 'displayName.ngram', boost: 3 },
      { field: 'name.ngram', boost: 3 },
      { field: 'fullyQualifiedName', boost: 4 },
      { field: 'columns.name', boost: 1 },
      { field: 'extension.custom', boost: 1 },
      { field: 'queryText', boost: 1 },
      { field: 'tags.name', boost: 1 },
    ],
  };
  const rankingConfig: SearchSettings = {
    defaultConfiguration: { assetType: 'default', ranking: defaultRanking },
    assetTypeConfigurations: [configuredEntity],
  };

  it('returns an entity-owned ranking untouched', () => {
    const own = { stages: [] };
    const entity: AssetTypeConfiguration = { assetType: 'table', ranking: own };
    expect(getEffectiveRankingConfiguration(rankingConfig, entity)).toBe(own);
  });

  it('returns undefined when there is no default ranking', () => {
    expect(getEffectiveRankingConfiguration(undefined, configuredEntity)).toBeUndefined();
    expect(getEffectiveRankingConfiguration({}, configuredEntity)).toBeUndefined();
    expect(
      getEffectiveRankingConfiguration({ defaultConfiguration: { assetType: 'default' } }, null),
    ).toBeUndefined();
  });

  it('derives each stage fields from the entity search fields', () => {
    const effective = getEffectiveRankingConfiguration(rankingConfig, configuredEntity) as unknown as {
      stages: Array<{ name: string; fields: string[]; weight: number }>;
      signals: unknown;
      stopWords: unknown;
      stopWordsByLanguage: unknown;
      unknownTopLevelKey: unknown;
    };
    expect(effective).not.toBe(defaultRanking);
    expect(effective.unknownTopLevelKey).toEqual({ keep: 'me' });
    expect(effective.signals).toEqual(defaultRanking.signals);
    expect(effective.signals).not.toBe(defaultRanking.signals);
    expect(effective.stopWords).toEqual(['the', 'a']);
    expect(effective.stopWords).not.toBe(defaultRanking.stopWords);
    expect(effective.stopWordsByLanguage).toEqual({ en: ['the'] });
    expect(effective.stopWordsByLanguage).not.toBe(defaultRanking.stopWordsByLanguage);
    const byName = new Map(effective.stages.map((stage) => [stage.name, stage.fields]));
    expect(byName.get('exact_match')).toEqual(['displayName.keyword', 'name.keyword', 'fullyQualifiedName']);
    expect(byName.get('partial_match')).toEqual(['displayName.ngram', 'name.ngram']);
    expect(byName.get('ngram_match')).toEqual(['displayName.ngram', 'name.ngram']);
    expect(byName.get('close_match')).toEqual(['name', 'fullyQualifiedName']);
    expect(byName.get('name_match')).toEqual(['name', 'fullyQualifiedName']);
    expect(byName.get('description_match')).toEqual(['description', 'queryText']);
    expect(byName.get('other')).toEqual(['columns.name', 'tags.name']);
    expect(effective.stages[0]).toEqual({
      name: 'exact_match',
      fields: ['displayName.keyword', 'name.keyword', 'fullyQualifiedName'],
      weight: 10,
    });
  });

  it('falls back to the stage fields when no fields are configured', () => {
    const empty: AssetTypeConfiguration = { assetType: 'table', searchFields: [] };
    const fromEmpty = getEffectiveRankingConfiguration(rankingConfig, empty) as unknown as {
      stages: Array<{ fields: string[] }>;
    };
    expect(fromEmpty.stages.map((stage) => stage.fields)).toEqual([
      ['fallback.exact'],
      ['fallback.partial'],
      ['fallback.ngram'],
      ['fallback.close'],
      ['fallback.name'],
      ['fallback.description'],
      ['fallback.other'],
    ]);
    const fromNull = getEffectiveRankingConfiguration(rankingConfig, null) as unknown as {
      stages: Array<{ fields: string[] }>;
    };
    expect(fromNull.stages.map((stage) => stage.fields)).toEqual(
      fromEmpty.stages.map((stage) => stage.fields),
    );
  });

  it('falls back to the stage fields when a derivation finds nothing', () => {
    const extensionOnly: AssetTypeConfiguration = {
      assetType: 'table',
      searchFields: [{ field: 'extension.only' }],
    };
    const effective = getEffectiveRankingConfiguration(rankingConfig, extensionOnly) as unknown as {
      stages: Array<{ name: string; fields: string[] }>;
    };
    const byName = new Map(effective.stages.map((stage) => [stage.name, stage.fields]));
    expect(byName.get('exact_match')).toEqual(['fallback.exact']);
    expect(byName.get('other')).toEqual(['fallback.other']);
  });

  it('skips search field entries without a field instead of throwing', () => {
    const sparse: AssetTypeConfiguration = {
      assetType: 'table',
      searchFields: [{ boost: 1 }, { field: 'name', boost: 1 }],
    };
    const effective = getEffectiveRankingConfiguration(rankingConfig, sparse) as unknown as {
      stages: Array<{ name: string; fields: string[] }>;
    };
    const byName = new Map(effective.stages.map((stage) => [stage.name, stage.fields]));
    expect(byName.get('exact_match')).toEqual(['name.keyword']);
    expect(byName.get('close_match')).toEqual(['name']);
  });
});

describe('settingAsLineage preserves graphPerformanceConfig', () => {
  const perf = {
    smallGraphThreshold: 5000,
    mediumGraphThreshold: 20000,
    maxInMemoryNodes: 0,
    smallGraphBatchSize: 100,
    mediumGraphBatchSize: 250,
    largeGraphBatchSize: 500,
    streamingBatchSize: 1000,
    cacheTTLSeconds: 300,
    maxCachedGraphs: 10,
    progressReportInterval: 100,
    scrollTimeoutMinutes: 5,
    enableCaching: false,
    enableProgressTracking: false,
    useScrollForLargeGraphs: true,
  };

  it('round-trips all 14 performance fields, including false and 0', () => {
    const parsed = settingAsLineage({ upstreamDepth: 2, graphPerformanceConfig: perf });
    expect(parsed.graphPerformanceConfig).toEqual(perf);
  });

  it('keeps a missing performance config missing and an empty one empty', () => {
    expect(settingAsLineage({ upstreamDepth: 2 }).graphPerformanceConfig).toBeUndefined();
    const empty = settingAsLineage({ graphPerformanceConfig: {} });
    expect(empty.graphPerformanceConfig).toEqual({});
    expect(empty.graphPerformanceConfig).toBeDefined();
  });

  it('drops only the malformed subfield and a non-object config', () => {
    const parsed = settingAsLineage({
      graphPerformanceConfig: { cacheTTLSeconds: '300', maxCachedGraphs: 10 },
    });
    expect(parsed.graphPerformanceConfig).toEqual({ maxCachedGraphs: 10 });
    const serialized = JSON.parse(JSON.stringify(parsed)) as {
      graphPerformanceConfig: Record<string, unknown>;
    };
    expect(serialized.graphPerformanceConfig).not.toHaveProperty('cacheTTLSeconds');
    expect(settingAsLineage({ graphPerformanceConfig: 'x' }).graphPerformanceConfig).toBeUndefined();
  });

  it('does not carry unknown keys into the output', () => {
    const parsed = settingAsLineage({
      graphPerformanceConfig: { enableCaching: true, bogus: 1 },
    });
    expect(parsed.graphPerformanceConfig).toEqual({ enableCaching: true });
    expect(Object.keys(parsed.graphPerformanceConfig ?? {})).not.toContain('bogus');
  });

  it('leaves the four form fields mapped as before', () => {
    const parsed = settingAsLineage({
      upstreamDepth: 1,
      downstreamDepth: 2,
      lineageLayer: 'Bogus',
      pipelineViewMode: 'Node',
    });
    expect(parsed.upstreamDepth).toBe(1);
    expect(parsed.lineageLayer).toBeUndefined();
    expect(parsed.pipelineViewMode).toBe('Node');
  });
});

describe('lineage settings API round-trip', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('carries graphPerformanceConfig through getTypedSetting and updateSetting', async () => {
    mocked.mockResolvedValueOnce({
      configType: 'lineageSettings',
      configValue: {
        upstreamDepth: 2,
        downstreamDepth: 3,
        lineageLayer: 'EntityLineage',
        pipelineViewMode: 'Node',
        graphPerformanceConfig: { enableCaching: false, cacheTTLSeconds: 300 },
      },
    });
    const loaded = await getTypedSetting('lineageSettings', settingAsLineage);
    expect(loaded.graphPerformanceConfig).toEqual({ enableCaching: false, cacheTTLSeconds: 300 });

    mocked.mockResolvedValueOnce({
      config_type: 'lineageSettings',
      config_value: { upstreamDepth: 1 },
    });
    await updateSetting('lineageSettings', { ...loaded, upstreamDepth: 1 });
    expect(mocked).toHaveBeenLastCalledWith('/v1/system/settings', {
      method: 'PUT',
      json: {
        config_type: 'lineageSettings',
        config_value: {
          upstreamDepth: 1,
          downstreamDepth: 3,
          lineageLayer: 'EntityLineage',
          pipelineViewMode: 'Node',
          graphPerformanceConfig: { enableCaching: false, cacheTTLSeconds: 300 },
        },
      },
    });
  });
});

describe('settingAsEntityRules round-trips unedited fields', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  const fullRule = {
    name: 'Single Domain',
    description: 'One domain per asset.',
    rule: '{"==":[1,1]}',
    enabled: true,
    entityType: 'table',
    ignoredEntities: ['table'],
    inherited: true,
    jsonTree: '{"type":"group","children":{}}',
    provider: 'system',
  };

  it('parses all nine schema fields', () => {
    const parsed = settingAsEntityRules({ entitySemantics: [fullRule] });
    expect(parsed.entitySemantics).toEqual([fullRule]);
  });

  it('invents no defaults for missing fields', () => {
    const parsed = settingAsEntityRules({
      entitySemantics: [{ name: 'r1', description: 'd', rule: '{}', enabled: true }],
    });
    const rule = parsed.entitySemantics[0];
    expect(rule.inherited).toBeUndefined();
    expect(rule.jsonTree).toBeUndefined();
    expect(rule.provider).toBeUndefined();
    const serialized = JSON.parse(JSON.stringify(parsed)) as {
      entitySemantics: Array<Record<string, unknown>>;
    };
    expect(serialized.entitySemantics[0]).not.toHaveProperty('inherited');
    expect(serialized.entitySemantics[0]).not.toHaveProperty('jsonTree');
    expect(serialized.entitySemantics[0]).not.toHaveProperty('provider');
  });

  it('tolerates mistyped fields without throwing', () => {
    const parsed = settingAsEntityRules({
      entitySemantics: [{ name: 'r1', inherited: 'true', jsonTree: 123, provider: 42 }],
    });
    const rule = parsed.entitySemantics[0];
    expect(rule.inherited).toBeUndefined();
    expect(rule.jsonTree).toBeUndefined();
    expect(rule.provider).toBeUndefined();
  });

  it('keeps an unknown provider value verbatim', () => {
    const parsed = settingAsEntityRules({
      entitySemantics: [{ name: 'r1', provider: 'future-value' }],
    });
    expect(parsed.entitySemantics[0].provider).toBe('future-value');
  });

  it('round-trips every field except enabled through getTypedSetting and updateSetting', async () => {
    mocked.mockResolvedValueOnce({
      configType: 'entityRulesSettings',
      configValue: { entitySemantics: [fullRule] },
    });
    const loaded = await getTypedSetting('entityRulesSettings', settingAsEntityRules);
    const next = loaded.entitySemantics.map((rule) => ({ ...rule, enabled: false }));

    mocked.mockResolvedValueOnce({
      config_type: 'entityRulesSettings',
      config_value: { entitySemantics: next },
    });
    await updateSetting('entityRulesSettings', { entitySemantics: next });
    expect(mocked).toHaveBeenLastCalledWith('/v1/system/settings', {
      method: 'PUT',
      json: {
        config_type: 'entityRulesSettings',
        config_value: { entitySemantics: [{ ...fullRule, enabled: false }] },
      },
    });
  });

  it('keeps each rule field set separate across rules', async () => {
    mocked.mockResolvedValueOnce({
      configType: 'entityRulesSettings',
      configValue: {
        entitySemantics: [
          fullRule,
          { name: 'r2', description: 'd', rule: '{}', enabled: false },
        ],
      },
    });
    const loaded = await getTypedSetting('entityRulesSettings', settingAsEntityRules);
    expect(loaded.entitySemantics).toHaveLength(2);
    expect(loaded.entitySemantics[0]).toEqual(fullRule);
    expect(loaded.entitySemantics[1].inherited).toBeUndefined();
    expect(loaded.entitySemantics[1].jsonTree).toBeUndefined();
    expect(loaded.entitySemantics[1].provider).toBeUndefined();

    mocked.mockResolvedValueOnce({
      config_type: 'entityRulesSettings',
      config_value: { entitySemantics: loaded.entitySemantics },
    });
    await updateSetting('entityRulesSettings', { entitySemantics: loaded.entitySemantics });
    const lastCall = mocked.mock.lastCall?.[1] as {
      json: { config_value: { entitySemantics: Array<Record<string, unknown>> } };
    };
    expect(lastCall.json.config_value.entitySemantics[0]).toEqual(fullRule);
    const serialized = JSON.parse(JSON.stringify(lastCall.json.config_value)) as {
      entitySemantics: Array<Record<string, unknown>>;
    };
    expect(serialized.entitySemantics[1]).not.toHaveProperty('inherited');
    expect(serialized.entitySemantics[1]).not.toHaveProperty('jsonTree');
    expect(serialized.entitySemantics[1]).not.toHaveProperty('provider');
  });
});

describe('patchAppConfiguration', () => {
  beforeEach(() => {
    mocked.mockReset();
    mocked.mockResolvedValue(undefined);
  });

  it('patches only the given key with a single RFC 6902 add op', async () => {
    await patchAppConfiguration({ defaultTimeFormat: '24h' });
    expect(mocked).toHaveBeenCalledWith('/v1/system/settings/appConfiguration', {
      method: 'PATCH',
      json: [{ op: 'add', path: '/defaultTimeFormat', value: '24h' }],
      contentType: 'application/json-patch+json',
    });
  });

  it('sends JSON null for the no-default app mode sentinel', async () => {
    await patchAppConfiguration({ defaultAppMode: null });
    expect(mocked).toHaveBeenCalledWith('/v1/system/settings/appConfiguration', {
      method: 'PATCH',
      json: [{ op: 'add', path: '/defaultAppMode', value: null }],
      contentType: 'application/json-patch+json',
    });
  });
});

describe('testEmailConnection', () => {
  beforeEach(() => {
    mocked.mockReset();
    mocked.mockResolvedValue('Email sent');
  });

  it('PUTs the address and reads the body as text (DR-1)', async () => {
    await expect(testEmailConnection('ops@example.com')).resolves.toBe('Email sent');
    expect(mocked).toHaveBeenCalledWith('/v1/system/email/test', {
      method: 'PUT',
      json: { email: 'ops@example.com' },
      response: 'text',
    });
  });
});

describe('restoreSettingsConfig', () => {
  beforeEach(() => {
    mocked.mockReset();
    mocked.mockResolvedValue({ globalSettings: { maxResultHits: 1000 } });
  });

  it('PUTs the reset endpoint with no body and returns the bare response', async () => {
    await expect(restoreSettingsConfig('searchSettings')).resolves.toEqual({
      globalSettings: { maxResultHits: 1000 },
    });
    expect(mocked).toHaveBeenCalledWith('/v1/system/settings/reset/searchSettings', {
      method: 'PUT',
    });
  });
});

describe('getCustomUiThemePreference', () => {
  beforeEach(() => {
    mocked.mockReset();
    mocked.mockResolvedValue({
      customLogoConfig: { customLogoUrlPath: 'https://example.com/logo.svg' },
      customTheme: { primaryColor: '#112233' },
      unknownField: 'dropped by the display whitelist',
    });
  });

  it('reads the bare preference from the public config endpoint', async () => {
    await expect(getCustomUiThemePreference()).resolves.toEqual({
      customLogoConfig: { customLogoUrlPath: 'https://example.com/logo.svg' },
      customTheme: { primaryColor: '#112233' },
    });
    expect(mocked).toHaveBeenCalledWith('/v1/system/config/customUiThemePreference');
  });
});
