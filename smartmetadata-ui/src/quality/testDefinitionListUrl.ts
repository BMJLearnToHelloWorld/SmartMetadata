/**
 * Official Test Library list URL state (useTestDefinitionFilters + useTableFilters).
 */
import { mergeQueryParams, type QueryPatchValue } from '@/catalog/servicePaging';
import {
  TEST_LIBRARY_DEFAULT_SORT_FIELD,
  TEST_LIBRARY_DEFAULT_SORT_ORDER,
  TEST_LIBRARY_SORT_FIELD_BY_COLUMN,
} from '@/quality/testLibrary';

export type TestDefinitionSortOrder = 'asc' | 'desc';

export interface TestDefinitionListQuery {
  entityType?: string;
  /** First selected platform from the URL `testPlatforms` param (official key). */
  testPlatform?: string;
  q: string;
  sortField: string;
  sortOrder: TestDefinitionSortOrder;
}

const SORTABLE_SORT_FIELDS = new Set(Object.values(TEST_LIBRARY_SORT_FIELD_BY_COLUMN));

export const TEST_DEFINITION_QUICK_FILTER_KEYS = ['entityType', 'testPlatforms'] as const;

function queryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }
  return undefined;
}

function firstCsvToken(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const [first] = value.split(',').map((part) => part.trim()).filter(Boolean);
  return first;
}

/**
 * Parse the listing query string the way official useTestDefinitionFilters does:
 * unknown sortField values fall back to the default instead of hitting the API.
 */
export function parseTestDefinitionListQuery(
  query: Record<string, unknown>,
): TestDefinitionListQuery {
  const q = queryString(query.q) ?? '';
  const sortFieldRaw = queryString(query.sortField);
  const sortField = SORTABLE_SORT_FIELDS.has(sortFieldRaw ?? '')
    ? (sortFieldRaw as string)
    : TEST_LIBRARY_DEFAULT_SORT_FIELD;
  const sortOrder: TestDefinitionSortOrder =
    query.sortOrder === 'desc' ? 'desc' : TEST_LIBRARY_DEFAULT_SORT_ORDER;
  const testPlatforms = queryString(query.testPlatforms);

  return {
    entityType: queryString(query.entityType),
    testPlatform: firstCsvToken(testPlatforms),
    q,
    sortField,
    sortOrder,
  };
}

/** Merge a filter patch and drop paging keys (official applyUrlParams resets page). */
export function mergeTestDefinitionListQuery(
  current: Record<string, unknown>,
  patch: Record<string, QueryPatchValue>,
): Record<string, string | string[]> {
  return mergeQueryParams(current, {
    ...patch,
    currentPage: null,
    cursorType: null,
    cursorValue: null,
  });
}