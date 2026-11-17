/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  defaultServiceDetailTab,
  firstServiceDetailTab,
  resolveServiceDetailTabs,
} from './serviceDetailTabs';
import type { ServiceKind } from '@/types/ingestion';

describe('serviceDetailTabs', () => {
  it('orders database tabs Insights, main slug, Agents, Connection', () => {
    const tabs = resolveServiceDetailTabs({
      kind: 'database',
      showAgentsTab: true,
      canEditAll: true,
    });
    expect(tabs.map((tab) => tab.key)).toEqual(['insights', 'databases', 'agents', 'connection']);
    expect(tabs.map((tab) => tab.kind)).toEqual(['insights', 'main', 'agents', 'connection']);
    expect(tabs[1]?.labelKey).toBe('serviceDetail.countLabels.database');
  });

  it('uses the English count-label slug as the main tab key for every kind', () => {
    const expected: Record<ServiceKind, string> = {
      database: 'databases',
      messaging: 'topics',
      dashboard: 'dashboards',
      storage: 'containers',
      pipeline: 'pipelines',
      mlmodel: 'mlmodels',
      search: 'searchindexes',
      api: 'collections',
      drive: 'directories',
      metadata: 'databases',
      security: 'databases',
      llm: 'databases',
      mcp: 'databases',
    };
    for (const [kind, key] of Object.entries(expected)) {
      const tabs = resolveServiceDetailTabs({
        kind: kind as ServiceKind,
        showAgentsTab: true,
        canEditAll: true,
      });
      const main = tabs.find((tab) => tab.kind === 'main');
      if (kind === 'metadata' || kind === 'security') {
        expect(main).toBeUndefined();
      } else {
        expect(main?.key).toBe(key);
      }
    }
  });

  it('adds the data-model secondary tab for dashboard services only', () => {
    const dashboard = resolveServiceDetailTabs({
      kind: 'dashboard',
      showAgentsTab: true,
      canEditAll: true,
    });
    expect(dashboard.map((tab) => tab.key)).toEqual([
      'insights',
      'dashboards',
      'data-model',
      'agents',
      'connection',
    ]);
    const database = resolveServiceDetailTabs({
      kind: 'database',
      showAgentsTab: true,
      canEditAll: true,
    });
    expect(database.map((tab) => tab.key)).not.toContain('data-model');
  });

  it('adds files and spreadsheets secondary tabs for drive services only', () => {
    const drive = resolveServiceDetailTabs({
      kind: 'drive',
      showAgentsTab: true,
      canEditAll: true,
    });
    expect(drive.map((tab) => tab.key)).toEqual([
      'insights',
      'directories',
      'files',
      'spreadsheets',
      'agents',
      'connection',
    ]);
  });

  it('narrows metadata to Agents + Connection and security to Connection only', () => {
    expect(
      resolveServiceDetailTabs({ kind: 'metadata', showAgentsTab: true, canEditAll: true }).map(
        (tab) => tab.key,
      ),
    ).toEqual(['agents', 'connection']);
    expect(
      resolveServiceDetailTabs({ kind: 'security', showAgentsTab: true, canEditAll: true }).map(
        (tab) => tab.key,
      ),
    ).toEqual(['connection']);
  });

  it('hides Agents without the owner/admin rule and Connection without EditAll', () => {
    expect(
      resolveServiceDetailTabs({ kind: 'database', showAgentsTab: false, canEditAll: true }).map(
        (tab) => tab.key,
      ),
    ).toEqual(['insights', 'databases', 'connection']);
    expect(
      resolveServiceDetailTabs({ kind: 'database', showAgentsTab: true, canEditAll: false }).map(
        (tab) => tab.key,
      ),
    ).toEqual(['insights', 'databases', 'agents']);
  });

  it('returns an empty set when nothing is visible instead of crashing', () => {
    const tabs = resolveServiceDetailTabs({
      kind: 'security',
      showAgentsTab: false,
      canEditAll: false,
    });
    expect(tabs).toEqual([]);
    expect(firstServiceDetailTab(tabs)).toBeUndefined();
  });

  it('picks the official default tab per kind', () => {
    expect(defaultServiceDetailTab('metadata')).toBe('agents');
    expect(defaultServiceDetailTab('security')).toBe('connection');
    expect(defaultServiceDetailTab('database')).toBe('insights');
    expect(defaultServiceDetailTab('drive')).toBe('insights');
  });

  it('matches the DESIGN §4.2 construction for every kind, agents rule, and EditAll combination', () => {
    // Literal base sets from §4.2 rules 1-2 (insights + main + kind
    // secondaries); rules 3-4 append Agents (never for security) and
    // Connection under their gates. All thirteen kinds are covered.
    const baseByKind: Record<ServiceKind, string[]> = {
      database: ['insights', 'databases'],
      messaging: ['insights', 'topics'],
      dashboard: ['insights', 'dashboards', 'data-model'],
      storage: ['insights', 'containers'],
      pipeline: ['insights', 'pipelines'],
      api: ['insights', 'collections'],
      mlmodel: ['insights', 'mlmodels'],
      metadata: [],
      drive: ['insights', 'directories', 'files', 'spreadsheets'],
      search: ['insights', 'searchindexes'],
      llm: ['insights', 'databases'],
      mcp: ['insights', 'databases'],
      security: [],
    };
    for (const [kind, base] of Object.entries(baseByKind)) {
      for (const showAgentsTab of [true, false]) {
        for (const canEditAll of [true, false]) {
          const expected = [...base];
          if (kind !== 'security' && showAgentsTab) {
            expected.push('agents');
          }
          if (canEditAll) {
            expected.push('connection');
          }
          expect(
            resolveServiceDetailTabs({
              kind: kind as ServiceKind,
              showAgentsTab,
              canEditAll,
            }).map((tab) => tab.key),
          ).toEqual(expected);
        }
      }
    }
  });
});
