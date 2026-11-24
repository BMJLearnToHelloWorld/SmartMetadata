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

  it('renders the 12 pin roots in order and attaches service children on the selected root', () => {
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
      'apis',
      'drive',
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
    // B2-E5b (D15/D16): Governance/Domains/Context Center are expandable
    // now, with the pin's static leaf children — no residual routes left.
    expect(tree.find((node) => node.key === 'governance')?.isLeaf).toBe(false);
    expect(tree.find((node) => node.key === 'governance')?.children?.map((child) => child.key)).toEqual([
      'governance:static:glossaryTerm',
      'governance:static:tag',
      'governance:static:metric',
    ]);
    expect(tree.find((node) => node.key === 'domains')?.children?.map((child) => child.key)).toEqual([
      'domains:static:dataProduct',
    ]);
    expect(tree.find((node) => node.key === 'contextCenter')?.children?.map((child) => child.key)).toEqual([
      'contextCenter:static:page',
    ]);
    expect(tree.find((node) => node.key === 'contextCenter')).not.toHaveProperty('residualRoute');
  });

  it('does not drill static-children roots and narrows a static leaf to its single type', () => {
    const tree = buildEstateTree(FACETS);
    const governance = tree.find((node) => node.key === 'governance')!;
    expect(estateDrill(governance)).toBeNull();
    const glossaries = governance.children!.find((child) => child.entityType === 'glossaryTerm')!;
    expect(glossaries.isLeaf).toBe(true);
    expect(estateDrill(glossaries)).toBeNull();
    expect(filtersForEstateNode(glossaries, {})).toEqual({ entityType: ['glossaryTerm'] });
    const dataProduct = tree
      .find((node) => node.key === 'domains')!
      .children!.find((child) => child.entityType === 'dataProduct')!;
    expect(filtersForEstateNode(dataProduct, {})).toEqual({ entityType: ['dataProduct'] });
    const articles = tree
      .find((node) => node.key === 'contextCenter')!
      .children!.find((child) => child.entityType === 'page')!;
    expect(filtersForEstateNode(articles, {})).toEqual({ entityType: ['page'] });
  });

  it('derives the highlighted category for the new APIs and Drive roots', () => {
    expect(selectedEstateFromFilters({ entityType: ['apiEndpoint'] })).toBe('apis');
    expect(selectedEstateFromFilters({ entityType: ['apiEndpoint', 'apiCollection'] })).toBe('apis');
    expect(selectedEstateFromFilters({ entityType: ['file'] })).toBe('drive');
    expect(selectedEstateFromFilters({ entityType: ['directory', 'file', 'spreadsheet', 'worksheet'] })).toBe(
      'drive',
    );
    // Domains narrowed to dataProduct only (pin childEntities); a bare
    // domain filter no longer resolves to the Domains root.
    expect(selectedEstateFromFilters({ entityType: ['dataProduct'] })).toBe('domains');
    expect(selectedEstateFromFilters({ entityType: ['domain'] })).toBe('');
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
