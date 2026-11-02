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

  it('matches the official tab ids for the R2 entities', () => {
    expect(entityDetailTabDefs('database')?.map((tab) => tab.key)).toEqual([
      'schemas',
      'activity_feed',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('databaseSchema')?.map((tab) => tab.key)).toEqual([
      'table',
      'stored_procedure',
      'activity_feed',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('container')?.map((tab) => tab.key)).toEqual([
      'schema',
      'children',
      'sample_data',
      'activity_feed',
      'lineage',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('dashboardDataModel')?.map((tab) => tab.key)).toEqual([
      'model',
      'activity_feed',
      'lineage',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('mlmodel')?.map((tab) => tab.key)).toEqual([
      'features',
      'activity_feed',
      'details',
      'lineage',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('searchIndex')?.map((tab) => tab.key)).toEqual([
      'fields',
      'activity_feed',
      'sample_data',
      'lineage',
      'contract',
      'search_index_settings',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('storedProcedure')?.map((tab) => tab.key)).toEqual([
      'code',
      'activity_feed',
      'lineage',
      'contract',
      'custom_properties',
    ]);
    expect(entityDetailTabDefs('metric')?.map((tab) => tab.key)).toEqual([
      'overview',
      'lineage',
      'assets',
      'activity_feed',
      'custom_properties',
    ]);
  });

  it('does not add the knowledge_graph tab without an rdfEnabled source', () => {
    expect(entityDetailTabDefs('table')?.map((tab) => tab.key)).not.toContain('knowledge_graph');
  });

  it('reports other entities as not yet split instead of inventing tabs', () => {
    expect(isOfficiallySplit('table')).toBe(true);
    expect(isOfficiallySplit('pipeline')).toBe(false);
    expect(entityDetailTabDefs('pipeline')).toBeNull();
    // Unwired entities stay unsplit: their detail endpoint does not exist,
    // so a tab definition would never render and would misreport parity.
    expect(isOfficiallySplit('apiCollection')).toBe(false);
    expect(isOfficiallySplit('query')).toBe(false);
    expect(entityDetailTabDefs('query')).toBeNull();
  });
});
