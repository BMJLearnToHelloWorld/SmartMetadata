/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_ENTITY_TABS,
  governanceTabsFor,
  residualGovernanceTabs,
  supportedGovernanceTabs,
} from './governanceTabs';

describe('governanceTabs', () => {
  it('covers every governance entity with at least one supported tab', () => {
    for (const entity of Object.keys(GOVERNANCE_ENTITY_TABS)) {
      const tabs = governanceTabsFor(entity as keyof typeof GOVERNANCE_ENTITY_TABS);
      expect(tabs.length).toBeGreaterThan(0);
      expect(supportedGovernanceTabs(entity as keyof typeof GOVERNANCE_ENTITY_TABS).length).toBeGreaterThan(0);
    }
  });

  it('marks residual tabs with a reason and never leaves a supported tab with one', () => {
    for (const tabs of Object.values(GOVERNANCE_ENTITY_TABS)) {
      for (const tab of tabs) {
        if (tab.supported) {
          expect(tab.residualReason).toBeUndefined();
        } else {
          expect(tab.residualReason).toBeTruthy();
        }
      }
    }
  });

  it('keeps glossary terms wired and relations/activity residual', () => {
    expect(supportedGovernanceTabs('glossary').map((tab) => tab.key)).toContain('terms');
    expect(residualGovernanceTabs('glossary').map((tab) => tab.key).sort()).toEqual([
      'activity',
      'relations',
    ]);
  });

  it('keeps metric detail supported and version detail residual', () => {
    expect(supportedGovernanceTabs('metric').map((tab) => tab.key)).toEqual(['details']);
    expect(residualGovernanceTabs('metric').map((tab) => tab.key)).toEqual(['versions']);
  });

  it('has no duplicate tab keys per entity', () => {
    for (const tabs of Object.values(GOVERNANCE_ENTITY_TABS)) {
      const keys = tabs.map((tab) => tab.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
