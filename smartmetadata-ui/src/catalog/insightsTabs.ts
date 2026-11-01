/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Insights page registry, data-driven like Stage 4 governanceTabs and
 * Stage 5 qualityTabs. Keys follow the official DataInsightTabs
 * (data-assets / app-analytics / kpis); online-users is the official
 * OnlineUsersPage, registered here as its own page so the Insights nav
 * can reach it. A `supported: false` entry is an honest residual, never
 * a hidden page: the view renders SmState with `residualReason`.
 */
export interface InsightsTab {
  key: string;
  routeName: string;
  path: string;
  titleKey: string;
  leadKey: string;
  supported: boolean;
  residualReason?: string;
}

export const INSIGHTS_TABS: InsightsTab[] = [
  {
    key: 'data-assets',
    routeName: 'insights-data-assets',
    path: '/insights/data-assets',
    titleKey: 'insights.tabs.dataAssets',
    leadKey: 'insights.lead',
    supported: true,
  },
  {
    key: 'app-analytics',
    routeName: 'insights-app-analytics',
    path: '/insights/app-analytics',
    titleKey: 'insights.tabs.appAnalytics',
    leadKey: 'insights.appAnalyticsEmpty',
    supported: false,
    residualReason: 'insights.appAnalyticsEmpty',
  },
  {
    key: 'kpis',
    routeName: 'insights-kpis',
    path: '/insights/kpis',
    titleKey: 'insights.tabs.kpis',
    leadKey: 'insights.kpisLead',
    supported: true,
  },
  {
    key: 'online-users',
    routeName: 'insights-online-users',
    path: '/insights/online-users',
    titleKey: 'insights.onlineUsers.title',
    leadKey: 'insights.onlineUsers.lead',
    supported: true,
  },
] as const;

export const INSIGHTS_DEFAULT_TAB = 'data-assets';

export function insightsTabFromKey(key: string | undefined): InsightsTab {
  return INSIGHTS_TABS.find((tab) => tab.key === key) ?? INSIGHTS_TABS[0];
}

/** Official AppAnalytics blocks, all residual: no web report index surface. */
export interface InsightsResidualBlock {
  key: string;
  titleKey: string;
  reasonKey: string;
}

export const APP_ANALYTICS_BLOCKS: InsightsResidualBlock[] = [
  { key: 'top-view-entities', titleKey: 'insights.appAnalytics.topViewEntities', reasonKey: 'insights.appAnalyticsEmpty' },
  { key: 'page-views-by-entities', titleKey: 'insights.appAnalytics.pageViewsByEntities', reasonKey: 'insights.appAnalyticsEmpty' },
  { key: 'daily-active-users', titleKey: 'insights.appAnalytics.dailyActiveUsers', reasonKey: 'insights.appAnalyticsEmpty' },
  { key: 'top-active-users', titleKey: 'insights.appAnalytics.topActiveUsers', reasonKey: 'insights.appAnalyticsEmpty' },
] as const;

/** DataInsight date presets. Default 30 matches the pre-split seriesWindow. */
export interface InsightsDatePreset {
  key: string;
  days: number;
  labelKey: string;
}

export const INSIGHT_DATE_PRESETS: InsightsDatePreset[] = [
  { key: 'last7', days: 7, labelKey: 'insights.datePresets.last7' },
  { key: 'last30', days: 30, labelKey: 'insights.datePresets.last30' },
  { key: 'last90', days: 90, labelKey: 'insights.datePresets.last90' },
] as const;

export function insightsDatePresetFromKey(key: string | undefined): InsightsDatePreset {
  return INSIGHT_DATE_PRESETS.find((preset) => preset.key === key) ?? INSIGHT_DATE_PRESETS[1];
}

/** Official OnlineUsers time windows in minutes; 0 means all time. */
export interface OnlineUsersTimeWindow {
  key: string;
  minutes: number;
  labelKey: string;
}

export const ONLINE_USERS_TIME_WINDOWS: OnlineUsersTimeWindow[] = [
  { key: 'last5', minutes: 5, labelKey: 'insights.onlineUsers.windows.last5' },
  { key: 'last60', minutes: 60, labelKey: 'insights.onlineUsers.windows.last60' },
  { key: 'last1440', minutes: 1440, labelKey: 'insights.onlineUsers.windows.last1440' },
  { key: 'last10080', minutes: 10080, labelKey: 'insights.onlineUsers.windows.last10080' },
  { key: 'last43200', minutes: 43200, labelKey: 'insights.onlineUsers.windows.last43200' },
  { key: 'all', minutes: 0, labelKey: 'insights.onlineUsers.windows.all' },
] as const;

export function onlineUsersWindowFromKey(key: string | undefined): OnlineUsersTimeWindow {
  return ONLINE_USERS_TIME_WINDOWS.find((window) => window.key === key) ?? ONLINE_USERS_TIME_WINDOWS[2];
}

/** Official OnlineUsers activity bands, by minutes since last activity. */
export function onlineUserActivityBand(minutesAgo: number | undefined): 'now' | 'recent' | 'hours' | 'days' | 'never' {
  if (minutesAgo === undefined) {
    return 'never';
  }
  if (minutesAgo < 5) {
    return 'now';
  }
  if (minutesAgo < 60) {
    return 'recent';
  }
  if (minutesAgo < 60 * 24) {
    return 'hours';
  }
  return 'days';
}
