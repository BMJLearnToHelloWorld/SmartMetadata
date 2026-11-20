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
import { startCase } from '@/utils/text';

export interface SchemaTagFilterOption {
  text: string;
  value: string;
}

export interface SchemaTagFilterOptions {
  classification: SchemaTagFilterOption[];
  glossary: SchemaTagFilterOption[];
}

export interface SchemaTagFilterSelection {
  /** Selected Classification tag FQNs (the Tags column's filter). */
  tags: string[];
  /** Selected Glossary term FQNs (the Glossary Terms column's filter). */
  glossaryTerms: string[];
}

export const EMPTY_SCHEMA_TAG_FILTER: SchemaTagFilterSelection = { tags: [], glossaryTerms: [] };

export function hasSchemaTagFilter(selection: SchemaTagFilterSelection): boolean {
  return selection.tags.length > 0 || selection.glossaryTerms.length > 0;
}

/**
 * Collects the tag-filter options for the Tags / Glossary Terms columns
 * (official `utils/TableTags/TableTags.utils.tsx` `getAllTags`): every
 * tag on every row — nested STRUCT children included — deduplicated by
 * tag FQN and grouped by source. A tag with no source belongs to the
 * Classification column, the same rule the schema cell applies when it
 * renders an unsourced label. Labels are `startCase`d here because the
 * shared `ColumnFilter` renders `option.text` verbatim (official
 * `ColumnFilter` labels with `startCase(filter.text)`).
 */
export function collectSchemaTagOptions(rows: SchemaRow[]): SchemaTagFilterOptions {
  const classification = new Map<string, SchemaTagFilterOption>();
  const glossary = new Map<string, SchemaTagFilterOption>();
  const visit = (row: SchemaRow): void => {
    for (const tag of row.tags ?? []) {
      const fqn = tag.tagFQN;
      if (!fqn) {
        continue;
      }
      const group = tag.source === 'Glossary' ? glossary : classification;
      if (!group.has(fqn)) {
        group.set(fqn, { text: startCase(fqn), value: fqn });
      }
    }
    for (const child of row.children ?? []) {
      visit(child);
    }
  };
  for (const row of rows) {
    visit(row);
  }
  return { classification: [...classification.values()], glossary: [...glossary.values()] };
}

/**
 * Client-side tree filter for the four non-Table schema surfaces
 * (official `hooks/useTreeTagFilter.ts` + `getFilteredTagsData`): a row
 * is kept when it carries one of the selected tags itself or has a kept
 * descendant, and a kept row's children are pruned to the matched paths
 * only. The two columns chain — a row must satisfy BOTH the
 * Classification and the Glossary selection (AND across columns,
 * matching antd's cross-column semantics and the server's
 * `ColumnTagFilter`) — while the values within one column are OR'd.
 * A kept row whose children all drop out loses its `children` (the
 * product's `mapColumns` guard: empty children never draw an expand
 * icon); official keeps `children: []` there, which the product's
 * table would render as an expandable leaf.
 */
export function filterSchemaRowsByTags(
  rows: SchemaRow[],
  selection: SchemaTagFilterSelection,
): SchemaRow[] {
  let result = rows;
  result = filterByOneGroup(result, selection.tags);
  result = filterByOneGroup(result, selection.glossaryTerms);
  return result;
}

function filterByOneGroup(rows: SchemaRow[], selected: string[]): SchemaRow[] {
  if (selected.length === 0) {
    return rows;
  }
  const selectedSet = new Set(selected);
  const visit = (row: SchemaRow): SchemaRow | null => {
    const children = (row.children ?? []).flatMap((child) => {
      const kept = visit(child);
      return kept ? [kept] : [];
    });
    const selfTagged = (row.tags ?? []).some((tag) => selectedSet.has(tag.tagFQN));
    if (!selfTagged && children.length === 0) {
      return null;
    }
    return { ...row, children: children.length ? children : undefined };
  };
  return rows.flatMap((row) => {
    const kept = visit(row);
    return kept ? [kept] : [];
  });
}
