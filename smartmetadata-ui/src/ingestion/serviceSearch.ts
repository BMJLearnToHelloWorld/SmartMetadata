/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { CatalogService } from '@/types/ingestion';

/**
 * Service list search (01-services.md §3.6): the ES queryFilter builder,
 * the highlight segment splitter, and the fetch-split predicates — all
 * ported from pin Services.tsx / EntitySearchUtils at a3012259ca.
 *
 * The queryFilter (Services.tsx:114-144): the search term is escaped for
 * `[*?\\]` and wildcard-matched against `name.keyword` /
 * `displayName.keyword` (should + minimum_should_match 1); the type
 * filter becomes a `serviceType` term per selected type (should +
 * minimum_should_match 1); the two bool clauses combine under must. With
 * no search term and no type filter there is no queryFilter (undefined)
 * and the list takes the REST path instead of the search path.
 */

export type ServiceQueryFilter = {
  query: {
    bool: {
      must: Record<string, unknown>[];
    };
  };
};

/** Pin escape rule: `[*?\\]` each prefixed with a backslash. */
export function escapeServiceSearchTerm(searchTerm: string): string {
  return searchTerm.replaceAll(/[*?\\]/g, String.raw`\$&`);
}

export function buildServiceQueryFilter(
  searchTerm: string,
  serviceTypeFilter: readonly string[],
): ServiceQueryFilter | undefined {
  const mustClauses: Record<string, unknown>[] = [];

  if (searchTerm) {
    const escapedTerm = escapeServiceSearchTerm(searchTerm);
    mustClauses.push({
      bool: {
        should: [
          { wildcard: { 'name.keyword': `*${escapedTerm}*` } },
          { wildcard: { 'displayName.keyword': `*${escapedTerm}*` } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (serviceTypeFilter.length > 0) {
    mustClauses.push({
      bool: {
        should: serviceTypeFilter.map((type) => ({
          term: { serviceType: type },
        })),
        minimum_should_match: 1,
      },
    });
  }

  return mustClauses.length > 0 ? { query: { bool: { must: mustClauses } } } : undefined;
}

/**
 * Pin isNumberBased (Services.tsx:350-372): number-based paging applies
 * if and only if there is a search term or a type filter.
 */
export function isServiceSearchNumberBased(
  searchTerm: string,
  serviceTypeFilter: readonly string[],
): boolean {
  return searchTerm.length > 0 || serviceTypeFilter.length > 0;
}

/**
 * Pin metadata-category rule (Services.tsx:199-205): the metadata list
 * filters out the service whose FQN is `OpenMetadata`.
 */
export function filterMetadataOpenMetadata(
  services: readonly CatalogService[],
  isMetadataCategory: boolean,
): CatalogService[] {
  if (!isMetadataCategory) {
    return [...services];
  }
  return services.filter((service) => service.fullyQualifiedName !== 'OpenMetadata');
}
