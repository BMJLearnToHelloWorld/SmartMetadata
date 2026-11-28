/**
 * Official useDataQualityDashboardFilters option fetchers
 * (openmetadata-ui/.../useDataQualityDashboardFilters.ts): searchQuery with
 * PAGE_SIZE_BASE (15), wildcard query `*` or `*term*`, Lucene filters
 * concatenated onto `q` via rawSearchQuery (not query_filter).
 */
import { searchAssets } from '@/api/search';
import { getQueryWithSlash } from '@/catalog/queryFilter';
import type { SearchHit } from '@/types/api';
import { getEntityName } from '@/components/shared/profilePictureUtils';

/** Official PAGE_SIZE_BASE for dashboard filter dropdowns. */
export const DQ_DASHBOARD_FILTER_PAGE_SIZE = 15;

export const WILD_CARD_CHAR = '*';

export interface DqDashboardFilterOption {
  value: string;
  label: string;
}

const TAG_LUCENE_FILTER =
  'disabled:false AND !classification.name:Tier AND !classification.name:Certification';
const TIER_LUCENE_FILTER = 'disabled:false AND classification.name:Tier';
const CERTIFICATION_LUCENE_FILTER = 'disabled:false AND classification.name:Certification';

/**
 * Pin rawSearchQuery: `q = queryWithSlash + " AND " + filters` when query is
 * set and not `**`; bare filters only when the wrapped query collapses to `**`.
 */
export function composeDqFilterSearchQ(searchText: string, luceneFilters?: string): string {
  const term = searchText.trim();
  const query = term === '' || term === WILD_CARD_CHAR ? WILD_CARD_CHAR : `*${term}*`;
  const queryWithSlash = getQueryWithSlash(query);
  if (!luceneFilters) {
    return queryWithSlash;
  }
  if (query === '**') {
    return luceneFilters;
  }
  return `${queryWithSlash} AND ${luceneFilters}`;
}

type TagSource = Pick<SearchHit, 'name' | 'displayName' | 'fullyQualifiedName'> & {
  classification?: { name?: string };
};

function optionValue(source: TagSource): string {
  return source.fullyQualifiedName || source.name;
}

/** Official fetchTagOptions label: `${classification.name}.${name}`. */
function tagFilterLabel(source: TagSource): string {
  const classificationName = source.classification?.name;
  if (classificationName) {
    return `${classificationName}.${source.name}`;
  }
  const fqn = source.fullyQualifiedName || source.name;
  return fqn.includes('.') ? fqn : source.name;
}

async function searchIndexOptions(
  searchText: string,
  index: string,
  luceneFilters: string | undefined,
  mapHit: (source: TagSource) => DqDashboardFilterOption,
): Promise<DqDashboardFilterOption[]> {
  try {
    const page = await searchAssets(composeDqFilterSearchQ(searchText, luceneFilters), 0, DQ_DASHBOARD_FILTER_PAGE_SIZE, {
      index,
      includeAggregations: false,
    });
    return page.hits.map((hit) =>
      mapHit({
        name: hit.name,
        displayName: hit.displayName,
        fullyQualifiedName: hit.fullyQualifiedName,
      }),
    );
  } catch {
    return [];
  }
}

export async function fetchDqDashboardTagOptions(searchText = ''): Promise<DqDashboardFilterOption[]> {
  return searchIndexOptions(searchText, 'tag', TAG_LUCENE_FILTER, (source) => ({
    value: optionValue(source),
    label: tagFilterLabel(source),
  }));
}

export async function fetchDqDashboardTierOptions(searchText = ''): Promise<DqDashboardFilterOption[]> {
  return searchIndexOptions(searchText, 'tag', TIER_LUCENE_FILTER, (source) => ({
    value: optionValue(source),
    label: getEntityName(source),
  }));
}

export async function fetchDqDashboardCertificationOptions(searchText = ''): Promise<DqDashboardFilterOption[]> {
  return searchIndexOptions(searchText, 'tag', CERTIFICATION_LUCENE_FILTER, (source) => ({
    value: optionValue(source),
    label: getEntityName(source),
  }));
}

export async function fetchDqDashboardGlossaryTermOptions(searchText = ''): Promise<DqDashboardFilterOption[]> {
  return searchIndexOptions(searchText, 'glossaryTerm', undefined, (source) => ({
    value: optionValue(source),
    label: source.fullyQualifiedName ?? source.name,
  }));
}

export async function fetchDqDashboardDataProductOptions(searchText = ''): Promise<DqDashboardFilterOption[]> {
  return searchIndexOptions(searchText, 'dataProduct', undefined, (source) => ({
    value: optionValue(source),
    label: source.displayName ?? source.fullyQualifiedName ?? source.name,
  }));
}