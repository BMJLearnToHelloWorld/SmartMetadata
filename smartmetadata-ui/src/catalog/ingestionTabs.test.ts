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
  PIPELINE_ENTITY_TABS,
  SERVICE_CATEGORIES,
  SERVICE_DETAIL_TABS,
  ingestionTabKeys,
} from './ingestionTabs';

describe('ingestionTabs', () => {
  it('marks exactly the five product service kinds as supported categories', () => {
    expect(SERVICE_CATEGORIES.filter((row) => row.supported).map((row) => row.key)).toEqual([
      'database',
      'messaging',
      'dashboard',
      'storage',
      'pipeline',
    ]);
    for (const row of SERVICE_CATEGORIES.filter((row) => !row.supported)) {
      expect(row.residualReason).toBeTruthy();
    }
  });

  it('marks service detail pipelines as supported and versions as residual', () => {
    const byKey = new Map(SERVICE_DETAIL_TABS.map((tab) => [tab.key, tab]));
    expect(byKey.get('overview')?.supported).toBe(true);
    expect(byKey.get('connection')?.supported).toBe(true);
    expect(byKey.get('pipelines')?.supported).toBe(true);
    expect(byKey.get('versions')?.supported).toBe(false);
    expect(byKey.get('versions')?.residualReason).toContain('versions');
  });

  it('marks ingestion pipeline trigger as residual and entity DAG tabs as supported', () => {
    expect(INGESTION_PIPELINE_TABS.find((tab) => tab.key === 'trigger')?.supported).toBe(false);
    expect(ingestionTabKeys(PIPELINE_ENTITY_TABS)).toEqual(['tasks', 'executions']);
    expect(PIPELINE_ENTITY_TABS.every((tab) => tab.supported)).toBe(true);
  });
});
