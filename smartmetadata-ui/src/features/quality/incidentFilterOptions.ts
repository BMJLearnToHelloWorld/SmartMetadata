/**
 * Official useIncidentFilterOptions.searchTestCases
 * (openmetadata-ui/.../useIncidentFilterOptions.ts): Elasticsearch
 * searchQuery on SearchIndex.TEST_CASE, encodeURIComponent for non-wildcard
 * queries, PAGE_SIZE_BASE (15).
 */
import { searchAssets } from '@/api/search';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { WILD_CARD_CHAR } from '@/quality/dqDashboardFilterOptions';

export const INCIDENT_TEST_CASE_FILTER_PAGE_SIZE = 15;

export interface IncidentTestCaseFilterOption {
  value: string;
  label: string;
}

export async function searchIncidentTestCaseFilterOptions(
  searchValue = WILD_CARD_CHAR,
): Promise<IncidentTestCaseFilterOption[]> {
  const encodedSearchValue =
    searchValue === WILD_CARD_CHAR ? searchValue : encodeURIComponent(searchValue);
  try {
    const page = await searchAssets(encodedSearchValue, 0, INCIDENT_TEST_CASE_FILTER_PAGE_SIZE, {
      index: 'testCase',
      includeAggregations: false,
    });
    return page.hits
      .map((hit) => {
        const value = hit.fullyQualifiedName ?? hit.name;
        if (!value) {
          return null;
        }
        return { label: getEntityName(hit), value };
      })
      .filter((option): option is IncidentTestCaseFilterOption => option !== null);
  } catch {
    return [];
  }
}