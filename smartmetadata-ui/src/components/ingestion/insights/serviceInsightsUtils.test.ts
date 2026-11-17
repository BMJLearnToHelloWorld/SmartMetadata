/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getChartTypeForWidget,
  getReadableCountString,
  PLATFORM_INSIGHTS_CHARTS,
} from './serviceInsightsUtils';

describe('serviceInsightsUtils', () => {
  it('lists the five pin platform-insights charts in order', () => {
    expect([...PLATFORM_INSIGHTS_CHARTS]).toEqual([
      'assets_with_description',
      'assets_with_pii',
      'assets_with_tier',
      'assets_with_owners',
      'healthy_data_assets',
    ]);
  });

  it('maps live stream names onto the coverage charts and passes the rest through', () => {
    expect(getChartTypeForWidget('assets_with_description_live')).toBe('assets_with_description');
    expect(getChartTypeForWidget('assets_with_owner_live')).toBe('assets_with_owners');
    expect(getChartTypeForWidget('assets_with_pii_live')).toBe('assets_with_pii');
    expect(getChartTypeForWidget('assets_with_tier_live')).toBe('assets_with_tier');
    expect(getChartTypeForWidget('healthy_data_assets')).toBe('healthy_data_assets');
  });

  it('formats counts compactly', () => {
    expect(getReadableCountString(999)).toBe('999');
    expect(getReadableCountString(1500)).toBe('1.5K');
    expect(getReadableCountString(1234567)).toBe('1.23M');
  });
});
