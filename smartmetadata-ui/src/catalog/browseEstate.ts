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
  titleKey: string;
  title?: string;
  count: number;
  residualRoute?: string;
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

export function buildEstateTree(
  facets: SearchFacet[],
  selectedCategory = '',
  serviceBuckets: FacetBucket[] = [],
): EstateNode[] {
  return ESTATE_CATEGORIES.map((category) => {
    const node: EstateNode = {
      key: category.id,
      categoryId: category.id,
      titleKey: category.titleKey,
      count: countForTypes(facets, category.entityTypes),
      residualRoute: category.residualRoute,
    };
    if (selectedCategory === category.id && category.expandable && serviceBuckets.length) {
      node.children = serviceBuckets.map((bucket) => ({
        key: `${category.id}:service:${bucket.key}`,
        categoryId: category.id,
        service: bucket.key,
        titleKey: '',
        title: bucket.key,
        count: bucket.count,
      }));
    }
    return node;
  });
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
