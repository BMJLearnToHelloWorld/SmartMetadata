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
 * Bundled app screenshots (D3): the official marketplace detail page renders
 * a carousel over the names in the App's `appScreenshots` field, resolved
 * against the PNGs shipped in the official UI bundle
 * (`openmetadata-ui/.../assets/img/appScreenshots/`, pin a3012259ca). The
 * names are bare (no extension). An unknown name resolves to `undefined` so
 * the caller renders an empty slot instead of breaking the page — the same
 * degrade path as official's `importAppScreenshot` throw caught by
 * `MarketPlaceAppDetails.loadScreenshot`.
 *
 * The map is built by scanning the bundled assets at build time
 * (`import.meta.glob`), not by importing the files by name: with zero PNGs
 * in the directory (images left empty per Bai 2026-11-06 — the PNGs are
 * uploaded to the branch separately) the glob matches nothing, every name
 * resolves to `undefined`, and the build still passes. Dropping the PNGs
 * into `assets/appScreenshots/` later is picked up by the next build with
 * no code change.
 */
const screenshotModules = import.meta.glob<string>('../../assets/appScreenshots/*.png', {
  eager: true,
  import: 'default',
});

const APP_SCREENSHOT_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(screenshotModules)) {
  const name = path.split('/').pop()?.replace(/\.png$/, '');
  if (name) {
    APP_SCREENSHOT_URLS[name] = url;
  }
}

export function getAppScreenshotUrl(name: string): string | undefined {
  return APP_SCREENSHOT_URLS[name];
}
