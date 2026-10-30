/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EDITABLE_SETTING_TYPES,
  fetchSystemStatus,
  getTypedSetting,
  settingAsAppConfiguration,
  settingAsEntityRules,
  settingAsLineage,
  settingAsProfiler,
  settingAsSearch,
  settingAsUiTheme,
  updateSetting,
} from './system';

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
