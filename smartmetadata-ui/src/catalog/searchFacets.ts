/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export const FACET_IDS = [
  'entityType',
  'serviceType',
  'service',
  'database',
  'schema',
  'tagFqn',
  'owner',
  'domain',
  'tier',
  'certification',
  'dataProduct',
  // Per-tab facets (pin SearchClassBase.getDropDownItems /
  // AdvancedSearch.constants.ts): none of these has a page aggregation —
  // their options come from POST /v1/search/aggregate (see
  // isAggregateSourcedFacet) — except entityStatus, which is likewise
  // aggregate-only. They are real filter ids: FILTER_LUCENE_FIELD,
  // filtersFromQuery and composeSearchQuery all key off this list.
  'column',
  'tableType',
  'columnDescriptionStatus',
  'dataType',
  'tableName',
  'classification',
  'glossary',
  'entityStatus',
  'dataModel',
  'chart',
  'project',
  'task',
  'schemaField',
  'field',
  'feature',
  'requestSchemaField',
  'responseSchemaField',
  'containerColumn',
  'dataModelType',
] as const;

/**
 * Pin AdvancedSearch.constants.ts:503 — the sentinel value for a "No X"
 * (field missing) selection. It travels in the URL like any other filter
 * value but is never composed into Lucene `q`; it becomes a structured
 * `must_not.exists` clause in `query_filter` (see nullExistsQueryFilter).
 */
export const NULL_OPTION_KEY = 'OM_NULL_FIELD';

/**
 * Pin explore.constants.ts:29-37 SUPPORTED_EMPTY_FILTER_FIELDS: the only
 * fields whose dropdown offers a "No X" option.
 */
export const SUPPORTED_EMPTY_FILTER_FIELDS: readonly FacetId[] = [
  'owner',
  'domain',
  'dataProduct',
  'tier',
  'tagFqn',
  'certification',
];

/**
 * Facets whose options never come from the page aggregations (no global
 * aggregation exists for their field — see PIN-MEMO §1.3): their options
 * are fetched on demand from POST /v1/search/aggregate.
 */
export const AGGREGATE_SOURCED_FACET_IDS: ReadonlySet<FacetId> = new Set([
  'column',
  'tableType',
  'columnDescriptionStatus',
  'dataType',
  'tableName',
  'classification',
  'glossary',
  'entityStatus',
  'dataModel',
  'chart',
  'project',
  'task',
  'schemaField',
  'field',
  'feature',
  'requestSchemaField',
  'responseSchemaField',
  'containerColumn',
  'dataModelType',
]);

export function isAggregateSourcedFacet(id: FacetId): boolean {
  return AGGREGATE_SOURCED_FACET_IDS.has(id);
}

/**
 * Top-bar chips for the all-tab (pin DATA_ASSET_DROPDOWN_ITEMS): the only
 * tab set with entityType and certification. Every other tab's set comes
 * from facetsForTab (catalog/exploreTabs.ts); this list stays as the
 * chips' default for callers without a tab (e.g. article quick filters
 * pass their own facetIds).
 */
export const CHIP_FACET_IDS = [
  'entityType',
  'domain',
  'dataProduct',
  'owner',
  'tagFqn',
  'tier',
  'certification',
  'service',
  'serviceType',
] as const;

export type FacetId = (typeof FACET_IDS)[number];

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchFacet {
  id: FacetId;
  field: string;
  buckets: FacetBucket[];
}

/**
 * Names from server searchSettings.json (and typed ES/OS prefixes like
 * `sterms#`) that we can filter with documented Lucene `q=` terms.
 *
 * Pin's table/column dropdown fields are the display-name variants
 * (`database.displayName.keyword` / `databaseSchema.displayName.keyword`,
 * AdvancedSearch.constants.ts TABLE_DROPDOWN_ITEMS / COLUMN_DROPDOWN_ITEMS),
 * so `database`/`schema` filter on display names and prefer the
 * `database.displayName` / `databaseSchema.displayName` aggregations; the
 * `name.keyword` aggregations stay as fallback sources with the same
 * filter field. `classificationTags` / `glossaryTags` are tag FQNs split
 * by provenance (server ParseTags), i.e. the same value space as
 * `tags.tagFQN`, so they are fallback sources of the tag facet — never the
 * classification/glossary dropdowns, which need
 * `classification.name.keyword` / `glossary.name.keyword` via the
 * aggregate endpoint (PIN-MEMO §1.4).
 */
const AGG_TO_FACET: Record<string, { id: FacetId; field: string }> = {
  entityType: { id: 'entityType', field: 'entityType' },
  'entityType.keyword': { id: 'entityType', field: 'entityType' },
  serviceType: { id: 'serviceType', field: 'serviceType' },
  'service.displayName.keyword': { id: 'service', field: 'service.displayName.keyword' },
  'database.name.keyword': { id: 'database', field: 'database.displayName.keyword' },
  'database.displayName': { id: 'database', field: 'database.displayName.keyword' },
  'databaseSchema.name.keyword': { id: 'schema', field: 'databaseSchema.displayName.keyword' },
  'databaseSchema.displayName': { id: 'schema', field: 'databaseSchema.displayName.keyword' },
  'tags.tagFQN': { id: 'tagFqn', field: 'tags.tagFQN' },
  classificationTags: { id: 'tagFqn', field: 'tags.tagFQN' },
  glossaryTags: { id: 'tagFqn', field: 'tags.tagFQN' },
  ownerDisplayName: { id: 'owner', field: 'ownerDisplayName' },
  'domains.displayName.keyword': { id: 'domain', field: 'domains.displayName.keyword' },
  'tier.tagFQN': { id: 'tier', field: 'tier.tagFQN' },
  'certification.tagLabel.tagFQN': { id: 'certification', field: 'certification.tagLabel.tagFQN' },
  'dataProducts.displayName.keyword': { id: 'dataProduct', field: 'dataProducts.displayName.keyword' },
};

/**
 * Aggregation names that win a same-length tie for their facet: the
 * display-name variants are the pin dropdown source (see AGG_TO_FACET),
 * so when both name and displayName aggregations return the same number
 * of buckets the display-name list is the facet's options. A strictly
 * longer list still wins outright — a longer fallback list is more
 * complete than a shorter preferred one.
 */
const PREFERRED_AGGREGATION_NAMES: ReadonlySet<string> = new Set([
  'database.displayName',
  'databaseSchema.displayName',
]);

/**
 * Aggregation names that map to one facet. Official's ExploreQuickFilters
 * keeps two entity-type filter keys (`entityType`, `entityType.keyword`):
 * the facet's own aggregation names are this console's record of those
 * variants, and the self-exclusion in `composeFacetQuery` is derived
 * from them — never from a hardcoded list.
 */
export function aggregationFieldNamesForFacet(id: FacetId): string[] {
  return Object.entries(AGG_TO_FACET)
    .filter(([, mapped]) => mapped.id === id)
    .map(([name]) => name);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stripAggPrefix(name: string): string {
  const hash = name.indexOf('#');
  return hash >= 0 ? name.slice(hash + 1) : name;
}

function readBuckets(node: Record<string, unknown>): FacetBucket[] {
  if (!Array.isArray(node.buckets)) {
    return [];
  }
  return node.buckets.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const key = typeof rec.key === 'string' ? rec.key : rec.key !== undefined ? String(rec.key) : '';
    const count = typeof rec.doc_count === 'number' ? rec.doc_count : 0;
    return key ? [{ key, count }] : [];
  });
}

export function mapSearchAggregations(payload: unknown): SearchFacet[] {
  const root = asRecord(payload);
  const aggregations = asRecord(root?.aggregations);
  if (!aggregations) {
    return [];
  }

  const byId = new Map<FacetId, SearchFacet>();
  const byIdScore = new Map<FacetId, number>();
  for (const [rawName, rawNode] of Object.entries(aggregations)) {
    const node = asRecord(rawNode);
    if (!node) {
      continue;
    }
    const name = stripAggPrefix(rawName);
    const mapped = AGG_TO_FACET[name];
    if (!mapped) {
      continue;
    }
    const buckets = readBuckets(node);
    if (!buckets.length) {
      continue;
    }
    // Longest list wins; a preferred aggregation (display-name source)
    // wins a same-length tie. See PREFERRED_AGGREGATION_NAMES.
    const score = buckets.length + (PREFERRED_AGGREGATION_NAMES.has(name) ? 0.5 : 0);
    if ((byIdScore.get(mapped.id) ?? -1) >= score) {
      continue;
    }
    byIdScore.set(mapped.id, score);
    byId.set(mapped.id, { id: mapped.id, field: mapped.field, buckets });
  }

  return FACET_IDS.flatMap((id) => {
    const facet = byId.get(id);
    return facet ? [facet] : [];
  });
}
