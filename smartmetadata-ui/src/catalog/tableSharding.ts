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
import { splitFqn, unquoteFqnPart } from './fqn';

/**
 * Pin `utils/TableShardingUtils.ts` (`findShardedFamilies`), ported to
 * this console's Lucene-`q` transport (accepted design difference, I5):
 * the lookup is a TABLE-index search whose `query_filter` carries the
 * same bool-must term clauses pin sends, and each candidate is then
 * verified against its table entity's sharding prefix.
 *
 * Only the query shape differs from pin: pin calls `searchQuery` with
 * a structured `queryFilter` object, this console passes the same JSON
 * through `searchAssets`' `query_filter` string, which the server
 * accepts verbatim.
 */

export interface ParsedShardName {
  prefix: string;
  date: string;
  logicalName: string;
}

/**
 * Official `parseShardName` (TableShardingUtils.ts:31-56), verbatim
 * logic: strip a trailing `$YYYYMMDD`, require a `YYYYMMDD` date suffix
 * that forms a valid calendar date; the logical name is the prefix plus
 * `yyyymmdd`.
 */
export function parseShardName(name: string): ParsedShardName | undefined {
  const base = name.replace(/\$\d{8}$/, '');
  if (base.includes('$')) {
    return undefined;
  }
  const match = /^(.*[^0-9])?([0-9]{4})([0-9]{2})([0-9]{2})$/.exec(base);
  if (!match) {
    return undefined;
  }
  const [, prefix = '', year, month, day] = match;
  const date = `${year}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number(year) === 0 ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    return undefined;
  }
  return { prefix, date, logicalName: `${prefix}yyyymmdd` };
}

/** Pin `findShardedFamilies` query gate (TableShardingUtils.ts:71-80): a dotted FQN of 1–4 parts. */
export const SHARDED_FAMILY_QUERY_PATTERN =
  /^(?:"[^"\n]+"|[a-zA-Z0-9_$-]+)(?:\.(?:"[^"\n]+"|[a-zA-Z0-9_$-]+)){0,3}$/;

/** Qualifier fields for the FQN parts leading the shard name (TableShardingUtils.ts:82-86). */
const SHARD_QUALIFIER_FIELDS = ['service.name', 'database.name', 'databaseSchema.name'] as const;

/**
 * Build the `query_filter` JSON for the sharded-family lookup, or
 * undefined when the query cannot name a sharded family. The term
 * clauses are pin's (TableShardingUtils.ts:87-102): BigQuery service,
 * Sharded table type, the logical `name.keyword`, plus one term per
 * leading FQN part. A saved `query_filter` carried on the URL is
 * merged in front, as pin merges its `queryFilter` argument; the
 * product's chip filters live in the Lucene `q` and cannot be merged
 * into this JSON, so they do not narrow the lookup.
 */
export function buildShardedFamilyQueryFilter(
  query: string,
  queryFilterJson?: string,
): { candidate: ParsedShardName; queryFilter: string } | undefined {
  if (!SHARDED_FAMILY_QUERY_PATTERN.test(query)) {
    return undefined;
  }
  const parts = splitFqn(query).map((part) => unquoteFqnPart(part));
  const candidate = parseShardName(parts[parts.length - 1]);
  if (!candidate) {
    return undefined;
  }
  const qualifiers = SHARD_QUALIFIER_FIELDS.slice(4 - parts.length);
  const terms: Record<string, unknown>[] = [
    { term: { serviceType: 'BigQuery' } },
    { term: { tableType: 'Sharded' } },
    { term: { 'name.keyword': candidate.logicalName } },
    ...parts
      .slice(0, -1)
      .map((value, index) => ({ term: { [qualifiers[index]]: value } })),
  ];
  const must: unknown[] = [...terms];
  if (queryFilterJson) {
    try {
      const parsed = JSON.parse(queryFilterJson) as { query?: unknown };
      if (parsed && typeof parsed === 'object' && parsed.query !== undefined) {
        must.unshift(parsed.query);
      }
    } catch {
      // An unparseable saved filter is ignored, never fatal.
    }
  }
  return { candidate, queryFilter: JSON.stringify({ query: { bool: { must } } }) };
}

export interface ShardedFamilyTable {
  id: string;
  fullyQualifiedName: string;
}

export interface ShardedFamilyDeps {
  /** Already-serialized `query_filter` from the URL, if any. */
  queryFilter?: string;
  includeDeleted?: boolean;
  /** TABLE-index search for the built `query_filter`; at most 10 hits are verified. */
  searchTables: (queryFilter: string) => Promise<SearchHit[]>;
  /**
   * Table entity by FQN, carrying at least `tableSharding.prefix` and
   * `deleted`; undefined when the table cannot be read.
   */
  fetchTable: (fqn: string) => Promise<
    | { id: string; fullyQualifiedName: string; tableSharding?: { prefix?: string }; deleted?: boolean }
    | undefined
  >;
}

/**
 * Pin `findShardedFamilies` (TableShardingUtils.ts:70-136): return the
 * distinct sharded tables whose FQN the query names, keeping only
 * candidates whose sharding prefix matches the query's prefix and
 * which are not deleted (unless `includeDeleted`). A lookup that
 * cannot name a family, or any failed table read, yields no rows
 * rather than an error.
 */
export async function findShardedFamilies(
  query: string,
  deps: ShardedFamilyDeps,
): Promise<ShardedFamilyTable[]> {
  const built = buildShardedFamilyQueryFilter(query, deps.queryFilter);
  if (!built) {
    return [];
  }
  const { candidate, queryFilter } = built;
  let hits: SearchHit[];
  try {
    hits = await deps.searchTables(queryFilter);
  } catch {
    return [];
  }
  const verified = await Promise.all(
    hits.slice(0, 10).map(async (hit) => {
      const fqn = hit.fullyQualifiedName;
      if (!fqn) {
        return undefined;
      }
      try {
        const table = await deps.fetchTable(fqn);
        if (!table) {
          return undefined;
        }
        return table.tableSharding?.prefix === candidate.prefix &&
          (!table.deleted || deps.includeDeleted)
          ? { id: table.id, fullyQualifiedName: table.fullyQualifiedName }
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return [...new Map(
    verified
      .filter((table): table is ShardedFamilyTable => Boolean(table))
      .map((table) => [table.id, table]),
  ).values()];
}
