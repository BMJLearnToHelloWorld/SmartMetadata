/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SchemaRow } from '@/types/api';

/**
 * D-2 batch 3 schema-column helpers (official
 * `utils/TablePureUtils.ts`): `updateColumnInNestedStructure` and
 * `searchInFields`, ported to the product `SchemaRow` shape.
 * `pruneEmptyChildren` needs no port — `mapColumns` already drops empty
 * children lists at mapping time.
 */

/**
 * Returns a copy of `rows` with the row whose `fullyQualifiedName`
 * matches replaced by the patch merged over it, at any nesting depth
 * (official `updateColumnInNestedStructure`). The match is by FQN,
 * not by piece key: server-fetched pages carry FQNs but no piece keys.
 * A patch that carries `children: undefined` clears nested children
 * (the server response for a leaf column).
 */
export function updateNestedSchemaRows(
  rows: SchemaRow[],
  columnFqn: string,
  patch: Partial<SchemaRow>,
): SchemaRow[] {
  return rows.map((row) => {
    if (row.fullyQualifiedName === columnFqn) {
      const next = { ...row, ...patch };
      if ('children' in patch && patch.children === undefined) {
        // The server's updated column explicitly carries no children:
        // keep the row a leaf instead of retaining stale nested rows.
        // A patch without a `children` key leaves them untouched.
        delete next.children;
      }
      return next;
    }
    if (row.children?.length) {
      return { ...row, children: updateNestedSchemaRows(row.children, columnFqn, patch) };
    }
    return row;
  });
}

/**
 * Client-side field search (official `searchInFields`): a row matches
 * when its name, description or data type contains the query
 * (case-insensitive); a non-matching row is kept only when one of its
 * children matches, and then only with the matching children (the
 * matching ancestor path is preserved, the rest pruned).
 */
export function searchSchemaRows(rows: SchemaRow[], searchText: string): SchemaRow[] {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return rows;
  }
  const matches = (row: SchemaRow): boolean =>
    row.name.toLowerCase().includes(query) ||
    (row.description ?? '').toLowerCase().includes(query) ||
    row.dataType.toLowerCase().includes(query);
  return rows.flatMap((row) => {
    if (matches(row)) {
      return [row];
    }
    if (row.children?.length) {
      const searchedChildren = searchSchemaRows(row.children, searchText);
      if (searchedChildren.length > 0) {
        return [{ ...row, children: searchedChildren }];
      }
    }
    return [];
  });
}

/** All row keys of a (possibly nested) row list, for expand-all. */
export function schemaRowKeys(rows: SchemaRow[]): string[] {
  return rows.flatMap((row) => [
    row.key,
    ...(row.children?.length ? schemaRowKeys(row.children) : []),
  ]);
}
