/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { SearchFacet } from './searchFacets';
import type { SearchFilters } from './searchQuery';

export interface EstateStaticChild {
  entityType: string;
  titleKey: string;
}

export interface EstateCategory {
  id: string;
  titleKey: string;
  entityTypes: string[];
  expandable: boolean;
  /**
   * Pin getExploreTree static leaves (Governance → Glossaries/Tags/
   * Metrics, Domains → Data Product, Context Center → Articles):
   * fixed children, never lazy-loaded, each filtering to its type.
   */
  staticChildren?: EstateStaticChild[];
}

/**
 * Browse Estate roots mirror OM ExploreTree categories
 * (SearchClassBase.getExploreTree, pin a3012259ca): 12 roots, in pin
 * order. Counts come from entityType aggregations already returned by
 * GET /v1/search/query — no extra browse API.
 */
export const ESTATE_CATEGORIES: EstateCategory[] = [
  {
    id: 'databases',
    titleKey: 'explore.estate.databases',
    entityTypes: ['database', 'databaseSchema', 'storedProcedure', 'table', 'tableColumn'],
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
    id: 'apis',
    titleKey: 'explore.estate.apis',
    entityTypes: ['apiEndpoint', 'apiCollection'],
    expandable: true,
  },
  {
    id: 'drive',
    titleKey: 'explore.estate.drive',
    entityTypes: ['directory', 'file', 'spreadsheet', 'worksheet'],
    expandable: true,
  },
  {
    id: 'governance',
    titleKey: 'explore.estate.governance',
    entityTypes: ['tag', 'glossaryTerm', 'metric'],
    expandable: true,
    staticChildren: [
      { entityType: 'glossaryTerm', titleKey: 'explore.estate.glossaries' },
      { entityType: 'tag', titleKey: 'explore.estate.tags' },
      { entityType: 'metric', titleKey: 'explore.estate.metrics' },
    ],
  },
  {
    id: 'domains',
    titleKey: 'explore.estate.domains',
    entityTypes: ['dataProduct'],
    expandable: true,
    staticChildren: [{ entityType: 'dataProduct', titleKey: 'explore.estate.dataProducts' }],
  },
  {
    id: 'contextCenter',
    titleKey: 'explore.estate.contextCenter',
    entityTypes: ['page'],
    expandable: true,
    staticChildren: [{ entityType: 'page', titleKey: 'explore.estate.articles' }],
  },
];

export interface EstateNode {
  key: string;
  categoryId: string;
  serviceType?: string;
  service?: string;
  database?: string;
  schema?: string;
  entityType?: string;
  titleKey: string;
  title?: string;
  count: number;
  /**
   * Official service-instance logo: service.style.iconURL from
   * POST /v1/search/aggregate top-hits. Absent when the connector
   * has no custom style; the tree falls back to the serviceType logo.
   */
  iconUrl?: string;
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

/** Key of a category's static child for an entity type, or '' when it has none. */
export function staticChildKey(categoryId: string, entityType: string): string {
  const category = estateCategory(categoryId);
  return category?.staticChildren?.some((child) => child.entityType === entityType)
    ? `${categoryId}:static:${entityType}`
    : '';
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
 * Next drill level for a node, following official
 * ExplorePureUtils.getSubLevelHierarchyKey: category → SERVICE_TYPE →
 * SERVICE → (databases only) DATABASE → SCHEMA → ENTITY_TYPE leaf.
 * Entity-type buckets are leaves (selecting one filters to that type).
 */
export type EstateChildLevel = 'serviceType' | 'service' | 'database' | 'schema' | 'entityType';

export function estateChildLevel(node: EstateNode): EstateChildLevel | null {
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
  if (node.serviceType) {
    return 'service';
  }
  return 'serviceType';
}

export interface EstateBucket {
  key: string;
  count: number;
  iconUrl?: string;
}

/**
 * Official ExploreTree sorts aggregation buckets by key, case-insensitive
 * (localeCompare with sensitivity: 'base'), before building children.
 */
export function sortEstateBuckets(buckets: EstateBucket[]): EstateBucket[] {
  return [...buckets].sort((left, right) => left.key.localeCompare(right.key, undefined, { sensitivity: 'base' }));
}

export function estateChildNodes(parent: EstateNode, buckets: EstateBucket[]): EstateNode[] {
  const level = estateChildLevel(parent);
  if (!level) {
    return [];
  }
  return sortEstateBuckets(buckets).map((bucket) => {
    const base = {
      categoryId: parent.categoryId,
      serviceType: parent.serviceType,
      service: parent.service,
      database: parent.database,
      schema: parent.schema,
      titleKey: '',
      title: bucket.key,
      count: bucket.count,
      iconUrl: bucket.iconUrl,
    };
    switch (level) {
      case 'serviceType':
        return {
          ...base,
          key: `${parent.key}:serviceType:${bucket.key}`,
          serviceType: bucket.key,
          service: undefined,
          database: undefined,
          schema: undefined,
          iconUrl: undefined,
          isLeaf: false,
        };
      case 'service':
        return {
          ...base,
          key: `${parent.key}:service:${bucket.key}`,
          service: bucket.key,
          database: undefined,
          schema: undefined,
          isLeaf: false,
        };
      case 'database':
        return {
          ...base,
          key: `${parent.key}:database:${bucket.key}`,
          database: bucket.key,
          schema: undefined,
          iconUrl: undefined,
          isLeaf: false,
        };
      case 'schema':
        return {
          ...base,
          key: `${parent.key}:schema:${bucket.key}`,
          schema: bucket.key,
          iconUrl: undefined,
          isLeaf: false,
        };
      case 'entityType':
        return {
          ...base,
          key: `${parent.key}:entityType:${bucket.key}`,
          entityType: bucket.key,
          titleKey: `explore.entity.${bucket.key}`,
          title: undefined,
          iconUrl: undefined,
          isLeaf: true,
        };
      default:
        return { ...base, key: parent.key, isLeaf: true };
    }
  });
}

/** Facet to fetch and filters to scope it with for a node's next level. */
export function estateDrill(node: EstateNode): {
  facet: EstateChildLevel;
  filters: SearchFilters;
} | null {
  const level = estateChildLevel(node);
  const category = estateCategory(node.categoryId);
  if (!level || !category) {
    return null;
  }
  // Roots with static children (Governance, Domains, Context Center)
  // drill no further: their children are the fixed pin leaves.
  if (category.staticChildren?.length) {
    return null;
  }
  const filters: SearchFilters = { entityType: [...category.entityTypes] };
  if (node.serviceType) {
    filters.serviceType = [node.serviceType];
  }
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
 * children exactly like the official tree does. Static children (pin
 * getExploreTree leaves) are fixed data on the category, never fetched,
 * and survive rebuilds.
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
      isLeaf: !category.expandable,
      children: category.staticChildren?.map((child) => ({
        key: `${category.id}:static:${child.entityType}`,
        categoryId: category.id,
        entityType: child.entityType,
        titleKey: child.titleKey,
        count: countForTypes(facets, [child.entityType]),
        isLeaf: true,
      })),
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


/**
 * Official ExploreTree selectedKeys follow the full browse-path key, including
 * the serviceType segment (`category:serviceType:x:service:y:…`). The selected
 * key is the deepest path segment present in the current filters.
 */
export function selectedEstatePathKeys(filters: SearchFilters, estateId: string): string[] {
  if (!estateId) {
    return [];
  }
  const category = estateCategory(estateId);
  const keys = [estateId];
  if (!category) {
    return keys;
  }
  if (category.staticChildren?.length) {
    const types = filters.entityType ?? [];
    if (types.length === 1) {
      const child = category.staticChildren.find((item) => item.entityType === types[0]);
      if (child) {
        keys.push(`${estateId}:static:${types[0]}`);
      }
    }
    return keys;
  }
  const serviceType = filters.serviceType?.[0];
  const service = filters.service?.[0];
  const database = filters.database?.[0];
  const schema = filters.schema?.[0];
  if (serviceType) {
    keys.push(`${keys[keys.length - 1]}:serviceType:${serviceType}`);
  }
  if (service) {
    keys.push(`${keys[keys.length - 1]}:service:${service}`);
  }
  if (database) {
    keys.push(`${keys[keys.length - 1]}:database:${database}`);
  }
  if (schema) {
    keys.push(`${keys[keys.length - 1]}:schema:${schema}`);
  }
  const types = filters.entityType ?? [];
  const categoryWide =
    types.length === category.entityTypes.length &&
    category.entityTypes.every((type) => types.includes(type));
  if (types.length === 1 && !categoryWide) {
    keys.push(`${keys[keys.length - 1]}:entityType:${types[0]}`);
  }
  return keys;
}

export function selectedEstateNodeKey(filters: SearchFilters, estateId: string): string[] {
  const keys = selectedEstatePathKeys(filters, estateId);
  return keys.length ? [keys[keys.length - 1]] : [];
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
  if (node.serviceType) {
    next.serviceType = [node.serviceType];
  } else {
    delete next.serviceType;
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
  const serviceType = filters.serviceType?.[0];
  if (serviceType) {
    crumbs.push({ key: `serviceType:${serviceType}`, label: serviceType });
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

export function serviceStyleIconUrl(bucket: {
  'top_hits#top'?: { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
}): string | undefined {
  const source = bucket['top_hits#top']?.hits?.hits?.[0]?._source;
  const service =
    source && typeof source.service === 'object' && source.service !== null
      ? (source.service as Record<string, unknown>)
      : undefined;
  const style =
    service && typeof service.style === 'object' && service.style !== null
      ? (service.style as Record<string, unknown>)
      : undefined;
  const iconURL = style?.iconURL;
  return typeof iconURL === 'string' && iconURL.trim() ? iconURL : undefined;
}

/** Official ExploreTree service-level aggregate size (SIZE.X_LARGE = 166). */
export const ESTATE_SERVICE_AGGREGATE_SIZE = 166;

/** Map POST /v1/search/aggregate buckets, including service.style iconURL top-hits. */
export function estateBucketsFromAggregate(payload: unknown, fieldName: string): EstateBucket[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const aggregations = (payload as { aggregations?: Record<string, { buckets?: Array<Record<string, unknown>> }> })
    .aggregations;
  if (!aggregations) {
    return [];
  }
  for (const [rawName, node] of Object.entries(aggregations)) {
    const name = rawName.startsWith('sterms#') ? rawName.slice('sterms#'.length) : rawName;
    if (name !== fieldName || !node || !Array.isArray(node.buckets)) {
      continue;
    }
    return node.buckets.flatMap((item) => {
      const key = item.key === undefined || item.key === null ? '' : String(item.key);
      if (!key) {
        return [];
      }
      const count = typeof item.doc_count === 'number' ? item.doc_count : 0;
      const iconUrl = serviceStyleIconUrl(
        item as { 'top_hits#top'?: { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } } },
      );
      return iconUrl ? [{ key, count, iconUrl }] : [{ key, count }];
    });
  }
  return [];
}
