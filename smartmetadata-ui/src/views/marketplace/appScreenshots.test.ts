/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { getAppScreenshotUrl } from './appScreenshots';

describe('getAppScreenshotUrl', () => {
  it('resolves the five bundled official screenshot names', () => {
    for (const name of [
      'DataInsightsPic1',
      'DataInsightsReportPic1',
      'DataRetentionApplication',
      'McpApplication',
      'SearchIndexPic1',
    ]) {
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
