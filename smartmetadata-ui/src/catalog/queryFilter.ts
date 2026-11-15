/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Pin `createQueryFilter` (openmetadata-ui utils/Query/QueryUtils.ts at
 * a3012259ca) and the TableQueries constants (constants/Query.constant.ts):
 * the exact Elasticsearch filter for "queries used by one table", plus the
 * sort options, page sizes, and filter-dropdown search contracts the tab
 * sends through GET /v1/search/query with index=query.
 */

export interface QueryFilterOption {
  key: string;
  label: string;
}

export interface QueryTimeRange {
  startTs: number;
  endTs: number;
}

export interface CreateQueryFilterInput {
  tableId: string;
  tags?: QueryFilterOption[];
  owners?: QueryFilterOption[];
  timeRange?: QueryTimeRange;
}

/**
 * Pin verbatim: the `queryUsedIn.id` term is always present; the tag,
 * owner, and time-range clauses are appended only when the corresponding
 * filter is selected, in that order.
 */
export function createQueryFilter({
  tableId,
  tags,
  owners,
  timeRange,
}: CreateQueryFilterInput): Record<string, unknown> {
  const tagFilter =
    tags?.length
      ? [
          {
            bool: {
              should: tags.map((data) => ({
                term: { 'tags.tagFQN': data.key },
              })),
            },
          },
        ]
      : [];
  const ownerFilter =
    owners?.length
      ? [
          {
            nested: {
              path: 'owners',
              query: {
                bool: {
                  should: owners.map((data) => ({
                    term: { 'owners.name': data.key },
                  })),
                },
              },
            },
          },
        ]
      : [];
  const timeRangeFilter = timeRange
    ? [
        {
          range: {
            queryDate: {
              gte: timeRange.startTs,
              lte: timeRange.endTs,
            },
          },
        },
      ]
    : [];
  return {
    query: {
      bool: {
        must: [
          { term: { 'queryUsedIn.id': tableId } },
          ...tagFilter,
          ...ownerFilter,
          ...timeRangeFilter,
        ],
      },
    },
  };
}

export type QuerySortField = 'queryDate' | 'updatedAt' | 'totalVotes';
export type QuerySortOrder = 'asc' | 'desc';

/** Pin QUERY_SORT_OPTIONS; `labelKey` is the fork locale key for the pin label. */
export const QUERY_SORT_OPTIONS: Array<{ value: QuerySortField; labelKey: string }> = [
  { value: 'queryDate', labelKey: 'query.createdDate' },
  { value: 'updatedAt', labelKey: 'query.lastUpdated' },
  { value: 'totalVotes', labelKey: 'query.popularity' },
];

/** Pin TableQueries default sort: queryDate DESC. */
export const QUERY_DEFAULT_SORT: { field: QuerySortField; order: QuerySortOrder } = {
  field: 'queryDate',
  order: 'desc',
};

/** Pin LIST_PAGE_SIZE_OPTIONS (constants.ts): lists page at 15/25/50. */
export const QUERY_PAGE_SIZE_OPTIONS = [15, 25, 50] as const;
export const QUERY_DEFAULT_PAGE_SIZE = 15;

/** Pin PAGE_SIZE_BASE: filter-option dropdowns read 15 candidates. */
export const QUERY_FILTER_PAGE_SIZE = 15;

/** Pin QUERY_USED_BY_TABLE_VIEW_CAP: used-by links shown before "N more". */
export const QUERY_USED_BY_TABLE_VIEW_CAP = 3;

/** Pin fetchFilterOptions filter strings (TableQueries.tsx). */
export const QUERY_TAG_FILTER = 'disabled:false AND !classification.name:Tier';
export const QUERY_OWNER_FILTER = 'isBot:false';

/**
 * Pin `getQueryWithSlash` (utils/StringUtils.ts), verbatim: adds a
 * backslash before a quote in the search string so it cannot break
 * Elasticsearch's `query_string` parser. A query made only of
 * backslashes/`&` (already-escaped, content-free) is dropped to `''`.
 * A raw single quote is always escaped; a double quote is escaped only
 * when it is not already escaped — a quote is actually escaped only
 * when preceded by an odd number of backslashes.
 */
export function getQueryWithSlash(query: string): string {
  const trimmed = query.trim();
  // escapeESReservedCharacters already escapes "&" upstream of this call;
  // re-escaping a query that is purely those already-escaped characters
  // sends Elasticsearch a term with no actual content, so drop it instead.
  if (/^[\\&]+$/.test(trimmed)) {
    return '';
  }

  let result = '';
  let precedingBackslashes = 0;
  for (const char of query) {
    if (char === '\\') {
      precedingBackslashes += 1;
      result += char;

      continue;
    }
    if (char === "'") {
      result += String.raw`\'`;
    } else if (char === '"') {
      result += precedingBackslashes % 2 === 1 ? char : String.raw`\"`;
    } else {
      result += char;
    }
    precedingBackslashes = 0;
  }

  return result;
}

/**
 * Pin fetchFilterOptions + rawSearchQuery, folded: the dropdown search sends
 * `q = "*<text>* AND <filters>"` (rawSearchQuery appends the filters string
 * to the query with AND), with the wrapped query passed through
 * getQueryWithSlash exactly as rawSearchQuery does. The one exception is
 * the default search text `*`, which pin turns into `**` and rawSearchQuery
 * then drops, leaving the bare filters string as the whole query. The fork
 * search client sends `q` verbatim, so this helper produces the final `q`
 * value directly.
 */
export function buildFilterOptionsQuery(searchText: string, filters: string): string {
  if (searchText === '*') {
    return filters;
  }
  return `${getQueryWithSlash(`*${searchText}*`)} AND ${filters}`;
}

/**
 * Pin USAGE_DOCS (DocumentationLinksClassBase: docs base + the usage
 * workflow path): the docs link on the tab's create placeholder.
 */
export const USAGE_DOCS_URL =
  'https://docs.open-metadata.org/latest/connectors/ingestion/workflows/usage';
