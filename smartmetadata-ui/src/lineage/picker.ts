/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { SearchHit } from '@/types/api';

/**
 * Pin `LINEAGE_SEARCH_INDEXES` (PlatformLineage.tsx:64-68): the lineage
 * picker searches DATA_ASSET, DOMAIN and SERVICE — never a single
 * dataAsset index, and never the FQN form (pin has none). The product
 * search API takes one index per call, so the picker issues one call
 * per index and merges the pages below.
 */
export const LINEAGE_SEARCH_INDEXES: readonly string[] = ['dataAsset', 'domain', 'service'];

/**
 * Pin `getLineageEntityExclusionFilter` (EntityLineagePureUtils.ts:186):
 * the picker excludes glossary terms, tags, data products and knowledge
 * pages — types with no lineage graph behind them. Sent verbatim as the
 * `query_filter` of each index call.
 */
export const LINEAGE_ENTITY_EXCLUSION_FILTER: string = JSON.stringify({
  query: {
    bool: {
      must_not: [
        { term: { entityType: 'glossaryTerm' } },
        { term: { entityType: 'tag' } },
        { term: { entityType: 'dataProduct' } },
        { term: { entityType: 'knowledgePage' } },
      ],
    },
  },
});

/** Cap on picker hits, matching the previous single-index behaviour. */
export const LINEAGE_SEARCH_RESULT_LIMIT = 8;

function hitKey(hit: SearchHit): string {
  return hit.fullyQualifiedName || hit.id || hit.name;
}

/**
 * Merge per-index pages in index order (dataAsset first), dropping
 * duplicates by FQN and capping the result. A hit appearing in two
 * indexes keeps its first (dataAsset) position.
 */
export function mergeLineageSearchHits(
  pages: ReadonlyArray<ReadonlyArray<SearchHit>>,
  limit: number = LINEAGE_SEARCH_RESULT_LIMIT,
): SearchHit[] {
  const seen = new Set<string>();
  const merged: SearchHit[] = [];
  for (const page of pages) {
    for (const hit of page) {
      const key = hitKey(hit);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(hit);
      if (merged.length >= limit) {
        return merged;
      }
    }
  }
  return merged;
}
