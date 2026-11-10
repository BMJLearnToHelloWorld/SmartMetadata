/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { ApiError } from '@/api/client';
import { getMetricByFqn } from '@/api/metrics';

/**
 * Bulk delete helpers, ported from the official MetricHierarchyUtils
 * (utils/MetricEntityUtils/MetricHierarchyUtils.ts) and the bounded
 * re-read that replaces the official AsyncDeleteProvider refresh
 * (ADR:2026-11-08-metric-bulk-delete-bounded-reread).
 *
 * The official helpers walk a nested tree (MetricTableRow, children
 * nested under parents, group banners in between). The product list
 * renders a flat row list, so the input here is the flattened parent
 * link list the list view builds from its tree/flat data — one link
 * per loaded metric, parent id where the metric has one. The walk
 * logic itself is verbatim: a selected metric is topmost when no
 * selected ancestor sits above it; an unloaded ancestor is the first
 * ancestor on the chain that is not loaded on the page (a status
 * filter can hide a middle metric while its parent and child both
 * show, so the walk must stop at the first gap, not skip past it).
 */

export interface MetricParentLink {
  id: string;
  parentId?: string;
  /** Needed by the bounded re-read, which polls by FQN. */
  fullyQualifiedName?: string;
}

function parentIdById(links: MetricParentLink[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    if (link.parentId) {
      map.set(link.id, link.parentId);
    }
  }
  return map;
}

/**
 * Official getUnloadedMetricAncestorIds: ancestors of the selected
 * metrics that are not loaded on the page, so the walk up their chain
 * stops there. The caller fills the gap with getMetricParentIds and
 * passes the result as `extraParentIds` to getTopmostSelectedMetrics.
 */
export function getUnloadedMetricAncestorIds(
  links: MetricParentLink[],
  selectedIds: string[],
): string[] {
  const selected = new Set(selectedIds);
  const loadedIds = new Set(links.map(({ id }) => id));
  const parentMap = parentIdById(links);
  const unloaded = new Set<string>();
  for (const id of selectedIds) {
    const visited = new Set<string>();
    let parentId = parentMap.get(id);
    while (parentId && !selected.has(parentId) && !visited.has(parentId)) {
      if (!loadedIds.has(parentId)) {
        unloaded.add(parentId);
        break;
      }
      visited.add(parentId);
      parentId = parentMap.get(parentId);
    }
  }
  return [...unloaded];
}

/**
 * Official getTopmostSelectedMetrics: the selected metrics that have
 * no selected ancestor. A recursive delete of a parent already removes
 * its variants, so a separate job for a selected child races it and
 * fails once the child is gone. Ancestry comes from the loaded parent
 * links plus `extraParentIds` for ancestors that are not loaded on
 * the page.
 */
export function getTopmostSelectedMetrics(
  links: MetricParentLink[],
  selectedIds: string[],
  extraParentIds?: Map<string, string>,
): MetricParentLink[] {
  const selected = new Set(selectedIds);
  const parentMap = new Map<string, string>([
    ...(extraParentIds ?? []),
    ...parentIdById(links),
  ]);
  const hasSelectedAncestor = (id: string): boolean => {
    const visited = new Set<string>();
    let parentId = parentMap.get(id);
    while (parentId && !visited.has(parentId)) {
      if (selected.has(parentId)) {
        return true;
      }
      visited.add(parentId);
      parentId = parentMap.get(parentId);
    }
    return false;
  };
  return links.filter(({ id }) => selected.has(id) && !hasSelectedAncestor(id));
}

// ---------------------------------------------------------------------------
// Bounded re-read (the product equivalent of the official
// AsyncDeleteProvider completion refresh)
// ---------------------------------------------------------------------------

export interface WaitForMetricsGoneOptions {
  /** Poll interval; official websocket pushes are instant, the product polls. */
  intervalMs?: number;
  /** Total budget; on expiry the caller reloads once anyway. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to the real metric lookup. */
  fetchMetric?: (fqn: string) => Promise<unknown>;
}

const BOUNDED_REREAD_INTERVAL_MS = 2000;
const BOUNDED_REREAD_TIMEOUT_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Bounded re-read after a bulk delete submit. A soft-deleted metric is
 * invisible to GET /v1/metrics/name/{fqn} (the default include hides
 * soft-deleted entities), so a 404 means "gone". Polls every 2s for
 * at most 30s; resolves true when every FQN is gone, false on timeout.
 * A non-404 failure is treated as "not gone yet" — a transient read
 * failure must not report a delete as finished. The caller reloads
 * the list and the hierarchy either way; on false it also warns that
 * some deletions may not have finished.
 * ADR:2026-11-08-metric-bulk-delete-bounded-reread.
 */
export async function waitForMetricsGone(
  fqns: string[],
  options: WaitForMetricsGoneOptions = {},
): Promise<boolean> {
  const intervalMs = options.intervalMs ?? BOUNDED_REREAD_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? BOUNDED_REREAD_TIMEOUT_MS;
  const fetchMetric = options.fetchMetric ?? getMetricByFqn;
  const remaining = new Set(fqns);
  const startedAt = Date.now();
  while (remaining.size > 0) {
    const checks = await Promise.all(
      [...remaining].map(async (fqn) => {
        try {
          await fetchMetric(fqn);
          return { fqn, gone: false };
        } catch (error) {
          return { fqn, gone: error instanceof ApiError && error.status === 404 };
        }
      }),
    );
    for (const check of checks) {
      if (check.gone) {
        remaining.delete(check.fqn);
      }
    }
    if (remaining.size === 0) {
      return true;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return false;
    }
    await sleep(intervalMs);
  }
  return true;
}
