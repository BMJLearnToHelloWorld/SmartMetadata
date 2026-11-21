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
 * Official buildSchemaQueryFilter (utils/DatabaseSchemaDetailsUtils.tsx:19):
 * an Elasticsearch bool filter pinning one term field, plus — when a search
 * string is present — a should-clause wildcarding displayName and name.
 * Ported from getTermQuery (utils/SearchPureUtils.ts:181); the result is
 * passed to searchAssets as the `query_filter` string, the product's
 * established convention (catalog/domainOverview.ts).
 */
export function buildSchemaQueryFilter(field: string, fieldValue: string, searchValue?: string): string {
  const must: unknown[] = [{ term: { [field]: fieldValue } }];
  if (searchValue) {
    must.push({
      bool: {
        should: [
          { wildcard: { 'displayName.keyword': `*${searchValue}*` } },
          { wildcard: { 'name.keyword': `*${searchValue}*` } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  return JSON.stringify({ bool: { must } });
}
