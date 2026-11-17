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
 * Shared service-insights pure helpers, ported from pin
 * constants/ServiceInsightsTab.constants.ts,
 * ServiceInsightsTabPureUtils.ts, and ServicePureUtils.ts at
 * a3012259ca. The insights tab and its widgets share one copy:
 * the chart list, the live-name mapping, and the compact count
 * format.
 */

/** Pin `PLATFORM_INSIGHTS_CHARTS` (constants/ServiceInsightsTab.constants.ts). */
export const PLATFORM_INSIGHTS_CHARTS = [
  'assets_with_description',
  'assets_with_pii',
  'assets_with_tier',
  'assets_with_owners',
  'healthy_data_assets',
] as const;

/** Pin `getChartTypeForWidget` (ServiceInsightsTabPureUtils.ts): live stream names map onto the coverage charts. */
export function getChartTypeForWidget(chartType: string): string {
  switch (chartType) {
    case 'assets_with_description_live':
      return 'assets_with_description';
    case 'assets_with_owner_live':
      return 'assets_with_owners';
    case 'assets_with_pii_live':
      return 'assets_with_pii';
    case 'assets_with_tier_live':
      return 'assets_with_tier';
    default:
      return chartType;
  }
}

/** Pin `getReadableCountString` (ServicePureUtils.ts). */
export function getReadableCountString(count: number, maxDigits = 2): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: maxDigits,
  }).format(count);
}
