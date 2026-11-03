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
  browsePathLabels,
  buildEstateTree,
  countForTypes,
  estateChildNodes,
  estateDrill,
  estateFromQuery,
  filtersForEstateNode,
  findEstateNode,
  isResidualEstate,
  selectedEstateFromFilters,
  type EstateNode,
} from './browseEstate';
import type { SearchFacet } from './searchFacets';

const FACETS: SearchFacet[] = [
  {
    id: 'entityType',
    field: 'entityType',
    buckets: [
      { key: 'table', count: 12 },
      { key: 'database', count: 2 },
      { key: 'dashboard', count: 4 },
      { key: 'pipeline', count: 3 },
    ],
  },
  {
    id: 'service',
    field: 'service.displayName.keyword',
    buckets: [
      { key: 'mysql', count: 8 },
      { key: 'postgres', count: 6 },
    ],
  },
];

describe('browseEstate', () => {
  it('sums entityType buckets into Browse Estate category counts', () => {
    expect(countForTypes(FACETS, ['database', 'databaseSchema', 'storedProcedure', 'table'])).toBe(14);
    expect(countForTypes(FACETS, ['dashboardDataModel', 'dashboard', 'chart'])).toBe(4);
    expect(countForTypes(FACETS, ['topic'])).toBe(0);
  });

  it('always renders residual Context Center and attaches service children on the selected root', () => {
    const tree = buildEstateTree(FACETS, {
      databases: estateChildNodes(
        { key: 'databases', categoryId: 'databases', titleKey: '', count: 0 },
        FACETS[1].buckets,
      ),
    });
    expect(tree.map((node) => node.key)).toEqual([
      'databases',
      'dashboards',
      'pipelines',
      'topics',
      'mlmodels',
      'containers',
      'searchIndexes',
      'governance',
      'domains',
      'contextCenter',
    ]);
    expect(tree[0].count).toBe(14);
    expect(tree[0].children).toEqual([
      {
        key: 'databases:service:mysql',
        categoryId: 'databases',
        service: 'mysql',
        titleKey: '',
        title: 'mysql',
        count: 8,
        isLeaf: false,
      },
      {
        key: 'databases:service:postgres',
        categoryId: 'databases',
        service: 'postgres',
        titleKey: '',
        title: 'postgres',
        count: 6,
        isLeaf: false,
      },
    ]);
    // Unloaded expandable categories keep their switcher; non-expandable
    // categories are leaves.
    expect(tree[1].isLeaf).toBe(false);
    expect(tree[1].children).toBeUndefined();
    expect(tree.find((node) => node.key === 'governance')?.isLeaf).toBe(true);
    expect(tree.find((node) => node.key === 'contextCenter')).toMatchObject({
      count: 0,
      residualRoute: 'context-center-overview',
    });
    expect(isResidualEstate('contextCenter')).toBe(true);
    expect(isResidualEstate('databases')).toBe(false);
  });

  it('maps a category click onto Lucene entityType filters and a service child onto service=', () => {
    const root = buildEstateTree(FACETS)[0];
    expect(filtersForEstateNode(root, { tagFqn: ['PII.Sensitive'] })).toEqual({
      tagFqn: ['PII.Sensitive'],
      entityType: ['database', 'databaseSchema', 'storedProcedure', 'table'],
    });
    const serviceNode = buildEstateTree(FACETS, {
      databases: estateChildNodes(
        { key: 'databases', categoryId: 'databases', titleKey: '', count: 0 },
        FACETS[1].buckets,
      ),
    })
      .at(0)
      ?.children?.[0];
    expect(serviceNode).toBeTruthy();
    expect(filtersForEstateNode(serviceNode!, {})).toEqual({
      entityType: ['database', 'databaseSchema', 'storedProcedure', 'table'],
      service: ['mysql'],
    });
  });

  it('turns a loaded-but-empty node into a leaf and drills databases service to database to schema to entity type', () => {
    const empty = buildEstateTree(FACETS, { databases: [] });
    expect(empty[0].isLeaf).toBe(true);
    expect(empty[0].children).toEqual([]);

    const serviceNode: EstateNode = {
      key: 'databases:service:mysql',
      categoryId: 'databases',
      service: 'mysql',
      titleKey: '',
      count: 8,
      isLeaf: false,
    };
    expect(estateDrill(serviceNode)).toEqual({
      facet: 'database',
      filters: {
        entityType: ['database', 'databaseSchema', 'storedProcedure', 'table'],
        service: ['mysql'],
      },
    });
    const databaseNode: EstateNode = {
      ...serviceNode,
      key: 'databases:service:mysql:database:analytics',
      database: 'analytics',
    };
    expect(estateDrill(databaseNode)?.facet).toBe('schema');
    const schemaNode: EstateNode = {
      ...databaseNode,
      key: 'databases:service:mysql:database:analytics:schema:marts',
      schema: 'marts',
    };
    expect(estateDrill(schemaNode)?.facet).toBe('entityType');
    expect(filtersForEstateNode(schemaNode, {})).toEqual({
      entityType: ['database', 'databaseSchema', 'storedProcedure', 'table'],
      service: ['mysql'],
      database: ['analytics'],
      schema: ['marts'],
    });
    const leafNode = estateChildNodes(schemaNode, [{ key: 'table', count: 12 }])[0];
    expect(leafNode.isLeaf).toBe(true);
    expect(estateDrill(leafNode)).toBeNull();
    expect(filtersForEstateNode(leafNode, {})).toEqual({
      entityType: ['table'],
      service: ['mysql'],
      database: ['analytics'],
      schema: ['marts'],
    });

    const dashboardService: EstateNode = {
      key: 'dashboards:service:superset',
      categoryId: 'dashboards',
      service: 'superset',
      titleKey: '',
      count: 4,
      isLeaf: false,
    };
    expect(estateDrill(dashboardService)?.facet).toBe('entityType');
  });

  it('finds nested nodes by key for expand-time lazy loading', () => {
    const tree = buildEstateTree(FACETS, {
      databases: estateChildNodes(
        { key: 'databases', categoryId: 'databases', titleKey: '', count: 0 },
        FACETS[1].buckets,
      ),
    });
    expect(findEstateNode(tree, 'databases:service:postgres')?.service).toBe('postgres');
    expect(findEstateNode(tree, 'nope')).toBeUndefined();
  });

  it('derives the highlighted category from entityType filters and estate= query', () => {
    expect(selectedEstateFromFilters({ entityType: ['table'] })).toBe('databases');
    expect(
      selectedEstateFromFilters({
        entityType: ['database', 'databaseSchema', 'storedProcedure', 'table'],
      }),
    ).toBe('databases');
    expect(selectedEstateFromFilters({})).toBe('');
    expect(estateFromQuery({ estate: 'contextCenter' })).toBe('contextCenter');
    expect(estateFromQuery({ estate: 'nope' })).toBe('');
  });

  it('builds a browse-path crumb list from estate + service/database/schema filters', () => {
    expect(
      browsePathLabels(
        { service: ['mysql'], database: ['default'], schema: ['marts'] },
        'databases',
      ),
    ).toEqual([
      { key: 'databases', label: 'explore.estate.databases' },
      { key: 'service:mysql', label: 'mysql' },
      { key: 'database:default', label: 'default' },
      { key: 'schema:marts', label: 'marts' },
    ]);
  });
});
