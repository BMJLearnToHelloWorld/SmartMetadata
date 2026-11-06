/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dataInsightsPic1Url from '@/assets/appScreenshots/DataInsightsPic1.png';
import dataInsightsReportPic1Url from '@/assets/appScreenshots/DataInsightsReportPic1.png';
import dataRetentionApplicationUrl from '@/assets/appScreenshots/DataRetentionApplication.png';
import mcpApplicationUrl from '@/assets/appScreenshots/McpApplication.png';
import searchIndexPic1Url from '@/assets/appScreenshots/SearchIndexPic1.png';

/**
 * Bundled app screenshots (D3): the official marketplace detail page renders
 * a carousel over the names in the App's `appScreenshots` field, resolved
 * against the 5 PNGs shipped in the official UI bundle
 * (`openmetadata-ui/.../assets/img/appScreenshots/`, pin a3012259ca). The
 * names are bare (no extension). An unknown name resolves to `undefined` so
 * the caller renders an empty slot instead of breaking the page — the same
 * degrade path as official's `importAppScreenshot` throw caught by
 * `MarketPlaceAppDetails.loadScreenshot`.
 */
const APP_SCREENSHOT_URLS: Record<string, string> = {
  DataInsightsPic1: dataInsightsPic1Url,
  DataInsightsReportPic1: dataInsightsReportPic1Url,
  DataRetentionApplication: dataRetentionApplicationUrl,
  McpApplication: mcpApplicationUrl,
  SearchIndexPic1: searchIndexPic1Url,
};

export function getAppScreenshotUrl(name: string): string | undefined {
  return APP_SCREENSHOT_URLS[name];
}
