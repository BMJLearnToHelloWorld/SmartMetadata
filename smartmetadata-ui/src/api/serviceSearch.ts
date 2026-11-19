/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs } from '@/api/json';
import { mapServiceStyle, mapServiceTags } from '@/api/serviceCommon';
import { getQueryWithSlash } from '@/catalog/queryFilter';
import type { CatalogService, ServiceConnection, ServiceKind } from '@/types/ingestion';
import { apiRequest } from './client';

/**
 * Pin SearchIndex enum values (enums/search.enum.ts at a3012259ca),
 * camelCase throughout, for the indexes the service-detail surfaces
 * search. Only the indexes this batch uses are listed; the values
 * are the wire values, never snake_case.
 */
export const SERVICE_SEARCH_INDEX = {
  ALL: 'all',
  DATABASE: 'database',
  TOPIC: 'topic',
  DASHBOARD: 'dashboard',
  PIPELINE: 'pipeline',
  MLMODEL: 'mlmodel',
  CONTAINER: 'container',
  SEARCH_INDEX: 'searchIndex',
  API_COLLECTION: 'apiCollection',
  DIRECTORY: 'directory',
  DASHBOARD_DATA_MODEL: 'dashboardDataModel',
  INGESTION_PIPELINE: 'ingestionPipeline',
  FILE: 'file',
  SPREADSHEET: 'spreadsheet',
  // Service-entity indexes (pin SearchIndex enum, same file): the
  // services list search path (getSearchIndexFromService) queries
  // these, not the child-entity indexes above.
  DATABASE_SERVICE: 'databaseService',
  MESSAGING_SERVICE: 'messagingService',
  PIPELINE_SERVICE: 'pipelineService',
  SEARCH_SERVICE: 'searchService',
  DASHBOARD_SERVICE: 'dashboardService',
  ML_MODEL_SERVICE: 'mlModelService',
  STORAGE_SERVICE: 'storageService',
  DRIVE_SERVICE: 'driveService',
  API_SERVICE: 'apiService',
  METADATA_SERVICE: 'metadataService',
} as const;

export type ServiceSearchIndexValue =
  (typeof SERVICE_SEARCH_INDEX)[keyof typeof SERVICE_SEARCH_INDEX];

/** Normalized search envelope: hit sources, total, and stripped aggregations. */
export interface SearchQueryResponse {
  hits: Array<Record<string, unknown>>;
  total: number;
  aggregations?: Record<string, unknown>;
}

export interface SearchServiceIndexOptions {
  searchIndex: ServiceSearchIndexValue;
  /** Search text; '' and '**' both send an empty `q` (pin rawSearchQuery). */
  query?: string;
  /** 1-based page number; defaults to 1 (pin rawSearchQuery). */
  pageNumber?: number;
  /** Page size; defaults to 10 (pin rawSearchQuery). Callers pass the shared page size. */
  pageSize?: number;
  queryFilter?: Record<string, unknown>;
  postFilter?: Record<string, unknown>;
  sortField?: string;
  sortOrder?: string;
  /** Sent as `deleted`; defaults to false (pin rawSearchQuery). */
  includeDeleted?: boolean;
  trackTotalHits?: boolean;
  fetchSource?: boolean;
}

/**
 * Pin `omitDeep(data, isNil)` (utils/APIUtils.ts): Elasticsearch
 * responses use null for missing values; the whole envelope is
 * stripped of null/undefined recursively — object keys and array
 * elements alike — so missing values read as undefined downstream.
 * Empty objects and arrays survive: only nil values are omitted.
 */
function omitDeepNil(value: unknown): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const stripped = omitDeepNil(item);
      if (stripped !== null && stripped !== undefined) {
        out.push(stripped);
      }
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const stripped = omitDeepNil(child);
      if (stripped !== null && stripped !== undefined) {
        out[key] = stripped;
      }
    }
    return out;
  }
  return value;
}

/**
 * Pin `formatSearchQueryResponse` (rest/searchAPI.ts), equivalent
 * implementation: (1) deep nil-strip, (2) copy each hit `_source`
 * `entityType` to `type`, (3) strip the `sterms#` prefix from
 * aggregation keys. The flattened envelope carries the hit sources
 * directly, as every pin caller reads `hits.hits[]._source`.
 */
export function formatSearchQueryResponse(payload: unknown): SearchQueryResponse {
  const stripped = asRecord(omitDeepNil(payload));
  const hitsNode = asRecord(stripped?.hits);
  const rawHits = Array.isArray(hitsNode?.hits) ? hitsNode.hits : [];
  const hits = rawHits.flatMap((hit) => {
    const source = asRecord(asRecord(hit)?._source);
    if (!source) {
      return [];
    }
    const entityType = source.entityType;
    return [
      typeof entityType === 'string' && entityType
        ? { ...source, type: entityType }
        : { ...source },
    ];
  });
  const totalNode = hitsNode?.total;
  const total =
    asNumber(asRecord(totalNode)?.value) ?? asNumber(totalNode) ?? 0;
  const rawAggregations = asRecord(stripped?.aggregations);
  const aggregations = rawAggregations
    ? Object.fromEntries(
        Object.entries(rawAggregations).map(([key, value]) => [
          key.replace('sterms#', ''),
          value,
        ]),
      )
    : undefined;
  return { hits, total, aggregations };
}

/**
 * Pin `searchQuery` (rest/searchAPI.ts): GET /v1/search/query with
 * the rawSearchQuery request mapping, returning the formatted
 * response. `q` carries getQueryWithSlash(query) except that an
 * empty query or '**' sends an empty `q`; `from` is derived from the
 * 1-based page number; `deleted` is always sent.
 */
export async function searchServiceIndex(
  options: SearchServiceIndexOptions,
): Promise<SearchQueryResponse> {
  const pageNumber = options.pageNumber ?? 1;
  const pageSize = options.pageSize ?? 10;
  const query = options.query ?? '';
  const q = query && query !== '**' ? getQueryWithSlash(query) : '';
  const payload = await apiRequest<unknown>('/v1/search/query', {
    query: {
      q,
      index: options.searchIndex,
      from: (Math.max(1, pageNumber) - 1) * pageSize,
      size: pageSize,
      deleted: options.includeDeleted ?? false,
      query_filter:
        options.queryFilter === undefined ? undefined : JSON.stringify(options.queryFilter),
      post_filter:
        options.postFilter === undefined ? undefined : JSON.stringify(options.postFilter),
      sort_field: options.sortField,
      sort_order: options.sortOrder,
      track_total_hits: options.trackTotalHits,
      fetch_source: options.fetchSource,
    },
  });
  return formatSearchQueryResponse(payload);
}

export type EsBoolQueryType = 'must' | 'must_not' | 'should' | 'should_not';

export interface GetTermQueryOptions {
  wildcardTerms?: Record<string, string>;
  wildcardShouldQueries?: Record<string, string>;
  mustNotTerms?: Record<string, string | string[] | number | boolean>;
  matchTerms?: Record<string, string | number | boolean>;
  wildcardMustNotQueries?: Record<string, string | string[]>;
}

type ElasticsearchQuery = Record<string, unknown>;

const NESTED_FIELDS = ['owners'];

function getNestedPath(field: string): string | undefined {
  return NESTED_FIELDS.find((nested) => field.startsWith(`${nested}.`));
}

function wrapTermQuery(
  field: string,
  value: string | number | boolean,
  nestedPath?: string,
): ElasticsearchQuery {
  const termQuery: ElasticsearchQuery = { term: { [field]: value } };
  if (nestedPath) {
    return { nested: { path: nestedPath, query: termQuery } };
  }
  return termQuery;
}

/**
 * Pin `getTermQuery` (utils/SearchPureUtils.ts), verbatim: term
 * queries for each field (array values fan out), plus optional
 * wildcard, match, and must_not clauses; a non-empty
 * `wildcardShouldQueries` map appends a `should` bool with
 * `minimum_should_match: 1`. `owners.*` fields wrap in a nested
 * query. A `should` query type carries `minimumShouldMatch` when
 * given.
 */
export function getTermQuery(
  terms: Record<string, string | string[] | number | boolean>,
  queryType: EsBoolQueryType = 'must',
  minimumShouldMatch?: number,
  options?: GetTermQueryOptions,
): Record<string, unknown> {
  const termQueries: ElasticsearchQuery[] = Object.entries(terms).flatMap<ElasticsearchQuery>(
    ([field, value]) => {
      const nestedPath = getNestedPath(field);
      if (Array.isArray(value)) {
        return value.map((item) => wrapTermQuery(field, item, nestedPath));
      }
      return wrapTermQuery(field, value, nestedPath);
    },
  );

  const wildcardQueries: ElasticsearchQuery[] = options?.wildcardTerms
    ? Object.entries(options.wildcardTerms).map(([field, value]) => ({
        wildcard: { [field]: value },
      }))
    : [];

  const mustNotQueries: ElasticsearchQuery[] = options?.mustNotTerms
    ? Object.entries(options.mustNotTerms).flatMap<ElasticsearchQuery>(([field, value]) => {
        const nestedPath = getNestedPath(field);
        if (Array.isArray(value)) {
          return value.map((item) => wrapTermQuery(field, item, nestedPath));
        }
        return wrapTermQuery(field, value, nestedPath);
      })
    : [];

  const matchQueries: ElasticsearchQuery[] = options?.matchTerms
    ? Object.entries(options.matchTerms).map(([field, value]) => ({
        match: { [field]: value },
      }))
    : [];

  const allQueries: ElasticsearchQuery[] = [...termQueries, ...wildcardQueries, ...matchQueries];

  if (options?.wildcardShouldQueries && Object.keys(options.wildcardShouldQueries).length > 0) {
    const shouldWildcardQueries = Object.entries(options.wildcardShouldQueries).map(
      ([field, value]) => ({
        wildcard: { [field]: value },
      }),
    );
    allQueries.push({
      bool: {
        should: shouldWildcardQueries,
        minimum_should_match: 1,
      },
    });
  }

  const boolQuery: Record<string, unknown> & {
    must_not?: ElasticsearchQuery[];
    minimum_should_match?: number;
  } = {
    [queryType]: allQueries,
  };

  const wildcardMustNotQueries: ElasticsearchQuery[] = options?.wildcardMustNotQueries
    ? Object.entries(options.wildcardMustNotQueries).flatMap(([field, value]) => {
        if (Array.isArray(value)) {
          return value.map((item) => ({ wildcard: { [field]: item } }));
        }
        return { wildcard: { [field]: value } };
      })
    : [];

  const allMustNotQueries: ElasticsearchQuery[] = [...mustNotQueries, ...wildcardMustNotQueries];
  if (allMustNotQueries.length > 0) {
    boolQuery.must_not = allMustNotQueries;
  }

  if (queryType === 'should' && minimumShouldMatch !== undefined) {
    boolQuery.minimum_should_match = minimumShouldMatch;
  }

  return {
    query: {
      bool: boolQuery,
    },
  };
}

/**
 * Pin `buildSchemaQueryFilter` (utils/DatabaseSchemaDetailsUtils.tsx),
 * verbatim: a term query on the given field, with an optional search
 * value fanning out to `displayName.keyword` / `name.keyword`
 * wildcard should-queries.
 */
export function buildSchemaQueryFilter(
  field: string,
  fieldValue: string,
  searchValue?: string,
): Record<string, unknown> {
  return getTermQuery(
    { [field]: fieldValue },
    'must',
    undefined,
    searchValue
      ? {
          wildcardShouldQueries: {
            'displayName.keyword': `*${searchValue}*`,
            'name.keyword': `*${searchValue}*`,
          },
        }
      : undefined,
  );
}

/**
 * Pin `getSearchIndexForService` (utils/ServicePureUtils.ts): the
 * child-entity search index for a service kind. Kinds without a
 * child index (metadata, security, and the fork llm/mcp kinds) fall
 * through to the pin default, `database`.
 */
export function getSearchIndexForService(kind: ServiceKind): ServiceSearchIndexValue {
  switch (kind) {
    case 'database':
      return SERVICE_SEARCH_INDEX.DATABASE;
    case 'messaging':
      return SERVICE_SEARCH_INDEX.TOPIC;
    case 'dashboard':
      return SERVICE_SEARCH_INDEX.DASHBOARD;
    case 'pipeline':
      return SERVICE_SEARCH_INDEX.PIPELINE;
    case 'mlmodel':
      return SERVICE_SEARCH_INDEX.MLMODEL;
    case 'storage':
      return SERVICE_SEARCH_INDEX.CONTAINER;
    case 'search':
      return SERVICE_SEARCH_INDEX.SEARCH_INDEX;
    case 'api':
      return SERVICE_SEARCH_INDEX.API_COLLECTION;
    case 'drive':
      return SERVICE_SEARCH_INDEX.DIRECTORY;
    default:
      return SERVICE_SEARCH_INDEX.DATABASE;
  }
}

/**
 * Pin `getServiceNameQueryFilter` (utils/ServicePureUtils.ts): match
 * on `service.name.keyword`. The name is the service entity's `name`,
 * not its FQN.
 */
export function getServiceNameQueryFilter(serviceName: string): Record<string, unknown> {
  return {
    query: {
      match: {
        'service.name.keyword': serviceName,
      },
    },
  };
}

/**
 * Pin `getServiceDisplayNameQueryFilter` (utils/ServicePureUtils.ts):
 * a term should-query on `service.displayName.keyword`, wrapped in a
 * must clause.
 */
export function getServiceDisplayNameQueryFilter(displayName: string): Record<string, unknown> {
  return {
    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                {
                  term: {
                    'service.displayName.keyword': displayName,
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

// --- Services list search (01-services.md §3.6) ---------------------------

export interface SearchServicesQuery {
  /** Service-entity search index (getSearchIndexFromService). */
  searchIndex: ServiceSearchIndexValue;
  /** 1-based page number; defaults to 1. */
  currentPage?: number;
  /** Page size; defaults to 10 (pin searchService). */
  limit?: number;
  queryFilter?: Record<string, unknown>;
  deleted?: boolean;
}

export interface SearchServicesResult {
  data: CatalogService[];
  total: number;
}

const KIND_BY_ENTITY_TYPE: Readonly<Record<string, ServiceKind>> = {
  databaseService: 'database',
  messagingService: 'messaging',
  dashboardService: 'dashboard',
  pipelineService: 'pipeline',
  mlmodelService: 'mlmodel',
  metadataService: 'metadata',
  storageService: 'storage',
  searchService: 'search',
  apiService: 'api',
  securityService: 'security',
  driveService: 'drive',
  llmService: 'llm',
  mcpService: 'mcp',
};

function mapServiceSearchConnection(value: unknown): ServiceConnection | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const config = asRecord(rec.config);
  return { config: config ?? undefined };
}

/**
 * Map one search-hit `_source` to a CatalogService. The indexed owners
 * / tags / style survive (the SearchHit shape would drop them, and the
 * Owners column needs the indexed owners). The kind resolves from the
 * hit's entityType, falling back to the requested category kind.
 */
export function mapServiceSearchHit(
  source: Record<string, unknown>,
  fallbackKind: ServiceKind,
): CatalogService | null {
  const id = asString(source.id);
  const name = asString(source.name);
  if (!id && !name) {
    return null;
  }
  const entityType = asString(source.entityType);
  return {
    id,
    name,
    displayName: asString(source.displayName) || undefined,
    description: asString(source.description) || undefined,
    fullyQualifiedName: asString(source.fullyQualifiedName) || name,
    kind: KIND_BY_ENTITY_TYPE[entityType] ?? fallbackKind,
    serviceType: asString(source.serviceType),
    owners: mapEntityRefs(source.owners),
    tags: mapServiceTags(source.tags),
    followers: mapEntityRefs(source.followers),
    domains: mapEntityRefs(source.domains),
    dataProducts: mapEntityRefs(source.dataProducts),
    version: asNumber(source.version),
    connection: mapServiceSearchConnection(source.connection),
    deleted: asBoolean(source.deleted),
    style: mapServiceStyle(source.style),
  };
}

/**
 * Pin `searchService` (rest/serviceAPI.ts:234-259): the caller passes
 * no `search` text — the search term lives only in the queryFilter —
 * so `q` is the wildcard; paging is numeric; `deleted` follows the
 * show-deleted toggle.
 */
export async function searchServices(
  query: SearchServicesQuery,
  fallbackKind: ServiceKind,
): Promise<SearchServicesResult> {
  const response = await searchServiceIndex({
    searchIndex: query.searchIndex,
    query: '*',
    pageNumber: query.currentPage ?? 1,
    pageSize: query.limit ?? 10,
    queryFilter: query.queryFilter,
    includeDeleted: query.deleted ?? false,
  });
  const data = response.hits.flatMap((hit) => {
    const mapped = mapServiceSearchHit(hit, fallbackKind);
    return mapped ? [mapped] : [];
  });
  return { data, total: response.total };
}
