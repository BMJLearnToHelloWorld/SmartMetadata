/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, type MaybeRefOrGetter, toValue } from 'vue';
import {
  LANDING_PAGE_MAX_GRID_SIZE,
  LANDING_PAGE_ROW_HEIGHT,
  LANDING_PAGE_WIDGET_MARGIN,
  type LandingPageLayoutItem,
} from './landingPageLayout';

/**
 * Collapse and grid/list state for the topic cards, ported from the
 * official framework (openmetadata-ui `hooks/useTopicsView.ts`).
 *
 * The grid is rendered at a quarter of the layout's row height, with
 * every height and offset multiplied to match: a widget row is
 * 133.33px and the grid cannot allocate less than one row, so a
 * collapsed card — which needs about 96px for its header — would be
 * given a full row and leave empty cell underneath. Subdividing lets
 * a collapsed card take three quarter-rows (96px) instead.
 *
 * Display-only: the saved layout still stores `h: 3` for a normal
 * widget, and the persona editor still renders against the
 * unsubdivided grid. The overrides are derived, never written back:
 * collapsing a card or switching to list view must not read as a
 * layout edit the persona editor would then offer to save. Both
 * reset on navigation — the composable lives in the home view, so
 * leaving the route unmounts it and the state goes with it.
 *
 * ADR:2026-11-10-my-data-customize-page-drag
 */

export const ROW_SUBDIVISIONS = 4;

/**
 * Vertically compacts a subdivided display layout, the react-grid-layout
 * behaviour the native CSS grid this layout renders in does not do on
 * its own: items are slid up within their column until each one starts
 * at the first free subdivided row, so a collapsed card can no longer
 * leave a gap the next row's card overlaps. Display-only — the saved
 * layout is never rewritten; the same function also compacts the editor
 * grid (CustomizeMyData), where the coordinates are unsubdivided.
 *
 * ADR:2026-11-11-home-style-compaction-and-tokens
 */
export function compactDisplayLayout(
  items: readonly LandingPageLayoutItem[],
): LandingPageLayoutItem[] {
  const cursor = new Map<number, number>();
  return [...items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => {
      const nextY = cursor.get(item.x) ?? 0;
      cursor.set(item.x, nextY + item.h);
      return { ...item, y: nextY };
    });
}

/** Three quarter-rows ≈ 96px, just clear of a header-only card. */
export const COLLAPSED_WIDGET_HEIGHT = 3;

export type TopicsViewMode = 'grid' | 'list';

/**
 * Height of one subdivided row, chosen so a subdivided widget is
 * exactly as tall as it was before: the grid sizes an item
 * `h * (row + margin) - margin`, so matching
 * `h * (R + m) === h * S * (r + m)` gives this.
 */
export function subdividedRowHeight(
  rowHeight: number = LANDING_PAGE_ROW_HEIGHT,
  margin: number = LANDING_PAGE_WIDGET_MARGIN,
): number {
  return (rowHeight + margin) / ROW_SUBDIVISIONS - margin;
}

export interface TopicCollapseValue {
  isCollapsed: (widgetKey: string) => boolean;
  isEnabled: boolean;
  toggle: (widgetKey: string) => void;
}

export function useTopicsView(layoutSource: MaybeRefOrGetter<LandingPageLayoutItem[]>) {
  const margin = LANDING_PAGE_WIDGET_MARGIN;
  const rowHeight = subdividedRowHeight(LANDING_PAGE_ROW_HEIGHT, margin);
  const collapsedKeys = ref<ReadonlySet<string>>(new Set());
  const viewMode = ref<TopicsViewMode>('grid');

  const layout = computed(() => toValue(layoutSource));

  const collapseValue = computed<TopicCollapseValue>(() => ({
    isCollapsed: (widgetKey: string) => collapsedKeys.value.has(widgetKey),
    isEnabled: true,
    toggle: (widgetKey: string) => {
      const next = new Set(collapsedKeys.value);
      if (!next.delete(widgetKey)) {
        next.add(widgetKey);
      }
      collapsedKeys.value = next;
    },
  }));

  const isEveryWidgetCollapsed = computed(
    () =>
      layout.value.length > 0 &&
      layout.value.every((widget) => collapsedKeys.value.has(widget.i)),
  );

  function toggleAll(): void {
    collapsedKeys.value = isEveryWidgetCollapsed.value
      ? new Set<string>()
      : new Set(layout.value.map((widget) => widget.i));
  }

  function setViewMode(mode: TopicsViewMode): void {
    viewMode.value = mode;
  }

  const displayLayout = computed<LandingPageLayoutItem[]>(() => {
    const sized = layout.value.map((widget) =>
      collapsedKeys.value.has(widget.i)
        ? { ...widget, h: COLLAPSED_WIDGET_HEIGHT, y: widget.y * ROW_SUBDIVISIONS }
        : { ...widget, h: widget.h * ROW_SUBDIVISIONS, y: widget.y * ROW_SUBDIVISIONS },
    );
    if (viewMode.value !== 'list') {
      // The native CSS grid places items literally, so the subdivided
      // coordinates must be compacted here: without it a collapsed
      // card leaves a gap the next row's card overlaps (T-1).
      return compactDisplayLayout(sized);
    }
    // One full-width column in reading order; the grid compacts the
    // rows, so `y` only has to carry the order.
    return [...sized]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((widget, index) => ({ ...widget, w: 1, x: 0, y: index }));
  });

  // The grid's own sizing, so a deferred widget reserves exactly the
  // space the grid is about to give it.
  function widgetHeight(h: number): number {
    return h * (rowHeight + margin) - margin;
  }

  return {
    collapseValue,
    isEveryWidgetCollapsed,
    toggleAll,
    viewMode,
    setViewMode,
    columns: computed(() =>
      viewMode.value === 'list' ? 1 : LANDING_PAGE_MAX_GRID_SIZE,
    ),
    displayLayout,
    rowHeight,
    widgetHeight,
  };
}
