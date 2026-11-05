/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { QUALITY_PAGE_TABS, residualQualityTabs, supportedQualityTabs } from './qualityTabs';

describe('qualityTabs', () => {
  it('matches the official DataQuality tab keys with dashboard as default', () => {
    expect(QUALITY_PAGE_TABS.dqLanding.map((tab) => tab.key)).toEqual([
      'dashboard',
      'test-cases',
      'test-suites',
    ]);
  });

  it('marks test-case sql-query as residual, dimensionality and issues as wired (A15)', () => {
    expect(supportedQualityTabs('testCase').map((tab) => tab.key)).toContain('issues');
    expect(supportedQualityTabs('testCase').map((tab) => tab.key)).toContain('dimensionality');
    expect(residualQualityTabs('testCase').map((tab) => tab.key)).toEqual(['sql-query']);
    for (const tab of residualQualityTabs('testCase')) {
      expect(tab.residualReason).toBeTruthy();
    }
  });

  it('marks the test-suite pipeline tab as wired (A15: add/edit ingestion page)', () => {
    expect(supportedQualityTabs('testSuite').map((tab) => tab.key)).toContain('pipeline');
    expect(residualQualityTabs('testSuite').map((tab) => tab.key)).toEqual([]);
  });

  it('gives every tab a label key and every residual a reason', () => {
    for (const tabs of Object.values(QUALITY_PAGE_TABS)) {
      for (const tab of tabs) {
        expect(tab.labelKey).toBeTruthy();
        if (!tab.supported) {
          expect(tab.residualReason).toBeTruthy();
        }
      }
    }
  });
});
