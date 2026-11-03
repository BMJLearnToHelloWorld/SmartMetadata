/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { FacetBucket, SearchFacet } from './searchFacets';
import type { SearchFilters } from './searchQuery';

export interface EstateCategory {
  id: string;
  titleKey: string;
  entityTypes: string[];
  expandable: boolean;
  residualRoute?: string;
}

/**
 * Browse Estate roots mirror OM ExploreTree categories. Counts come from
 * entityType aggregations already returned by GET /v1/search/query — no extra
 * browse API. Context Center has no catalog index in this console.
 */
export const ESTATE_CATEGORIES: EstateCategory[] = [
  {
    id: 'databases',
    titleKey: 'explore.estate.databases',
    entityTypes: ['database', 'databaseSchema', 'storedProcedure', 'table'],
    expandable: true,
  },
  {
    id: 'dashboards',
    titleKey: 'explore.estate.dashboards',
    entityTypes: ['dashboardDataModel', 'dashboard', 'chart'],
    expandable: true,
  },
  {
    id: 'pipelines',
    titleKey: 'explore.estate.pipelines',
    entityTypes: ['pipeline'],
    expandable: true,
  },
  {
    id: 'topics',
    titleKey: 'explore.estate.topics',
    entityTypes: ['topic'],
    expandable: true,
  },
  {
    id: 'mlmodels',
    titleKey: 'explore.estate.mlmodels',
    entityTypes: ['mlmodel'],
    expandable: true,
  },
  {
    id: 'containers',
    titleKey: 'explore.estate.containers',
    entityTypes: ['container'],
    expandable: true,
  },
  {
    id: 'searchIndexes',
    titleKey: 'explore.estate.searchIndexes',
    entityTypes: ['searchIndex'],
    expandable: true,
  },
  {
    id: 'governance',
    titleKey: 'explore.estate.governance',
    entityTypes: ['tag', 'glossaryTerm', 'metric'],
    expandable: false,
  },
  {
    id: 'domains',
    titleKey: 'explore.estate.domains',
    entityTypes: ['dataProduct', 'domain'],
    expandable: false,
    residualRoute: 'governance-domains',
  },
  {
    id: 'contextCenter',
    titleKey: 'explore.estate.contextCenter',
    entityTypes: [],
    expandable: false,
    residualRoute: 'context-center-overview',
  },
];

export interface EstateNode {
  key: string;
  categoryId: string;
  service?: string;
  database?: string;
  schema?: string;
  entityType?: string;
  titleKey: string;
  title?: string;
  count: number;
  residualRoute?: string;
  /**
   * Official ExploreTree rule, mirrored: the expand chevron shows while a
   * node's children are unknown or present, never once it is known to be a
   * leaf. Nodes whose children have not been loaded yet carry no children
   * key and isLeaf false, so every expandable category shows a switcher.
   */
  isLeaf?: boolean;
  children?: EstateNode[];
}

export function estateCategory(id: string): EstateCategory | undefined {
  return ESTATE_CATEGORIES.find((category) => category.id === id);
}

export function isResidualEstate(id: string): boolean {
  const category = estateCategory(id);
  return Boolean(category && category.entityTypes.length === 0 && category.residualRoute);
}

export function countForTypes(facets: SearchFacet[], entityTypes: string[]): number {
  const wanted = new Set(entityTypes);
  const facet = facets.find((item) => item.id === 'entityType');
  if (!facet || !wanted.size) {
    return 0;
  }
  return facet.buckets.reduce((sum, bucket) => (wanted.has(bucket.key) ? sum + bucket.count : sum), 0);
}

/**
 * Next drill level for a node, following the official ExploreTree bucket
 * chain. Databases drill service → database → schema → entity type; every
 * other expandable category drills service → entity type, and entity-type
 * buckets are leaves (selecting one filters to that type).
 */
export function estateChildLevel(node: EstateNode): 'service' | 'database' | 'schema' | 'entityType' | null {
  if (node.entityType) {
    return null;
  }
  if (node.schema) {
    return 'entityType';
  }
  if (node.database) {
    return 'schema';
  }
  if (node.service) {
    return node.categoryId === 'databases' ? 'database' : 'entityType';
  }
  return 'service';
}

export function estateChildNodes(parent: EstateNode, buckets: FacetBucket[]): EstateNode[] {
  const level = estateChildLevel(parent);
  if (!level) {
    return [];
  }
  return buckets.map((bucket) => {
    const base = {
      categoryId: parent.categoryId,
      titleKey: '',
      title: bucket.key,
      count: bucket.count,
    };
    switch (level) {
      case 'service':
        return { ...base, key: `${parent.key}:service:${bucket.key}`, service: bucket.key, isLeaf: false };
      case 'database':
        return {
          ...base,
          key: `${parent.key}:database:${bucket.key}`,
          service: parent.service,
          database: bucket.key,
          isLeaf: false,
        };
      case 'schema':
        return {
          ...base,
          key: `${parent.key}:schema:${bucket.key}`,
          service: parent.service,
          database: parent.database,
          schema: bucket.key,
          isLeaf: false,
        };
      case 'entityType':
        return {
          ...base,
          key: `${parent.key}:entityType:${bucket.key}`,
          service: parent.service,
          database: parent.database,
          schema: parent.schema,
          entityType: bucket.key,
          isLeaf: true,
        };
      default:
        // Unreachable: estateChildLevel only returns the four levels above.
        return { ...base, key: parent.key, isLeaf: true };
    }
  });
}

/** Facet to fetch and filters to scope it with for a node's next level. */
export function estateDrill(node: EstateNode): {
  facet: 'service' | 'database' | 'schema' | 'entityType';
  filters: SearchFilters;
} | null {
  const level = estateChildLevel(node);
  const category = estateCategory(node.categoryId);
  if (!level || !category) {
    return null;
  }
  const filters: SearchFilters = { entityType: [...category.entityTypes] };
  if (node.service) {
    filters.service = [node.service];
  }
  if (node.database) {
    filters.database = [node.database];
  }
  if (node.schema) {
    filters.schema = [node.schema];
  }
  return { facet: level, filters };
}

export function findEstateNode(nodes: EstateNode[], key: string): EstateNode | undefined {
  for (const node of nodes) {
    if (node.key === key) {
      return node;
    }
    const nested = node.children ? findEstateNode(node.children, key) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Roots plus lazily loaded children. `loadedChildren` maps a node key to the
 * children fetched for it; a key present with an empty array means loaded
 * and childless, which turns the node into a leaf, while an absent key means
 * not yet loaded, which keeps the chevron. A rebuild therefore drops loaded
 * children exactly like the official tree does.
 */
export function buildEstateTree(
  facets: SearchFacet[],
  loadedChildren: Record<string, EstateNode[]> = {},
): EstateNode[] {
  const resolve = (node: EstateNode): EstateNode => {
    const loaded = node.key in loadedChildren;
    const children = loaded ? loadedChildren[node.key] : node.children;
    return {
      ...node,
      isLeaf: loaded && (children?.length ?? 0) === 0 ? true : node.isLeaf,
      children: children?.map(resolve),
    };
  };
  return ESTATE_CATEGORIES.map((category) =>
    resolve({
      key: category.id,
      categoryId: category.id,
      titleKey: category.titleKey,
      count: countForTypes(facets, category.entityTypes),
      residualRoute: category.residualRoute,
      isLeaf: !category.expandable,
    }),
  );
}

export function selectedEstateFromFilters(filters: SearchFilters): string {
  const types = filters.entityType ?? [];
  if (!types.length) {
    return '';
  }
  const typeSet = new Set(types);
  const exact = ESTATE_CATEGORIES.find(
    (category) =>
      category.entityTypes.length === types.length && category.entityTypes.every((type) => typeSet.has(type)),
  );
  if (exact) {
    return exact.id;
  }
  return ESTATE_CATEGORIES.find((category) => category.entityTypes.some((type) => typeSet.has(type)))?.id ?? '';
}

export function filtersForEstateNode(node: EstateNode, current: SearchFilters): SearchFilters {
  const category = estateCategory(node.categoryId);
  if (!category) {
    return current;
  }
  const next: SearchFilters = { ...current };
  if (category.entityTypes.length) {
    next.entityType = [...category.entityTypes];
  } else {
    delete next.entityType;
  }
  if (node.service) {
    next.service = [node.service];
  } else {
    delete next.service;
  }
  if (node.database) {
    next.database = [node.database];
  } else {
    delete next.database;
  }
  if (node.schema) {
    next.schema = [node.schema];
  } else {
    delete next.schema;
  }
  // An entity-type leaf narrows the category's types down to that one type.
  if (node.entityType) {
    next.entityType = [node.entityType];
  }
  return next;
}

export function estateFromQuery(query: Record<string, unknown>): string {
  const raw = Array.isArray(query.estate) ? query.estate[0] : query.estate;
  return typeof raw === 'string' && estateCategory(raw) ? raw : '';
}

export function browsePathLabels(
  filters: SearchFilters,
  estateId: string,
): Array<{ key: string; label: string }> {
  const crumbs: Array<{ key: string; label: string }> = [];
  const category = estateCategory(estateId || selectedEstateFromFilters(filters));
  if (category) {
    crumbs.push({ key: category.id, label: category.titleKey });
  }
  const service = filters.service?.[0];
  if (service) {
    crumbs.push({ key: `service:${service}`, label: service });
  }
  const database = filters.database?.[0];
  if (database) {
    crumbs.push({ key: `database:${database}`, label: database });
  }
  const schema = filters.schema?.[0];
  if (schema) {
    crumbs.push({ key: `schema:${schema}`, label: schema });
  }
  return crumbs;
}
