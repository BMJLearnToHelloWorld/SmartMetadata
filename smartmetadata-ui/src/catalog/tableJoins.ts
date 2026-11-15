/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { splitFqn } from '@/catalog/fqn';
import type { ColumnJoins, JoinedWith, TableJoins } from '@/types/api';

/**
 * Pin Frequently Joined aggregation (utils/TablePureUtils.ts
 * `getJoinsFromTableJoins`, utils/FqnUtils.ts, utils/EntityPureUtils.ts at
 * a3012259ca). The quote-aware FQN splitter is the shared one in
 * catalog/fqn.ts — the partial-name helpers below are the ported
 * FqnUtils functions, which the fork did not have.
 */

export interface JoinedTable {
  fullyQualifiedName: string;
  joinCount: number;
  name: string;
}

/** Pin LIST_SIZE: the widget shows 5 rows before the less/more toggle. */
export const FREQUENTLY_JOINED_LIST_SIZE = 5;

type FqnPartName = 'service' | 'database' | 'schema' | 'table' | 'column';

/** Positional FQN parts, in pin TABLE_FQN_POSITIONAL_PARTS order. */
const POSITIONAL_PARTS: Array<{ part: FqnPartName; index: number }> = [
  { part: 'service', index: 0 },
  { part: 'database', index: 1 },
  { part: 'schema', index: 2 },
  { part: 'table', index: 3 },
  { part: 'column', index: 4 },
];

/**
 * Pin `getPartialNameFromTableFQN`: requested parts are emitted in
 * positional order (not request order), and a part is included only when
 * the FQN is long enough to hold it. The default separator is `/`, as in
 * the pin; call sites that need the FQN separator pass `.` explicitly
 * (the widget name, the table-FQN builder, and the inline column links).
 * The sliced-part branches (nested column, topic, API endpoint,
 * search-index field, test case) are not ported: no C-14 call site
 * requests them.
 */
export function getPartialNameFromTableFQN(
  fqn: string,
  fqnParts: FqnPartName[],
  joinSeparator = '/',
): string {
  if (!fqn) {
    return '';
  }
  const split = splitFqn(fqn);
  const partial: string[] = [];
  for (const { part, index } of POSITIONAL_PARTS) {
    if (fqnParts.includes(part) && split.length > index) {
      partial.push(split[index] as string);
    }
  }
  return partial.join(joinSeparator);
}

/** Pin `getTableFQNFromColumnFQN`: the first four FQN parts. */
export function getTableFQNFromColumnFQN(columnFQN: string): string {
  return getPartialNameFromTableFQN(
    columnFQN,
    ['service', 'database', 'schema', 'table'],
    '.',
  );
}

/**
 * Pin `getJoinsFromTableJoins` exactly: column-level joins roll up to
 * their parent table FQN, direct table joins are added as-is, counts are
 * grouped by table FQN and summed, the display name is the
 * database.table partial, and the result sorts descending by join count.
 * The dead `joinedTables` memo on the pin detail page (F-7) is not a
 * second slot and is not replicated.
 */
export function getJoinsFromTableJoins(joins?: TableJoins): JoinedTable[] {
  const grouped = new Map<string, number>();
  const add = (fullyQualifiedName: string, joinCount: number): void => {
    grouped.set(fullyQualifiedName, (grouped.get(fullyQualifiedName) ?? 0) + joinCount);
  };
  for (const columnJoin of joins?.columnJoins ?? []) {
    for (const joinedWith of columnJoin.joinedWith ?? []) {
      add(getTableFQNFromColumnFQN(joinedWith.fullyQualifiedName), joinedWith.joinCount);
    }
  }
  for (const joinedWith of joins?.directTableJoins ?? []) {
    add(joinedWith.fullyQualifiedName, joinedWith.joinCount);
  }
  return [...grouped.entries()]
    .map(([fullyQualifiedName, joinCount]) => ({
      fullyQualifiedName,
      joinCount,
      name: getPartialNameFromTableFQN(fullyQualifiedName, ['database', 'table'], '.'),
    }))
    .sort((a, b) => b.joinCount - a.joinCount);
}

/** Pin `checkIfJoinsAvailable`: some join entry names this column. */
export function checkIfJoinsAvailable(
  columnName: string,
  columnJoins: ColumnJoins[] | undefined,
): boolean {
  return columnJoins?.some((join) => join.columnName === columnName) ?? false;
}

/** Pin `getFrequentlyJoinedWithColumns`: the first matching entry's joins. */
export function getFrequentlyJoinedWithColumns(
  columnName: string,
  columnJoins: ColumnJoins[] | undefined,
): JoinedWith[] {
  return columnJoins?.find((join) => join.columnName === columnName)?.joinedWith ?? [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapJoinedWith(value: unknown): JoinedWith[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const fullyQualifiedName = typeof rec.fullyQualifiedName === 'string' ? rec.fullyQualifiedName : '';
    if (!fullyQualifiedName) {
      return [];
    }
    return [{ fullyQualifiedName, joinCount: asNumber(rec.joinCount) ?? 0 }];
  });
}

/** Maps a TableJoins payload (generated entity/data/table.ts). */
export function mapTableJoins(value: unknown): TableJoins | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const columnJoins = Array.isArray(rec.columnJoins)
    ? rec.columnJoins.flatMap((item): ColumnJoins[] => {
        const entry = asRecord(item);
        if (!entry) {
          return [];
        }
        return [
          {
            columnName: typeof entry.columnName === 'string' ? entry.columnName : undefined,
            joinedWith: mapJoinedWith(entry.joinedWith),
          },
        ];
      })
    : undefined;
  return {
    columnJoins,
    directTableJoins: Array.isArray(rec.directTableJoins)
      ? mapJoinedWith(rec.directTableJoins)
      : undefined,
    dayCount: asNumber(rec.dayCount),
    startDate: asNumber(rec.startDate),
  };
}
