/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { getAppScreenshotUrl } from './appScreenshots';

/**
 * The resolver mirrors the PNGs bundled under `assets/appScreenshots/`: it
 * resolves exactly the files present on disk, by bare name, and anything
 * else degrades to `undefined` (empty slot). This test reads the same
 * directory the resolver scans, so it asserts the mapping for the bundled
 * set instead of assuming a fixed file list — it holds both with the 5
 * official PNGs on disk and with zero PNGs (images left empty, Bai
 * 2026-11-06), where the loop is empty and the undefined assertions below
 * are the whole contract.
 */
const bundledModules = import.meta.glob('../../assets/appScreenshots/*.png', {
  eager: true,
  import: 'default',
});

describe('getAppScreenshotUrl', () => {
  it('resolves every bundled PNG by its bare name', () => {
    const names = Object.keys(bundledModules)
      .map((path) => path.split('/').pop()?.replace(/\.png$/, ''))
      .filter((name): name is string => Boolean(name));
    for (const name of names) {
      const url = getAppScreenshotUrl(name);
      expect(url).toBeTypeOf('string');
      expect(url).toContain(`${name}.png`);
    }
  });

  it('returns undefined for an unknown name so the caller renders an empty slot', () => {
    expect(getAppScreenshotUrl('NoSuchScreenshot')).toBeUndefined();
    expect(getAppScreenshotUrl('DataInsightsPic1.png')).toBeUndefined();
  });
});
