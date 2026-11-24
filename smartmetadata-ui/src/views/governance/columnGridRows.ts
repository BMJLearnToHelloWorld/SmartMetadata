/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { assetLocation } from '@/catalog/entityRoutes';
import type {
  ColumnGridGroup,
  ColumnGridItem,
  ColumnGridOccurrence,
  ColumnGridTag,
  ColumnUpdateInput,
} from '@/api/columns';

/**
 * Pin row model (ColumnGrid.component.tsx `transformGridItemsToRows`,
 * `buildVariationRows` / `buildMultiOccurrenceRows` /
 * `buildSingleOccurrenceRows`): one parent row per column name,
 * expanded into one child row per occurrence; a single-occurrence
 * column is one flat row carrying its occurrence. Row ids are pin's:
 * parent `columnName`, child `${columnName}-${columnFQN}`.
 *
 * Edits stage per occurrence row (`editedDisplayName` /
 * `editedDescription` / `editedTags` on pin's `ColumnGridRowData`);
 * the view keeps them in a map keyed by row id and merges them here.
 */
export type ColumnGridRowKind = 'group' | 'occurrence';

export interface ColumnGridEditedValues {
  displayName?: string;
  description?: string;
  tags?: ColumnGridTag[];
}

export interface ColumnGridRow {
  id: string;
  kind: ColumnGridRowKind;
  columnName: string;
  displayName?: string;
  description?: string;
  dataType?: string;
  tags: ColumnGridTag[];
  occurrenceCount: number;
  metadataStatus?: string;
  /** Occurrence rows: `service / database / schema`. Group rows: primary path. */
  path: string;
  additionalPathsCount: number;
  /** Group rows only: groups with BOTH description AND tags, over occurrences. */
  coverageCovered?: number;
  coverageTotal?: number;
  parentId?: string;
  group?: ColumnGridGroup;
  occurrence?: ColumnGridOccurrence;
  item?: ColumnGridItem;
  childrenIds: string[];
  edited?: ColumnGridEditedValues;
}

/** Pin `buildPath`: service / database / schema, skipping missing parts. */
export function buildOccurrencePath(occurrence: ColumnGridOccurrence): string {
  return [occurrence.serviceName, occurrence.databaseName, occurrence.schemaName]
    .filter((part) => part)
    .join(' / ');
}

function splitTagKinds(tags: ColumnGridTag[]): {
  classification: ColumnGridTag[];
  glossary: ColumnGridTag[];
} {
  return {
    classification: tags.filter((tag) => tag.source !== 'Glossary'),
    glossary: tags.filter((tag) => tag.source === 'Glossary'),
  };
}

/** Last segment of a tag FQN, the display label pin's pickers show. */
export function tagDisplayLabel(tag: ColumnGridTag): string {
  const parts = tag.tagFQN.split('.');
  return parts[parts.length - 1] || tag.tagFQN;
}

function uniquePaths(occurrences: ColumnGridOccurrence[]): {
  primary: string;
  additionalCount: number;
} {
  const paths = [...new Set(occurrences.map(buildOccurrencePath).filter(Boolean))];
  return { primary: paths[0] || '', additionalCount: Math.max(0, paths.length - 1) };
}

function coverage(item: ColumnGridItem): { covered: number; total: number } {
  let covered = 0;
  let total = 0;
  for (const group of item.groups) {
    const count = group.occurrences.length;
    total += count;
    if (group.description?.trim() && group.tags.length > 0) {
      covered += count;
    }
  }
  return { covered, total };
}

function aggregateTags(item: ColumnGridItem): ColumnGridTag[] {
  const seen = new Map<string, ColumnGridTag>();
  for (const group of item.groups) {
    for (const tag of group.tags) {
      if (!seen.has(tag.tagFQN)) {
        seen.set(tag.tagFQN, tag);
      }
    }
  }
  return [...seen.values()];
}

function occurrenceRow(
  item: ColumnGridItem,
  group: ColumnGridGroup,
  occurrence: ColumnGridOccurrence,
  parentId: string | undefined,
): ColumnGridRow {
  return {
    id: `${item.columnName}-${occurrence.columnFQN}`,
    kind: 'occurrence',
    columnName: item.columnName,
    displayName: group.displayName,
    description: group.description,
    dataType: group.dataType,
    tags: group.tags,
    occurrenceCount: 1,
    metadataStatus: group.metadataStatus,
    path: buildOccurrencePath(occurrence),
    additionalPathsCount: 0,
    parentId,
    group,
    occurrence,
    childrenIds: [],
  };
}

export function buildColumnGridRows(items: ColumnGridItem[]): ColumnGridRow[] {
  const rows: ColumnGridRow[] = [];
  for (const item of items) {
    const allOccurrences = item.groups.flatMap((group) => group.occurrences);
    const totalOccurrences = allOccurrences.length;
    const paths = uniquePaths(allOccurrences);
    const cover = coverage(item);

    if (totalOccurrences <= 1) {
      const group = item.groups[0];
      const occurrence = allOccurrences[0];
      if (!group || !occurrence) {
        continue;
      }
      rows.push({
        ...occurrenceRow(item, group, occurrence, undefined),
        // Pin's single-occurrence row id is the bare column name.
        id: item.columnName,
        occurrenceCount: 1,
        metadataStatus: item.metadataStatus ?? group.metadataStatus,
      });
      continue;
    }

    const parent: ColumnGridRow = {
      id: item.columnName,
      kind: 'group',
      columnName: item.columnName,
      tags: aggregateTags(item),
      occurrenceCount: totalOccurrences,
      metadataStatus: item.metadataStatus,
      path: paths.primary,
      additionalPathsCount: paths.additionalCount,
      coverageCovered: cover.covered,
      coverageTotal: cover.total,
      item,
      childrenIds: [],
    };
    const children: ColumnGridRow[] = [];
    for (const group of item.groups) {
      for (const occurrence of group.occurrences) {
        const child = occurrenceRow(item, group, occurrence, item.columnName);
        parent.childrenIds.push(child.id);
        children.push(child);
      }
    }
    rows.push(parent, ...children);
  }
  return rows;
}

export function hasEditedValues(row: ColumnGridRow): boolean {
  return (
    row.edited?.displayName !== undefined ||
    row.edited?.description !== undefined ||
    row.edited?.tags !== undefined
  );
}

/**
 * Selection expansion (pin `handleGroupSelect` / `handleTableSelectionChange`):
 * a selected group row stands for all of its occurrence rows; occurrence
 * rows stand for themselves. Group ids never reach the update builder.
 */
export function expandSelectionToOccurrences(
  rows: ColumnGridRow[],
  selectedIds: ReadonlySet<string>,
): ColumnGridRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const occurrences: ColumnGridRow[] = [];
  for (const id of selectedIds) {
    const row = byId.get(id);
    if (!row) {
      continue;
    }
    const targets =
      row.kind === 'group'
        ? row.childrenIds.flatMap((childId) => {
            const child = byId.get(childId);
            return child ? [child] : [];
          })
        : [row];
    for (const target of targets) {
      if (!seen.has(target.id)) {
        seen.add(target.id);
        occurrences.push(target);
      }
    }
  }
  return occurrences;
}

/**
 * Pin `buildColumnUpdatesByKey`: one update per occurrence columnFQN,
 * carrying only the fields that actually changed. Display name only
 * when the staged value differs from the row's current value,
 * description only when staged, tags only when staged (split back
 * into classification FQNs and glossary-term FQNs).
 */
export function buildColumnUpdates(
  rows: ColumnGridRow[],
  selectedIds: ReadonlySet<string>,
): ColumnUpdateInput[] {
  const updatesByKey = new Map<string, ColumnUpdateInput>();
  for (const row of expandSelectionToOccurrences(rows, selectedIds)) {
    if (!row.occurrence || !hasEditedValues(row)) {
      continue;
    }
    const update: ColumnUpdateInput = {
      columnFQN: row.occurrence.columnFQN,
      entityType: row.occurrence.entityType,
    };
    let changed = false;
    if (
      row.edited?.displayName !== undefined &&
      row.edited.displayName !== (row.displayName ?? '')
    ) {
      update.displayName = row.edited.displayName;
      changed = true;
    }
    if (row.edited?.description !== undefined) {
      update.description = row.edited.description;
      changed = true;
    }
    if (row.edited?.tags !== undefined) {
      const { classification, glossary } = splitTagKinds(row.edited.tags);
      update.tags = classification.map((tag) => tag.tagFQN);
      update.glossaryTerms = glossary.map((tag) => tag.tagFQN);
      changed = true;
    }
    if (changed) {
      updatesByKey.set(update.columnFQN, update);
    }
  }
  return [...updatesByKey.values()];
}

/**
 * Pin `COLUMN_GRID_COLUMN_LINK_TAB_MAP` (ColumnGrid.component.tsx:175):
 * the detail tab a column link opens on. Product tab keys are the same
 * (`catalog/entityDetailTabs.ts`: table/topic/container `schema`,
 * dashboardDataModel `model`, searchIndex `fields`).
 */
export function columnLinkTabForEntityType(entityType: string): string {
  switch (entityType.toLowerCase()) {
    case 'dashboarddatamodel':
      return 'model';
    case 'searchindex':
      return 'fields';
    case 'table':
    case 'topic':
    case 'container':
    default:
      return 'schema';
  }
}

/**
 * Pin `getColumnLink` (ColumnGrid.component.tsx:1157): entity detail
 * path for the occurrence's entity, on the column's tab, with the
 * column name as the hash fragment. Product form: the `asset` route
 * (`catalog/entityRoutes.ts`) with `query.tab`, read by
 * `AssetDetailView.vue:1003`.
 */
export function columnEntityLocation(
  occurrence: ColumnGridOccurrence,
): { name: string; params: { entityType: string; fqn: string }; query: { tab: string }; hash: string } {
  const columnName = occurrence.columnFQN.split('.').pop() || '';
  return {
    ...assetLocation(occurrence.entityType, occurrence.entityFQN),
    query: { tab: columnLinkTabForEntityType(occurrence.entityType) },
    hash: columnName ? `#${encodeURIComponent(columnName)}` : '',
  };
}

/** Pin `getEntityLink` (ColumnGrid.component.tsx:~1192): plain entity detail link. */
export function entityLocation(
  occurrence: ColumnGridOccurrence,
): { name: string; params: { entityType: string; fqn: string } } {
  return assetLocation(occurrence.entityType, occurrence.entityFQN);
}

/** Display name for the asset cell: pin falls back to the FQN's last segment. */
export function entityLinkLabel(occurrence: ColumnGridOccurrence): string {
  if (occurrence.entityDisplayName) {
    return occurrence.entityDisplayName;
  }
  const parts = occurrence.entityFQN.split('.');
  return parts[parts.length - 1] || occurrence.entityFQN;
}
