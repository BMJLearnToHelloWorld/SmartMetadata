/**
 * Official useTestCaseFilterOptions (openmetadata-ui
 * components/DataQuality/TestCases/useTestCaseFilterOptions.tsx).
 * Vue3 helpers — no CCL copy. Does not invent extra filter keys.
 *
 * table / service / dataProduct: debounced searchQuery against the
 * official indexes, value keys fullyQualifiedName / name /
 * fullyQualifiedName. tier: one-shot getTags(parent=Tier); the control
 * is searchable locally. tags: official tagClassBase.getTags against
 * index=tag (PAGE_SIZE 10), excluding Tier and Certification.
 */
import { listTierTags } from '@/api/tags';
import { searchAssets } from '@/api/search';
import { escapeESReservedCharacters } from '@/catalog/escapeESReservedCharacters';
import type { SearchHit } from '@/types/api';

/** Official PAGE_SIZE_BASE used by fetchSearchOptions. */
export const TEST_CASE_FILTER_OPTION_PAGE_SIZE = 15;

export const TEST_CASE_FILTER_SEARCH_INDEX = {
  table: 'table',
  service: 'databaseService',
  dataProduct: 'dataProduct',
  tag: 'tag',
} as const;

/** Official constants.ts PAGE_SIZE used by tagClassBase.getTags. */
export const TAG_FILTER_PAGE_SIZE = 10;

export const TIER_CATEGORY = 'Tier';
export const CERTIFICATION_CATEGORY = 'Certification';

/**
 * Official Tag.constants queryFilterToRemoveSomeClassification merged
 * with getTermQuery({ disabled: 'false' }) as tagClassBase.getTags does.
 */
export const TAG_FILTER_QUERY_FILTER = JSON.stringify({
  query: {
    bool: {
      must: [{ term: { disabled: 'false' } }],
      must_not: [
        { prefix: { fullyQualifiedName: `${CERTIFICATION_CATEGORY}.` } },
        { prefix: { fullyQualifiedName: `${TIER_CATEGORY}.` } },
      ],
    },
  },
});

export interface TestCaseFilterOption {
  value: string;
  label: string;
  subLabel?: string;
}

/**
 * Official fetchTableData / fetchServiceOptions wrap the typed term in
 * *term*. An empty term or the wildcard itself is sent as `*`.
 * fetchDataProductOptions sends `*` for the wildcard and `*term*` otherwise.
 */
export function filterSearchQuery(search: string): string {
  const term = search.trim();
  if (!term || term === '*') {
    return '*';
  }
  return `*${term}*`;
}

export function entityDisplayName(hit: Pick<SearchHit, 'name' | 'displayName' | 'fullyQualifiedName'>): string {
  return hit.displayName || hit.name || hit.fullyQualifiedName;
}

export function mapSearchHitOption(
  hit: Pick<SearchHit, 'name' | 'displayName' | 'fullyQualifiedName'>,
  valueKey: 'name' | 'fullyQualifiedName',
): TestCaseFilterOption {
  const label = entityDisplayName(hit);
  const fqn = hit.fullyQualifiedName;
  const value = (valueKey === 'name' ? hit.name : fqn) || hit.name || fqn;
  return {
    value,
    label,
    subLabel: fqn && fqn !== label ? fqn : fqn,
  };
}

export async function fetchTableFilterOptions(search = ''): Promise<TestCaseFilterOption[]> {
  return fetchIndexedFilterOptions('table', 'fullyQualifiedName', search);
}

export async function fetchServiceFilterOptions(search = ''): Promise<TestCaseFilterOption[]> {
  return fetchIndexedFilterOptions('databaseService', 'name', search);
}

export async function fetchDataProductFilterOptions(search = ''): Promise<TestCaseFilterOption[]> {
  return fetchIndexedFilterOptions('dataProduct', 'fullyQualifiedName', search);
}

async function fetchIndexedFilterOptions(
  index: 'table' | 'databaseService' | 'dataProduct',
  valueKey: 'name' | 'fullyQualifiedName',
  search: string,
): Promise<TestCaseFilterOption[]> {
  try {
    const page = await searchAssets(filterSearchQuery(search), 0, TEST_CASE_FILTER_OPTION_PAGE_SIZE, {
      index,
      includeAggregations: false,
    });
    return page.hits.map((hit) => mapSearchHitOption(hit, valueKey));
  } catch {
    return [];
  }
}

/** Official fetchTierOptions: GET tags?parent=Tier, value = tag FQN. */
export async function fetchTierFilterOptions(): Promise<TestCaseFilterOption[]> {
  try {
    const page = await listTierTags();
    return page.data.map((tag) => {
      const label = tag.displayName || tag.name;
      const fqn = tag.fullyQualifiedName || tag.name;
      return { value: fqn, label, subLabel: fqn };
    });
  } catch {
    return [];
  }
}

/**
 * Official tagClassBase.getTags query: *{escaped}* (empty → **).
 * URI encoding is left to apiRequest so the q is not double-encoded.
 */
export function tagFilterSearchQuery(search: string): string {
  return `*${escapeESReservedCharacters(search.trim())}*`;
}

function isExcludedTag(
  hit: Pick<SearchHit, 'fullyQualifiedName' | 'name'> & { classification?: { name?: string } },
): boolean {
  const fqn = hit.fullyQualifiedName || hit.name || '';
  return (
    hit.classification?.name === TIER_CATEGORY ||
    fqn.startsWith(`${TIER_CATEGORY}.`) ||
    fqn.startsWith(`${CERTIFICATION_CATEGORY}.`)
  );
}

/** Official fetchTagOptions: tagClassBase.getTags, drop Tier, value/label = FQN. */
export async function fetchTagFilterOptions(search = ''): Promise<TestCaseFilterOption[]> {
  try {
    const page = await searchAssets(tagFilterSearchQuery(search), 0, TAG_FILTER_PAGE_SIZE, {
      index: TEST_CASE_FILTER_SEARCH_INDEX.tag,
      includeAggregations: false,
      query_filter: TAG_FILTER_QUERY_FILTER,
    });
    return page.hits
      .filter((hit) => !isExcludedTag(hit))
      .map((hit) => {
        const fqn = hit.fullyQualifiedName || hit.name;
        return { value: fqn, label: fqn };
      });
  } catch {
    return [];
  }
}
