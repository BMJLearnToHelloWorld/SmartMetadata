/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { UsageDetails, UsageStats } from '@/types/api';

/**
 * Pin `getUsagePercentile` (utils/TablePureUtils.ts at a3012259ca) and
 * `ordinalize` (utils/StringUtils.ts), copied exactly — including the
 * template's separator space, which makes the non-literal form begin with
 * a space. Callers pair the non-literal form with a separate visible
 * "Usage" label, as the pin header does; the literal form is used only
 * on search cards. The translate function carries the fork `usage.*`
 * keys; pin reads the same strings from i18n directly.
 *
 * `pctRank` is on a 0–100 scale; the function does no scaling or clamping.
 */

export type UsageTranslate = (key: string) => string;

export function ordinalize(num: number, t: UsageTranslate): string {
  const mod10 = num % 10;
  const mod100 = num % 100;
  let suffixKey: string;
  if (mod10 === 1 && mod100 !== 11) {
    suffixKey = 'usage.ordinalSuffixSt';
  } else if (mod10 === 2 && mod100 !== 12) {
    suffixKey = 'usage.ordinalSuffixNd';
  } else if (mod10 === 3 && mod100 !== 13) {
    suffixKey = 'usage.ordinalSuffixRd';
  } else {
    suffixKey = 'usage.ordinalSuffixTh';
  }
  return `${num}${t(suffixKey)}`;
}

export function getUsagePercentile(
  pctRank: number,
  isLiteral: boolean,
  t: UsageTranslate,
): string {
  const percentile = Math.round(pctRank * 10) / 10;
  const ordinalPercentile = ordinalize(percentile, t);
  return `${isLiteral ? t('usage.usage') : ''} ${ordinalPercentile} ${t('usage.pctile')}`;
}

/** Pin NO_DATA (constants.ts): the summary-panel "no percentile" marker. */
export const USAGE_NO_DATA = '-';

/**
 * Pin `getUsageData` (DataAssetSummaryPanelPureUtils.ts): the only call
 * site that distinguishes "no data" from a zero rank.
 */
export function getUsageData(
  percentileRank: number | undefined,
  t: UsageTranslate,
): string {
  return percentileRank === undefined || percentileRank === null
    ? USAGE_NO_DATA
    : getUsagePercentile(percentileRank, false, t);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapUsageStats(value: unknown): UsageStats | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return { count: asNumber(rec.count), percentileRank: asNumber(rec.percentileRank) };
}

/**
 * Maps a UsageDetails payload (generated type/usageDetails.ts). Returns
 * undefined for a missing or non-object value; callers that need pin's
 * `'usageSummary' in source` key-presence rule handle that themselves.
 */
export function mapUsageSummary(value: unknown): UsageDetails | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    date: typeof rec.date === 'string' ? rec.date : undefined,
    dailyStats: mapUsageStats(rec.dailyStats),
    weeklyStats: mapUsageStats(rec.weeklyStats),
    monthlyStats: mapUsageStats(rec.monthlyStats),
  };
}
