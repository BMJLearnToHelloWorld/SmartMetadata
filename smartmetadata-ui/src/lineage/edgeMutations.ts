/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Lineage edge writes, mapped from the official handlers at pin a3012259ca
 * (`utils/Lineage/handlers/edgeMutations.ts`, `utils/EntityLineageEdgeUtils.ts`
 * `createNewEdge`, `components/Lineage/LineageMap/LineageMap.utils.ts`
 * `getLineageEditColumnPair`, `components/Lineage/Lineage/Lineage.tsx`
 * `removeColumnEdge`).
 *
 * Pin saves by entity ID (`PUT /lineage` with `AddLineage`); the product
 * saves by name (`PUT /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn}`,
 * `putEntityLineage`). The merge semantics are the same: the new column
 * pair is merged into the edge's existing `columnsLineage`, never written
 * over it blind — the existing details come from `getLineageEdgeDetails`
 * (a 404 means "no edge yet", so the pair stands alone).
 */

import {
  getLineageEdgeDetails,
  isLineageNotFound,
  putEntityLineage,
  type LineageEdgeEndpoints,
} from '@/api/lineage';

/** One column mapping on a lineage edge (`ColumnLineage`). */
export interface LineageColumnMapping {
  fromColumns: string[];
  toColumn?: string;
  function?: string;
}

/** A column pair being added to (or removed from) an edge. */
export interface LineageColumnPair {
  fromColumn: string;
  toColumn: string;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Read an edge's `columnsLineage` out of an unknown LineageDetails payload. */
export function readColumnsLineage(details: unknown): LineageColumnMapping[] {
  if (!details || typeof details !== 'object') {
    return [];
  }
  const columns = (details as Record<string, unknown>).columnsLineage;
  if (!Array.isArray(columns)) {
    return [];
  }
  return columns.flatMap((item): LineageColumnMapping[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const rec = item as Record<string, unknown>;
    const fromColumns = asStringList(rec.fromColumns);
    const toColumn = typeof rec.toColumn === 'string' ? rec.toColumn : '';
    const fn = typeof rec.function === 'string' ? rec.function : '';
    if (fromColumns.length === 0 && !toColumn) {
      return [];
    }
    return [
      {
        fromColumns,
        ...(toColumn ? { toColumn } : {}),
        ...(fn ? { function: fn } : {}),
      },
    ];
  });
}

/**
 * Pin `getLineageEditColumnPair` (LineageMap.utils.ts:794): an upstream
 * edit connects the picked column to the requested one; a downstream edit
 * the other way round. Either side missing means an entity-level edit
 * (no column pair).
 */export function getLineageEditColumnPair(
  isUpstream: boolean,
  requestColumnFqn?: string,
  pickedColumnFqn?: string,
): LineageColumnPair | undefined {
  if (!requestColumnFqn || !pickedColumnFqn) {
    return undefined;
  }
  return isUpstream
    ? { fromColumn: pickedColumnFqn, toColumn: requestColumnFqn }
    : { fromColumn: requestColumnFqn, toColumn: pickedColumnFqn };
}

/**
 * Merge a column pair into an edge's existing `columnsLineage`, mirroring
 * pin's `buildLineagePayload`/`createNewEdge` merge: the pair joins the
 * mapping for its `toColumn` (adding its `fromColumn` if not already
 * there), or starts a new mapping. Returns the full new list; the pair
 * already present is a no-op returning the list unchanged.
 */
export function mergeColumnPair(
  existing: LineageColumnMapping[],
  pair: LineageColumnPair,
): LineageColumnMapping[] {
  const index = existing.findIndex((mapping) => mapping.toColumn === pair.toColumn);
  if (index === -1) {
    return [...existing, { fromColumns: [pair.fromColumn], toColumn: pair.toColumn }];
  }
  const mapping = existing[index];
  if (mapping.fromColumns.includes(pair.fromColumn)) {
    return existing;
  }
  return [
    ...existing.slice(0, index),
    { ...mapping, fromColumns: [...mapping.fromColumns, pair.fromColumn] },
    ...existing.slice(index + 1),
  ];
}

/**
 * Remove a column pair from an edge's `columnsLineage`, mirroring pin's
 * `removeColumnEdge` (`getColumnLineageData`): the `fromColumn` drops out
 * of its mapping; a mapping left with no `fromColumns` and no `toColumn`
 * is dropped. Returns the full new list.
 */
export function removeColumnPair(
  existing: LineageColumnMapping[],
  pair: LineageColumnPair,
): LineageColumnMapping[] {
  return existing.flatMap((mapping): LineageColumnMapping[] => {
    if (mapping.toColumn !== pair.toColumn) {
      return [mapping];
    }
    const fromColumns = mapping.fromColumns.filter((column) => column !== pair.fromColumn);
    // Pin getColumnLineageData: a mapping whose from-columns empty out is
    // dropped entirely, not kept with an empty list.
    if (fromColumns.length === 0) {
      return [];
    }
    return [{ ...mapping, fromColumns }];
  });
}

export interface LineageEdgeSaveTarget extends LineageEdgeEndpoints {
  /** Entity ids for the details probe; without them no merge is possible. */
  fromId?: string;
  toId?: string;
}

async function probeExistingDetails(
  target: LineageEdgeSaveTarget,
): Promise<Record<string, unknown> | undefined> {
  if (!target.fromId || !target.toId) {
    return undefined;
  }
  try {
    return await getLineageEdgeDetails(target.fromId, target.toId);
  } catch (error) {
    if (isLineageNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Pin `saveLineageEdge` (edgeMutations.ts): add (or extend) the lineage
 * edge between two entities, merging a column pair into the edge's
 * existing column lineage. Resolves false when there is nothing to save
 * (same entity) or the save failed; only a failed edge-details lookup
 * rejects. On success the caller refetches the graph.
 */
export async function saveLineageEdge(
  target: LineageEdgeSaveTarget,
  columnPair?: LineageColumnPair,
): Promise<boolean> {
  if (target.fromFqn === target.toFqn && target.fromType === target.toType) {
    return false;
  }
  // A failed details lookup (other than 404) rejects, like pin: the
  // canvas catches it and toasts, it is never silently swallowed.
  const existing = await probeExistingDetails(target);
  const columnsLineage = columnPair
    ? mergeColumnPair(readColumnsLineage(existing), columnPair)
    : readColumnsLineage(existing);
  const details: Record<string, unknown> = {
    ...(existing ?? {}),
    source: 'Manual',
    ...(columnsLineage.length > 0 ? { columnsLineage } : {}),
  };
  // A pre-existing edge with no column lineage keeps no `columnsLineage`
  // key at all (pin's payload omits an empty list the same way).
  if (columnsLineage.length === 0) {
    delete details.columnsLineage;
  }
  try {
    await putEntityLineage({ ...target, details });
  } catch {
    return false;
  }
  return true;
}

/**
 * Pin `removeColumnEdge` (Lineage.tsx:1343): remove one column mapping
 * from an edge by re-PUTting the edge with the pair removed from its
 * `columnsLineage`. Resolves false when the pair is not on the edge or
 * the save failed; only a failed edge-details lookup rejects.
 */
export async function removeColumnLineageEdge(
  target: LineageEdgeSaveTarget,
  pair: LineageColumnPair,
): Promise<boolean> {
  // A failed details lookup (other than 404) rejects, like pin: the
  // canvas catches it and toasts, it is never silently swallowed.
  const existing = await probeExistingDetails(target);
  if (!existing) {
    return false;
  }
  const columnsLineage = removeColumnPair(readColumnsLineage(existing), pair);
  const details: Record<string, unknown> = {
    ...existing,
    ...(columnsLineage.length > 0 ? { columnsLineage } : {}),
  };
  if (columnsLineage.length === 0) {
    delete details.columnsLineage;
  }
  try {
    await putEntityLineage({ ...target, details });
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Add-lineage targets (pin AddLineagePopover.utils.ts)
// ---------------------------------------------------------------------------

/** Only these carry columns a column edit can connect to. */
const COLUMN_CAPABLE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  'table',
  'dashboardDataModel',
]);

/**
 * Pin `getCanvasColumnAssets`: the canvas nodes a column edit can connect
 * to — column-carrying, persisted (an id), and not the node being edited.
 * A column edit connects to another node already on the canvas, as
 * dragging between column handles did.
 */
export function getCanvasColumnAssets(
  nodes: { id: string; entityType: string }[],
  excludeEntityId?: string,
): { id: string; entityType: string }[] {
  const byId = new Map<string, { id: string; entityType: string }>();
  for (const node of nodes) {
    if (
      node.id &&
      COLUMN_CAPABLE_ENTITY_TYPES.has(node.entityType) &&
      node.id !== excludeEntityId
    ) {
      byId.set(node.id, node);
    }
  }
  return [...byId.values()];
}
