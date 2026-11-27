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
  estateBucketsFromAggregate,
  estateChildLevel,
  estateChildNodes,
  estateDrill,
  estateFromQuery,
  filtersForEstateNode,
  findEstateNode,
  selectedEstateFromFilters,
  serviceStyleIconUrl,
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
    id: 'serviceType',
    field: 'serviceType',
    buckets: [
      { key: 'mysql', count: 8 },
      { key: 'postgres', count: 6 },
    ],
  },
];

const DATABASE_TYPES = ['database', 'databaseSchema', 'storedProcedure', 'table', 'tableColumn'];

describe('browseEstate', () => {
  it('sums entityType buckets into Browse Estate category counts, including official tableColumn', () => {
    expect(countForTypes(FACETS, DATABASE_TYPES)).toBe(14);
    expect(countForTypes(FACETS, ['dashboardDataModel', 'dashboard', 'chart'])).toBe(4);
    expect(countForTypes(FACETS, ['topic'])).toBe(0);
  });

  it('renders the 12 pin roots in order and attaches serviceType children on the selected root', () => {
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
        key: 'databases:serviceType:mysql',
        categoryId: 'databases',
        serviceType: 'mysql',
        service: undefined,
        database: undefined,
        schema: undefined,
        titleKey: '',
        title: 'mysql',
        count: 8,
        iconUrl: undefined,
        isLeaf: false,
      },
      {
        key: 'databases:serviceType:postgres',
        categoryId: 'databases',
        serviceType: 'postgres',
        service: undefined,
        database: undefined,
        schema: undefined,
        titleKey: '',
        title: 'postgres',
        count: 6,
        iconUrl: undefined,
        isLeaf: false,
      },
    ]);
    expect(tree[1].isLeaf).toBe(false);
    expect(tree[1].children).toBeUndefined();
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
    expect(selectedEstateFromFilters({ entityType: ['dataProduct'] })).toBe('domains');
    expect(selectedEstateFromFilters({ entityType: ['domain'] })).toBe('');
    expect(selectedEstateFromFilters({ entityType: ['tableColumn'] })).toBe('databases');
  });

  it('maps a category click onto Lucene entityType filters and a serviceType child onto serviceType=', () => {
    const root = buildEstateTree(FACETS)[0];
    expect(estateChildLevel(root)).toBe('serviceType');
    expect(filtersForEstateNode(root, { tagFqn: ['PII.Sensitive'] })).toEqual({
      tagFqn: ['PII.Sensitive'],
      entityType: DATABASE_TYPES,
    });
    const serviceTypeNode = buildEstateTree(FACETS, {
      databases: estateChildNodes(
        { key: 'databases', categoryId: 'databases', titleKey: '', count: 0 },
        FACETS[1].buckets,
      ),
    })
      .at(0)
      ?.children?.[0];
    expect(serviceTypeNode).toBeTruthy();
    expect(filtersForEstateNode(serviceTypeNode!, {})).toEqual({
      entityType: DATABASE_TYPES,
      serviceType: ['mysql'],
    });
  });

  it('turns a loaded-but-empty node into a leaf and drills serviceType to service to database to schema to entity type', () => {
    const empty = buildEstateTree(FACETS, { databases: [] });
    expect(empty[0].isLeaf).toBe(true);
    expect(empty[0].children).toEqual([]);

    const root: EstateNode = { key: 'databases', categoryId: 'databases', titleKey: '', count: 14 };
    expect(estateDrill(root)?.facet).toBe('serviceType');

    const serviceTypeNode: EstateNode = {
      key: 'databases:serviceType:mysql',
      categoryId: 'databases',
      serviceType: 'mysql',
      titleKey: '',
      count: 8,
      isLeaf: false,
    };
    expect(estateChildLevel(serviceTypeNode)).toBe('service');
    expect(estateDrill(serviceTypeNode)).toEqual({
      facet: 'service',
      filters: {
        entityType: DATABASE_TYPES,
        serviceType: ['mysql'],
      },
    });

    const serviceNode: EstateNode = {
      key: 'databases:serviceType:mysql:service:isales_mysql',
      categoryId: 'databases',
      serviceType: 'mysql',
      service: 'isales_mysql',
      titleKey: '',
      count: 8,
      isLeaf: false,
    };
    expect(estateDrill(serviceNode)).toEqual({
      facet: 'database',
      filters: {
        entityType: DATABASE_TYPES,
        serviceType: ['mysql'],
        service: ['isales_mysql'],
      },
    });
    const databaseNode: EstateNode = {
      ...serviceNode,
      key: `${serviceNode.key}:database:analytics`,
      database: 'analytics',
    };
    expect(estateDrill(databaseNode)?.facet).toBe('schema');
    const schemaNode: EstateNode = {
      ...databaseNode,
      key: `${databaseNode.key}:schema:marts`,
      schema: 'marts',
    };
    expect(estateDrill(schemaNode)?.facet).toBe('entityType');
    expect(filtersForEstateNode(schemaNode, {})).toEqual({
      entityType: DATABASE_TYPES,
      serviceType: ['mysql'],
      service: ['isales_mysql'],
      database: ['analytics'],
      schema: ['marts'],
    });
    const leafNode = estateChildNodes(schemaNode, [{ key: 'table', count: 12 }])[0];
    expect(leafNode.isLeaf).toBe(true);
    expect(leafNode.titleKey).toBe('explore.entity.table');
    expect(estateDrill(leafNode)).toBeNull();
    expect(filtersForEstateNode(leafNode, {})).toEqual({
      entityType: ['table'],
      serviceType: ['mysql'],
      service: ['isales_mysql'],
      database: ['analytics'],
      schema: ['marts'],
    });

    const dashboardService: EstateNode = {
      key: 'dashboards:serviceType:superset:service:superset',
      categoryId: 'dashboards',
      serviceType: 'superset',
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
    expect(findEstateNode(tree, 'databases:serviceType:postgres')?.serviceType).toBe('postgres');
    expect(findEstateNode(tree, 'nope')).toBeUndefined();
  });

  it('derives the highlighted category from entityType filters and estate= query', () => {
    expect(selectedEstateFromFilters({ entityType: ['table'] })).toBe('databases');
    expect(
      selectedEstateFromFilters({
        entityType: DATABASE_TYPES,
      }),
    ).toBe('databases');
    expect(selectedEstateFromFilters({})).toBe('');
    expect(estateFromQuery({ estate: 'contextCenter' })).toBe('contextCenter');
    expect(estateFromQuery({ estate: 'nope' })).toBe('');
  });

  it('builds a browse-path crumb list from estate + serviceType/service/database/schema filters', () => {
    expect(
      browsePathLabels(
        { serviceType: ['mysql'], service: ['isales_mysql'], database: ['default'], schema: ['marts'] },
        'databases',
      ),
    ).toEqual([
      { key: 'databases', label: 'explore.estate.databases' },
      { key: 'serviceType:mysql', label: 'mysql' },
      { key: 'service:isales_mysql', label: 'isales_mysql' },
      { key: 'database:default', label: 'default' },
      { key: 'schema:marts', label: 'marts' },
    ]);
  });

  it('sorts estate buckets alphabetically and carries service.style.iconURL from aggregate top-hits', () => {
    const parent: EstateNode = {
      key: 'databases:serviceType:mysql',
      categoryId: 'databases',
      serviceType: 'mysql',
      titleKey: '',
      count: 8,
    };
    const children = estateChildNodes(parent, [
      { key: 'zeta', count: 1, iconUrl: 'https://cdn.example/zeta.svg' },
      { key: 'Alpha', count: 2 },
    ]);
    expect(children.map((child) => child.title)).toEqual(['Alpha', 'zeta']);
    expect(children[1].iconUrl).toBe('https://cdn.example/zeta.svg');
    expect(children[1].service).toBe('zeta');
    expect(children[1].serviceType).toBe('mysql');

    expect(
      serviceStyleIconUrl({
        'top_hits#top': {
          hits: { hits: [{ _source: { service: { style: { iconURL: 'https://cdn.example/logo.svg' } } } }] },
        },
      }),
    ).toBe('https://cdn.example/logo.svg');
    expect(
      estateBucketsFromAggregate(
        {
          aggregations: {
            'sterms#service.displayName.keyword': {
              buckets: [
                {
                  key: 'isales_mysql',
                  doc_count: 10,
                  'top_hits#top': {
                    hits: { hits: [{ _source: { service: { style: { iconURL: 'https://cdn.example/logo.svg' } } } }] },
                  },
                },
              ],
            },
          },
        },
        'service.displayName.keyword',
      ),
    ).toEqual([{ key: 'isales_mysql', count: 10, iconUrl: 'https://cdn.example/logo.svg' }]);
  });
});
