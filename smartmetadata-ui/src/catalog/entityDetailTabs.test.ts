/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { entityDetailTabDefs, entityDetailTabDef, isOfficiallySplit, preservedTabKeys } from './entityDetailTabs';

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
    expect(entityDetailTabDef('topic', 'config')?.residual).toBe('asset.tabResidual.config');
    expect(entityDetailTabDef('dashboard', 'contract')?.residual).toBe('asset.tabResidual.contract');
    expect(entityDetailTabDef('table', 'schema')?.residual).toBeUndefined();
  });

  it('wires table_queries to its real slot now that the query list is served', () => {
    const tab = entityDetailTabDef('table', 'table_queries');
    expect(tab?.slot).toBe('tableQueries');
    expect(tab?.residual).toBeUndefined();
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
    expect(isOfficiallySplit('query')).toBe(false);
    expect(entityDetailTabDefs('query')).toBeNull();
  });

  // P2 B5: API collection / endpoint are now wired through the generic
  // entity detail route (official pages exist; only the mount is generic).
  it('splits API collection and endpoint with their official tabs', () => {
    expect(isOfficiallySplit('apiCollection')).toBe(true);
    expect(entityDetailTabDefs('apiCollection')?.map((tab) => tab.key)).toEqual([
      'overview',
      'apiEndpoints',
      'activity_feed',
      'custom_properties',
    ]);
    expect(isOfficiallySplit('apiEndpoint')).toBe(true);
    expect(entityDetailTabDefs('apiEndpoint')?.map((tab) => tab.key)).toEqual([
      'overview',
      'endpoint',
      'activity_feed',
      'custom_properties',
    ]);
  });
});

describe('preservedTabKeys (M-1)', () => {
  // The split determination is the view's own (`defs !== null`), not a
  // hand-mirrored table, so a type that gains split definitions
  // changes branch here exactly as it does in the view.
  function keysFor(entityType: string): string[] {
    return preservedTabKeys(entityType, entityDetailTabDefs(entityType) !== null);
  }

  it('preserves nothing for fully resolvable split sets', () => {
    for (const entityType of [
      'table',
      'topic',
      'dashboard',
      'database',
      'databaseSchema',
      'container',
      'dashboardDataModel',
      'mlmodel',
      'searchIndex',
      'storedProcedure',
      'metric',
    ]) {
      expect(keysFor(entityType)).toEqual([]);
    }
  });

  it('preserves overview for the split API views, whose TabsIds carry no OVERVIEW', () => {
    expect(keysFor('apiCollection')).toEqual(['overview']);
    expect(keysFor('apiEndpoint')).toEqual(['overview']);
  });

  it('preserves only quality for chart and file fallbacks', () => {
    // Chart's overview resolves through the `details` alias and
    // File's matches the official OVERVIEW id, so neither is kept.
    expect(keysFor('chart')).toEqual(['quality']);
    expect(keysFor('file')).toEqual(['quality']);
  });

  it('preserves overview and quality for pipeline and drive fallbacks', () => {
    expect(keysFor('pipeline')).toEqual(['overview', 'quality']);
    expect(keysFor('directory')).toEqual(['overview', 'quality']);
    expect(keysFor('spreadsheet')).toEqual(['overview', 'quality']);
    expect(keysFor('worksheet')).toEqual(['overview', 'quality']);
  });

  it('preserves quality for query and unknown fallback types', () => {
    expect(keysFor('query')).toEqual(['quality']);
    expect(keysFor('no-such-type')).toEqual(['quality']);
  });
});
