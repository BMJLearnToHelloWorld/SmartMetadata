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
 * Search query_filter builders, ported from pin
 * utils/SearchPureUtils.ts getTermQuery (392b3efd object tree).
 *
 * Semantics that matter and are easy to get wrong:
 * - Array values expand to one `term` query per value (never `terms`).
 * - `owners.*` fields wrap in a nested query (NESTED_FIELDS = ['owners']).
 * - mustNotTerms expand the same way under must_not.
 * - minimum_should_match is emitted only for `should` queries that pass it.
 *
 * The one deliberate exception is the team-member filter, which the pin
 * hand-builds as a single `terms` (IN) clause in UserTab — that builder
 * lives in api/teams.ts (buildTeamMembersSearchFilter), not here.
 */

type TermValue = string | string[] | number | boolean;

type EsQuery = Record<string, unknown>;

const NESTED_FIELDS = ['owners'];

function getNestedPath(field: string): string | undefined {
  return NESTED_FIELDS.find((nested) => field.startsWith(`${nested}.`));
}

function wrapTermQuery(field: string, value: string | number | boolean, nestedPath?: string): EsQuery {
  const termQuery: EsQuery = { term: { [field]: value } };
  if (nestedPath) {
    return { nested: { path: nestedPath, query: termQuery } };
  }
  return termQuery;
}

export interface TermQueryOptions {
  mustNotTerms?: Record<string, TermValue>;
}

export function getTermQuery(
  terms: Record<string, TermValue>,
  queryType: 'must' | 'must_not' | 'should' | 'should_not' = 'must',
  minimumShouldMatch?: number,
  options?: TermQueryOptions,
): { query: { bool: Record<string, unknown> } } {
  const termQueries = Object.entries(terms).flatMap(([field, value]) => {
    const nestedPath = getNestedPath(field);
    if (Array.isArray(value)) {
      return value.map((v) => wrapTermQuery(field, v, nestedPath));
    }
    return wrapTermQuery(field, value, nestedPath);
  });
  const mustNotQueries = options?.mustNotTerms
    ? Object.entries(options.mustNotTerms).flatMap(([field, value]) => {
        const nestedPath = getNestedPath(field);
        if (Array.isArray(value)) {
          return value.map((v) => wrapTermQuery(field, v, nestedPath));
        }
        return wrapTermQuery(field, value, nestedPath);
      })
    : [];
  const boolQuery: Record<string, unknown> = { [queryType]: termQueries };
  if (mustNotQueries.length > 0) {
    boolQuery.must_not = mustNotQueries;
  }
  if (queryType === 'should' && minimumShouldMatch !== undefined) {
    boolQuery.minimum_should_match = minimumShouldMatch;
  }
  return { query: { bool: boolQuery } };
}

/** Team Assets tab table filter (pin TeamDetailsV1 assetTabRender). */
export function buildTeamAssetsQueryFilter(teamId: string): string {
  return JSON.stringify(
    getTermQuery({ 'owners.id': teamId }, 'must', undefined, {
      mustNotTerms: { entityType: ['tableColumn'] },
    }),
  );
}

/** Team Assets tab count filter (pin TeamsPage fetchAssets): also excludes dataProduct. */
export function buildTeamAssetsCountQueryFilter(teamId: string): string {
  return JSON.stringify(
    getTermQuery({ 'owners.id': teamId }, 'must', undefined, {
      mustNotTerms: { entityType: ['tableColumn', 'dataProduct'] },
    }),
  );
}

/**
 * My Data filter (pin UserPage:78-83): owners = the user plus every
 * team they belong to, `should` with minimum_should_match 1.
 */
export function buildMyDataQueryFilter(ownerIds: string[]): string {
  return JSON.stringify(getTermQuery({ 'owners.id': ownerIds }, 'should', 1));
}

/** Following filter (pin UserPage:85-87): followers = the user id. */
export function buildFollowingQueryFilter(userId: string): string {
  return JSON.stringify(getTermQuery({ followers: userId }, 'should', 1));
}
