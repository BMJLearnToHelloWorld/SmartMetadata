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
  APP_ANALYTICS_BLOCKS,
  INSIGHTS_DEFAULT_TAB,
  INSIGHTS_TABS,
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

  it('marks app-analytics unsupported with the official four blocks', () => {
    expect(INSIGHTS_TABS.find((tab) => tab.key === 'app-analytics')?.supported).toBe(false);
    expect(APP_ANALYTICS_BLOCKS.map((block) => block.key)).toEqual([
      'top-view-entities',
      'page-views-by-entities',
      'daily-active-users',
      'top-active-users',
    ]);
  });

  it('defaults the date preset to 30 days and the online window to 24 hours', () => {
    expect(insightsDatePresetFromKey(undefined).days).toBe(30);
    expect(insightsDatePresetFromKey('last7').days).toBe(7);
    expect(onlineUsersWindowFromKey(undefined).minutes).toBe(1440);
    expect(ONLINE_USERS_TIME_WINDOWS.map((window) => window.minutes)).toEqual([5, 60, 1440, 10080, 43200, 0]);
  });

  it('bands online activity exactly like the official page', () => {
    expect(onlineUserActivityBand(undefined)).toBe('never');
    expect(onlineUserActivityBand(4)).toBe('now');
    expect(onlineUserActivityBand(30)).toBe('recent');
    expect(onlineUserActivityBand(900)).toBe('hours');
    expect(onlineUserActivityBand(2000)).toBe('days');
  });
});
