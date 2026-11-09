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
import type { SearchFilters } from '@/catalog/searchQuery';
import type { KnowledgePage, KnowledgePageType } from '@/types/contextCenter';

/**
 * Official article listing constants (pin `a3012259ca`:
 * `constants/ContextCenter.constants.ts` ARTICLE_SORT_OPTIONS /
 * ARTICLE_QUICK_FILTER_FIELDS, `constants/KnowledgeCenter.constant.ts`
 * getKnowledgePageFields, `components/KnowledgeCenter/
 * KnowledgePageListComponent` dual path + `PAGE_SIZE_MEDIUM = 25`).
 *
 * ADR:2026-11-08-context-center-articles-search-mapping
 * ADR:2026-11-08-context-center-articles-offset-load-more
 */

export const ARTICLE_PAGE_SIZE = 25;

/** Official `getKnowledgePageFields` (REST list fields), verbatim. */
export function getKnowledgePageFields(): string {
  return 'owners,votes,followers,tags,domains,relatedEntities,dataProducts,reviewers';
}

export interface ArticleSortOption {
  id: string;
  /** ES search-index field (search path). */
  esSortField: string;
  /** REST list sortBy; absent when the sort has no REST equivalent. */
  restSortBy?: string;
  sortOrder: 'asc' | 'desc';
}

/** Official ARTICLE_SORT_OPTIONS, verbatim. */
export const ARTICLE_SORT_OPTIONS: ArticleSortOption[] = [
  { id: 'updatedAt', esSortField: 'updatedAt', restSortBy: 'updatedAt', sortOrder: 'desc' },
  { id: 'name', esSortField: 'displayName.keyword', restSortBy: 'displayName', sortOrder: 'asc' },
  { id: 'publicationDate', esSortField: 'page.publicationDate', sortOrder: 'desc' },
  { id: 'popularity', esSortField: 'totalVotes', sortOrder: 'desc' },
];

export const DEFAULT_ARTICLE_SORT_OPTION = ARTICLE_SORT_OPTIONS[0];

export function getArticleSortConfig(id: string): ArticleSortOption {
  return ARTICLE_SORT_OPTIONS.find((option) => option.id === id) ?? DEFAULT_ARTICLE_SORT_OPTION;
}

export interface ArticleQuickFilterField {
  facetId: FacetId;
  /** ES term field (official EntityFields from AdvancedSearch.enum). */
  field: string;
}

/** Official ARTICLE_QUICK_FILTER_FIELDS, verbatim (field = ES term key). */
export const ARTICLE_QUICK_FILTER_FIELDS: ArticleQuickFilterField[] = [
  { facetId: 'domain', field: 'domains.displayName.keyword' },
  { facetId: 'owner', field: 'ownerDisplayName' },
  { facetId: 'tagFqn', field: 'tags.tagFQN' },
  { facetId: 'tier', field: 'tier.tagFQN' },
];

/** Facet ids the articles quick-filter chips render (the four fields above). */
export const ARTICLE_QUICK_FILTER_FACET_IDS: FacetId[] = ARTICLE_QUICK_FILTER_FIELDS.map(
  (field) => field.facetId,
);

/**
 * Official `getQuickFilterQuery` (ExplorePureUtils.ts), verbatim: within
 * one field the selected values are a `bool.should` term union, across
 * fields a `bool.must` intersection; no selection at all yields undefined.
 */
export function getQuickFilterQuery(
  filters: SearchFilters,
): Record<string, unknown> | undefined {
  const must = getQuickFilterMust(filters);
  return must.length === 0 ? undefined : { query: { bool: { must } } };
}

function getQuickFilterMust(filters: SearchFilters): Array<Record<string, unknown>> {
  const must: Array<Record<string, unknown>> = [];
  for (const field of ARTICLE_QUICK_FILTER_FIELDS) {
    const values = filters[field.facetId] ?? [];
    if (values.length === 0) {
      continue;
    }
    must.push({
      bool: {
        should: values.map((value) => ({ term: { [field.field]: value } })),
      },
    });
  }
  return must;
}

/**
 * The ES `query_filter` for the articles list: the quick-filter query
 * plus the product page-type tab as a `term: {pageType}` clause merged
 * into the same `bool.must` array (official has no page-type tab — the
 * product tab is pre-existing behavior, kept; the ES mapping carries
 * `pageType` as a keyword, so the term clause is exact). Serialized to
 * a JSON string, per the product search surface (apiRequest only carries
 * string query values). Undefined when nothing filters.
 */
export function buildArticleQueryFilter(
  filters: SearchFilters,
  pageType: KnowledgePageType | 'All',
): string | undefined {
  const must = getQuickFilterMust(filters);
  if (pageType !== 'All') {
    must.push({ term: { pageType } });
  }
  return must.length === 0 ? undefined : JSON.stringify({ query: { bool: { must } } });
}

/**
 * Official `useSearchPath` (KnowledgePageListComponent): any active text
 * search or filter routes through ES; publication-date / popularity
 * sorts have no REST equivalent, so they route through ES even when
 * unfiltered.
 */
export function useArticleSearchPath(
  searchQuery: string,
  filters: SearchFilters,
  sort: ArticleSortOption,
): boolean {
  const isFiltered =
    searchQuery.trim().length > 0 ||
    ARTICLE_QUICK_FILTER_FIELDS.some((field) => (filters[field.facetId] ?? []).length > 0);
  return isFiltered || sort.restSortBy === undefined;
}

/** Append page, dropping duplicates by id (official `uniqBy(id)`). */
export function appendUniquePages(
  previous: KnowledgePage[],
  next: KnowledgePage[],
): KnowledgePage[] {
  const seen = new Set(previous.map((page) => page.id));
  const merged = [...previous];
  for (const page of next) {
    if (!seen.has(page.id)) {
      seen.add(page.id);
      merged.push(page);
    }
  }
  return merged;
}
