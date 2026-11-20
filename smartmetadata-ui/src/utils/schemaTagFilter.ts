/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { startCase } from '@/utils/text';
import type { SchemaRow } from '@/types/api';
import type { ColumnFilterOption } from '@/components/ingestion/ColumnFilter.vue';

/**
 * D-2 batch 3 client-side tag filtering (official
 * `utils/TableTags/TableTags.utils.tsx` `getAllTags` /
 * `getFilteredTagsData` + `hooks/useTreeTagFilter.ts`, D-F2-2 design):
 * options are collected recursively from every row (including
 * children), de-duplicated by tag FQN and grouped by source; pruning
 * keeps a row when it carries any selected tag itself or any matching
 * descendant, retaining only the matching child paths. The two
 * columns AND (a row must satisfy both when both are filtered);
 * multiple values inside one column OR. Same shape as the A6
 * `m2-df2-2-server-filter` branch; merge dedupe applies (see
 * d2b3/BENCHMARK.md §11).
 */
export interface SchemaTagFilterGroups {
  classification: ColumnFilterOption[];
  glossary: ColumnFilterOption[];
}

export function collectSchemaTagOptions(rows: SchemaRow[]): SchemaTagFilterGroups {
  const seen = new Map<string, ColumnFilterOption & { source: string }>();
  const visit = (row: SchemaRow): void => {
    for (const tag of row.tags ?? []) {
      if (!seen.has(tag.tagFQN)) {
        seen.set(tag.tagFQN, {
          text: startCase(tag.tagFQN.split('.').pop() ?? tag.tagFQN),
          value: tag.tagFQN,
          source: tag.source || 'Classification',
        });
      }
    }
    for (const child of row.children ?? []) {
      visit(child);
    }
  };
  for (const row of rows) {
    visit(row);
  }
  const groups: SchemaTagFilterGroups = { classification: [], glossary: [] };
  for (const option of seen.values()) {
    if (option.source === 'Glossary') {
      groups.glossary.push({ text: option.text, value: option.value });
    } else {
      groups.classification.push({ text: option.text, value: option.value });
    }
  }
  return groups;
}

function rowMatchesTags(
  row: SchemaRow,
  classificationFqns: string[],
  glossaryFqns: string[],
): boolean {
  const tags = row.tags ?? [];
  const hasClassification =
    classificationFqns.length === 0 ||
    tags.some(
      (tag) =>
        (tag.source === 'Classification' || !tag.source) &&
        classificationFqns.includes(tag.tagFQN),
    );
  const hasGlossary =
    glossaryFqns.length === 0 ||
    tags.some((tag) => tag.source === 'Glossary' && glossaryFqns.includes(tag.tagFQN));
  return hasClassification && hasGlossary;
}

export function filterSchemaRowsByTags(
  rows: SchemaRow[],
  classificationFqns: string[],
  glossaryFqns: string[],
): SchemaRow[] {
  if (classificationFqns.length === 0 && glossaryFqns.length === 0) {
    return rows;
  }
  return rows.flatMap((row) => {
    // Pin getFilteredTagsData: children are always pruned to matches,
    // even when the row itself matches — a self-matching row keeps
    // `children: filteredChildren` (possibly empty), never the full
    // unfiltered subtree.
    const prunedChildren = row.children?.length
      ? filterSchemaRowsByTags(row.children, classificationFqns, glossaryFqns)
      : [];
    if (rowMatchesTags(row, classificationFqns, glossaryFqns) || prunedChildren.length > 0) {
      return [
        {
          ...row,
          ...(row.children?.length ? { children: prunedChildren } : {}),
        },
      ];
    }
    return [];
  });
}
