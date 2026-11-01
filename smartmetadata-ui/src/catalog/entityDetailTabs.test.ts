/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { entityDetailTabDefs, entityDetailTabDef, isOfficiallySplit } from './entityDetailTabs';

describe('entityDetailTabs', () => {
  it('matches the official tab ids for table, topic and dashboard', () => {
    expect(entityDetailTabDefs('table')?.map((tab) => tab.key)).toEqual([
      'schema',
      'activity_feed',
      'sample_data',
      'table_queries',
      'profiler',
      'lineage',
      'dbt',
      'view_definition',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('topic')?.map((tab) => tab.key)).toEqual([
      'schema',
      'activity_feed',
      'sample_data',
      'config',
      'lineage',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('dashboard')?.map((tab) => tab.key)).toEqual([
      'details',
      'activity_feed',
      'lineage',
      'contract',
      'custom_properties',
    ]);
  });

  it('marks tabs without a product API as residual with a reason key', () => {
    expect(entityDetailTabDef('table', 'table_queries')?.residual).toBe('asset.tabResidual.tableQueries');
    expect(entityDetailTabDef('topic', 'config')?.residual).toBe('asset.tabResidual.config');
    expect(entityDetailTabDef('dashboard', 'contract')?.residual).toBe('asset.tabResidual.contract');
    expect(entityDetailTabDef('table', 'schema')?.residual).toBeUndefined();
  });

  it('reports other entities as not yet split instead of inventing tabs', () => {
    expect(isOfficiallySplit('table')).toBe(true);
    expect(isOfficiallySplit('pipeline')).toBe(false);
    expect(entityDetailTabDefs('pipeline')).toBeNull();
  });
});
