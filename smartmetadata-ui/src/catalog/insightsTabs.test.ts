/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_DATE_RANGE_KEY,
  INSIGHTS_DEFAULT_TAB,
  INSIGHTS_TABS,
  INSIGHT_DATE_PRESETS,
  ONLINE_USERS_TIME_WINDOWS,
  insightsDatePresetFromKey,
  insightsTabFromKey,
  onlineUserActivityBand,
  onlineUsersWindowFromKey,
} from './insightsTabs';

describe('insightsTabs', () => {
  it('registers the official DataInsight tabs plus online-users, defaulting to data-assets', () => {
    expect(INSIGHTS_TABS.map((tab) => tab.key)).toEqual([
      'data-assets',
      'app-analytics',
      'kpis',
      'online-users',
    ]);
    expect(INSIGHTS_DEFAULT_TAB).toBe('data-assets');
    expect(insightsTabFromKey('bogus').key).toBe('data-assets');
    expect(insightsTabFromKey('kpis').routeName).toBe('insights-kpis');
  });

  it('marks app-analytics supported: the four pin blocks are real charts now', () => {
    const tab = INSIGHTS_TABS.find((tab) => tab.key === 'app-analytics');
    expect(tab?.supported).toBe(true);
    expect(tab?.leadKey).toBe('insights.appAnalyticsLead');
  });

  it('defaults the date preset to 7 days (official default) and the online window to 24 hours', () => {
    expect(insightsDatePresetFromKey(undefined).days).toBe(7);
    expect(insightsDatePresetFromKey('last30days').days).toBe(30);
    expect(onlineUsersWindowFromKey(undefined).minutes).toBe(1440);
    expect(ONLINE_USERS_TIME_WINDOWS.map((window) => window.minutes)).toEqual([5, 60, 1440, 10080, 43200, 0]);
  });

  it('offers pin PROFILER_FILTER_RANGE presets only: yesterday + 3/7/14/30/60 days, no 90-day preset', () => {
    expect(INSIGHT_DATE_PRESETS.map((preset) => [preset.key, preset.days])).toEqual([
      ['yesterday', 1],
      ['last3days', 3],
      ['last7days', 7],
      ['last14days', 14],
      ['last30days', 30],
      ['last60days', 60],
    ]);
    expect(insightsDatePresetFromKey('last7days').key).toBe('last7days');
    // An unknown key (including the retired 90-day key) falls back to
    // the pin default 7-day window, never to a pin-absent window.
    expect(insightsDatePresetFromKey('last90').key).toBe('last7days');
    expect(insightsDatePresetFromKey(undefined).key).toBe('last7days');
    expect(CUSTOM_DATE_RANGE_KEY).toBe('customRange');
  });

  it('bands online activity exactly like the official page', () => {
    expect(onlineUserActivityBand(undefined)).toBe('never');
    expect(onlineUserActivityBand(4)).toBe('now');
    expect(onlineUserActivityBand(30)).toBe('recent');
    expect(onlineUserActivityBand(900)).toBe('hours');
    expect(onlineUserActivityBand(2000)).toBe('days');
  });
});
