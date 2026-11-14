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
  INGESTION_PIPELINE_TABS,
  SERVICE_CATEGORIES,
  SERVICE_DETAIL_TABS,
  ingestionTabKeys,
} from './ingestionTabs';

describe('ingestionTabs', () => {
  it('lists all thirteen product service kinds (supported = listed, default type creatable)', () => {
    expect(SERVICE_CATEGORIES.map((row) => row.key)).toEqual([
      'database',
      'messaging',
      'dashboard',
      'storage',
      'pipeline',
      'metadata',
      'security',
      'mlmodel',
      'search',
      'api',
      'drive',
      'llm',
      'mcp',
    ]);
    // supported means "listed in the wizard/list with a creatable default
    // type" (A9) — it is NOT a full-support claim; see supportLevel below.
    expect(SERVICE_CATEGORIES.every((row) => row.supported)).toBe(true);
  });

  it('grades only the five fully-wired kinds as full support (M-Next B4)', () => {
    expect(SERVICE_CATEGORIES.filter((row) => row.supportLevel === 'full').map((row) => row.key)).toEqual([
      'database',
      'messaging',
      'dashboard',
      'storage',
      'pipeline',
    ]);
    const partial = SERVICE_CATEGORIES.filter((row) => row.supportLevel === 'partial');
    expect(partial.map((row) => row.key)).toEqual([
      'metadata',
      'security',
      'mlmodel',
      'search',
      'api',
      'drive',
      'llm',
      'mcp',
    ]);
    for (const row of partial) {
      expect(row.residualReason).toBeTruthy();
    }
    for (const row of SERVICE_CATEGORIES.filter((row) => row.supportLevel === 'full')) {
      expect(row.residualReason).toBeUndefined();
    }
  });

  it('marks service detail agents and versions as supported (D-3: one working agents tab)', () => {
    const byKey = new Map(SERVICE_DETAIL_TABS.map((tab) => [tab.key, tab]));
    expect(byKey.get('overview')?.supported).toBe(true);
    expect(byKey.get('connection')?.supported).toBe(true);
    expect(byKey.get('agents')?.supported).toBe(true);
    expect(byKey.get('versions')?.supported).toBe(true);
    // D-3 replaced the pipelines entry with the agents entry: no
    // pipelines key remains, and the dead agents residual is gone, so
    // exactly one agents entry exists, in third position.
    expect(byKey.has('pipelines')).toBe(false);
    expect(SERVICE_DETAIL_TABS.filter((tab) => tab.key === 'agents')).toHaveLength(1);
    expect(SERVICE_DETAIL_TABS[2]?.key).toBe('agents');
    // Official pushes the Agents tab only for non-security services.
    expect(byKey.get('agents')?.excludedKinds).toEqual(['security']);
  });

  it('lists the ingestion pipeline detail tabs the view renders', () => {
    expect(ingestionTabKeys(INGESTION_PIPELINE_TABS)).toEqual(['overview', 'status']);
    expect(INGESTION_PIPELINE_TABS.every((tab) => tab.supported)).toBe(true);
  });
});
