/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { FacetId } from '@/catalog/searchFacets';

/**
 * Tag assets tab query builders — pin ports, no product invention.
 *
 * Sources (pin a3012259ca, verified against b174e78c):
 * - getTagAssetsQueryFilter: utils/TagsPureUtils.ts:437-443, with
 *   getTagUsageAggregationField at :405-417 and EntityFields at
 *   enums/AdvancedSearch.enum.ts (TAG 'tags.tagFQN', TIER
 *   'tier.tagFQN', CERTIFICATION 'certification.tagLabel.tagFQN').
 * - getQueryFilterToExcludeTermsAndEntities: TagsPureUtils.ts:180-220.
 * - getAssetsPageQuickFilters (TAG branch):
 *   utils/AdvancedSearchPureUtils.ts:49-50, with
 *   TAG_ASSETS_DROPDOWN_ITEMS at constants/AdvancedSearch.constants.ts:392-424.
 * - getQuickFilterQuery shape (bool.must of per-field bool.should
 *   term unions): utils/ExplorePureUtils.ts, already ported for
 *   articles at catalog/contextCenterArticles.ts.
 * - getCombinedQueryFilterObject: utils/ExplorePage/ExplorePageUtils.ts:64 — merges
 *   query_filter objects across their bool.must / bool.must_not /
 *   bool.should arrays, de-duplicating identical clauses (lodash isEqual).
 */

/** Pin constants/constants.ts: TIER_CATEGORY / CERTIFICATION_CATEGORY. */
export const TIER_CLASSIFICATION_NAME = 'Tier';
export const CERTIFICATION_CLASSIFICATION_NAME = 'Certification';

export type TagAssetsQueryFilter = Record<string, unknown>;

/**
 * Official getTermQuery (utils/SearchPureUtils.ts:181), minimal port:
 * one term clause per field, wrapped in bool.must. Only the must form
 * is needed on this tab; the full options bag is not ported.
 */
export function getTermQuery(terms: Record<string, string>): TagAssetsQueryFilter {
  return {
    query: {
      bool: {
        must: Object.entries(terms).map(([field, value]) => ({ term: { [field]: value } })),
      },
    },
  };
}

/**
 * Official getTagUsageAggregationField (TagsPureUtils.ts:405-417):
 * Tier and Certification are first-class entity fields, indexed
 * outside the `tags` array, so the asset query must target their own
 * field — otherwise it matches nothing.
 */
export function getTagUsageAggregationField(classificationName: string): string {
  if (classificationName === TIER_CLASSIFICATION_NAME) {
    return 'tier.tagFQN';
  }
  if (classificationName === CERTIFICATION_CLASSIFICATION_NAME) {
    return 'certification.tagLabel.tagFQN';
  }
  return 'tags.tagFQN';
}

/**
 * Official getTagAssetsQueryFilter (TagsPureUtils.ts:437-443): the
 * classification name is the first FQN segment.
 */
export function getTagAssetsQueryFilter(fqn: string): TagAssetsQueryFilter {
  const [classificationName] = fqn.split('.');
  return getTermQuery({ [getTagUsageAggregationField(classificationName)]: fqn });
}

/**
 * Official getExcludedIndexesBasedOnEntityTypeEditTagPermission
 * (TagsPureUtils.ts:223-369): the 24 entity types whose resource-level
 * EditTags grant decides whether the type may carry this tag. The
 * strings double as search-index `entityType` values and as permission
 * resource names — pin uses the same EntityType values for both.
 */
export const TAG_ASSET_EDIT_PERMISSION_ENTITY_TYPES = [
  'table',
  'topic',
  'dashboard',
  'mlmodel',
  'pipeline',
  'container',
  'searchIndex',
  'apiService',
  'apiEndpoint',
  'apiCollection',
  'dashboardDataModel',
  'storedProcedure',
  'database',
  'databaseService',
  'databaseSchema',
  'messagingService',
  'dashboardService',
  'mlmodelService',
  'pipelineService',
  'storageService',
  'searchService',
  'glossary',
  'glossaryTerm',
  'domain',
] as const;

/**
 * Entity types the asset picker never offers (TagsPureUtils.ts:180-220):
 * classifications, test suites/cases and their resolution records,
 * tags themselves, and data products — plus every type the viewer
 * cannot EditTags on, passed in by the caller.
 */
export const TAG_ASSET_PICKER_EXCLUDED_ENTITY_TYPES = [
  'classification',
  'testSuite',
  'testCase',
  'testCaseResolutionStatus',
  'testCaseResult',
  'tag',
  'dataProduct',
] as const;

/**
 * Official getQueryFilterToExcludeTermsAndEntities
 * (TagsPureUtils.ts:180-220), verbatim shape: already-tagged assets
 * are excluded by `tags.tagFQN`, and the uneditable / never-offered
 * entity types by a `terms: {entityType}` clause.
 */
export function getQueryFilterToExcludeTermsAndEntities(
  fqn: string,
  excludeEntityTypes: string[] = [],
): TagAssetsQueryFilter {
  return {
    query: {
      bool: {
        must: [
          {
            bool: {
              must_not: [{ term: { 'tags.tagFQN': fqn } }],
            },
          },
          {
            bool: {
              must_not: [
                {
                  terms: {
                    entityType: [...TAG_ASSET_PICKER_EXCLUDED_ENTITY_TYPES, ...excludeEntityTypes],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

export interface TagAssetsQuickFilterField {
  /** Facet id driving the value list (catalog/searchFacets.ts). */
  facetId: FacetId;
  /** ES term key the selection filters on. */
  field: string;
  /** Locale key for the field label (explore.facets.*). */
  labelKey: string;
}

/**
 * Official TAG_ASSETS_DROPDOWN_ITEMS
 * (AdvancedSearch.constants.ts:392-424), in pin order.
 */
export const TAG_ASSETS_QUICK_FILTER_FIELDS: TagAssetsQuickFilterField[] = [
  { facetId: 'entityType', field: 'entityType', labelKey: 'explore.facets.entityType' },
  { facetId: 'domain', field: 'domains.displayName.keyword', labelKey: 'explore.facets.domain' },
  { facetId: 'owner', field: 'ownerDisplayName', labelKey: 'explore.facets.owner' },
  { facetId: 'tagFqn', field: 'tags.tagFQN', labelKey: 'explore.facets.tagFqn' },
  { facetId: 'tier', field: 'tier.tagFQN', labelKey: 'explore.facets.tier' },
  { facetId: 'service', field: 'service.displayName.keyword', labelKey: 'explore.facets.service' },
  { facetId: 'serviceType', field: 'serviceType', labelKey: 'explore.facets.serviceType' },
];

export type TagAssetsQuickFilterSelections = Partial<Record<FacetId, string[]>>;

/**
 * Official getQuickFilterQuery (ExplorePureUtils.ts): within one
 * field the selected values are a bool.should term union, across
 * fields a bool.must intersection; no selection at all yields
 * undefined.
 */
export function buildTagAssetsQuickFilterQuery(
  selections: TagAssetsQuickFilterSelections,
): TagAssetsQueryFilter | undefined {
  const must: Array<Record<string, unknown>> = [];
  for (const field of TAG_ASSETS_QUICK_FILTER_FIELDS) {
    const values = selections[field.facetId] ?? [];
    if (values.length === 0) {
      continue;
    }
    must.push({
      bool: { should: values.map((value) => ({ term: { [field.field]: value } })) },
    });
  }
  return must.length === 0 ? undefined : { query: { bool: { must } } };
}

function boolClauses(
  filter: TagAssetsQueryFilter | undefined,
  field: 'must' | 'must_not' | 'should',
): Array<Record<string, unknown>> {
  if (!filter) {
    return [];
  }
  const query = filter.query as Record<string, unknown> | undefined;
  const bool = query?.bool as Record<string, unknown> | undefined;
  const clauses = bool?.[field];
  if (clauses === undefined) {
    return [];
  }
  // Pin getCombinedFields wraps a non-array clause (isArray check).
  return Array.isArray(clauses)
    ? (clauses as Array<Record<string, unknown>>)
    : [clauses as Record<string, unknown>];
}

/** Order-insensitive deep equality for JSON-shaped values (pin lodash isEqual). */
function deepEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqualJson(item, right[index]))
    );
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left as Record<string, unknown>);
    const rightRecord = right as Record<string, unknown>;
    return (
      leftEntries.length === Object.keys(rightRecord).length &&
      leftEntries.every(([key, value]) => key in rightRecord && deepEqualJson(value, rightRecord[key]))
    );
  }
  return false;
}

/** Pin getCombinedFields (ExplorePageUtils.ts:45-62): concat + uniqWith(isEqual). */
function combineBoolClauses(
  field: 'must' | 'must_not' | 'should',
  filters: Array<TagAssetsQueryFilter | undefined>,
): Array<Record<string, unknown>> {
  const combined: Array<Record<string, unknown>> = [];
  for (const filter of filters) {
    for (const clause of boolClauses(filter, field)) {
      if (!combined.some((existing) => deepEqualJson(existing, clause))) {
        combined.push(clause);
      }
    }
  }
  return combined;
}

/**
 * Official getCombinedQueryFilterObject
 * (utils/ExplorePage/ExplorePageUtils.ts:64): merges query_filter
 * objects across their bool.must / bool.must_not / bool.should
 * arrays, de-duplicating identical clauses, and omits empty lanes.
 * Nothing to merge yields undefined.
 */
export function combineQueryFilters(
  ...filters: Array<TagAssetsQueryFilter | undefined>
): TagAssetsQueryFilter | undefined {
  const must = combineBoolClauses('must', filters);
  const mustNot = combineBoolClauses('must_not', filters);
  const should = combineBoolClauses('should', filters);
  if (must.length === 0 && mustNot.length === 0 && should.length === 0) {
    return undefined;
  }
  return {
    query: {
      bool: {
        ...(must.length > 0 ? { must } : {}),
        ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
        ...(should.length > 0 ? { should } : {}),
      },
    },
  };
}
