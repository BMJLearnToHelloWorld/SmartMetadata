/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  COLLAPSED_WIDGET_HEIGHT,
  ROW_SUBDIVISIONS,
  subdividedRowHeight,
  useTopicsView,
  type TopicsViewMode,
} from './useTopicsView';
import type { LandingPageLayoutItem } from './landingPageLayout';

function item(i: string, x: number, y: number): LandingPageLayoutItem {
  return { i, x, y, w: 1, h: 3, static: false };
}

const LAYOUT = [item('KnowledgePanel.A', 0, 0), item('KnowledgePanel.B', 1, 0), item('KnowledgePanel.C', 0, 1)];

describe('useTopicsView', () => {
  it('subdivides the row height so a widget keeps its pixel height', () => {
    // (133.33 + 16) / 4 - 16 = 21.3325; 12 subdivided rows = 431.99px.
    expect(subdividedRowHeight()).toBeCloseTo(21.3325, 4);
    expect(ROW_SUBDIVISIONS).toBe(4);
    const topics = useTopicsView(LAYOUT);
    expect(topics.widgetHeight(12)).toBeCloseTo(431.99, 2);
    expect(topics.widgetHeight(COLLAPSED_WIDGET_HEIGHT)).toBeCloseTo(96, 0);
  });

  it('starts in grid mode with every widget expanded at h*4 / y*4, compacted', () => {
    const topics = useTopicsView(LAYOUT);
    expect(topics.viewMode.value).toBe('grid');
    expect(topics.columns.value).toBe(2);
    // Compaction slides C up to the first free row of its column:
    // A occupies rows 0–11, so C starts at 12, not at its raw y*4 = 4.
    // ADR:2026-11-11-home-style-compaction-and-tokens
    expect(topics.displayLayout.value.map((w) => [w.i, w.x, w.y, w.h])).toEqual([
      ['KnowledgePanel.A', 0, 0, 12],
      ['KnowledgePanel.B', 1, 0, 12],
      ['KnowledgePanel.C', 0, 12, 12],
    ]);
  });

  it('collapses one widget to h=3 at y*4 and leaves the others expanded', () => {
    const topics = useTopicsView(LAYOUT);
    topics.collapseValue.value.toggle('KnowledgePanel.B');
    expect(topics.collapseValue.value.isCollapsed('KnowledgePanel.B')).toBe(true);
    expect(topics.collapseValue.value.isCollapsed('KnowledgePanel.A')).toBe(false);
    expect(topics.isEveryWidgetCollapsed.value).toBe(false);
    // C is still compacted onto A's bottom edge (row 12).
    expect(topics.displayLayout.value.map((w) => [w.i, w.x, w.y, w.h])).toEqual([
      ['KnowledgePanel.A', 0, 0, 12],
      ['KnowledgePanel.B', 1, 0, 3],
      ['KnowledgePanel.C', 0, 12, 12],
    ]);
  });

  it('compacts the grid so same-column cards never intersect', () => {
    const noIntersections = (layout: readonly LandingPageLayoutItem[]) => {
      const byColumn = new Map<number, [number, number][]>();
      for (const w of layout) {
        byColumn.set(w.x, [...(byColumn.get(w.x) ?? []), [w.y, w.y + w.h]]);
      }
      for (const ranges of byColumn.values()) {
        const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
        }
      }
    };
    const topics = useTopicsView(LAYOUT);
    noIntersections(topics.displayLayout.value);
    topics.collapseValue.value.toggle('KnowledgePanel.B');
    noIntersections(topics.displayLayout.value);
    topics.toggleAll();
    noIntersections(topics.displayLayout.value);
    // All-collapsed packs tightly: 3 rows per card per column.
    expect(topics.displayLayout.value.map((w) => [w.i, w.x, w.y, w.h])).toEqual([
      ['KnowledgePanel.A', 0, 0, 3],
      ['KnowledgePanel.B', 1, 0, 3],
      ['KnowledgePanel.C', 0, 3, 3],
    ]);
  });

  it('toggle-all collapses every widget, then expands them all again', () => {
    const topics = useTopicsView(LAYOUT);
    topics.toggleAll();
    expect(topics.isEveryWidgetCollapsed.value).toBe(true);
    expect(topics.displayLayout.value.every((w) => w.h === COLLAPSED_WIDGET_HEIGHT)).toBe(true);
    topics.toggleAll();
    expect(topics.isEveryWidgetCollapsed.value).toBe(false);
    expect(topics.displayLayout.value.every((w) => w.h === 12)).toBe(true);
  });

  it('toggle-all on an empty layout collapses nothing', () => {
    const topics = useTopicsView([]);
    topics.toggleAll();
    expect(topics.isEveryWidgetCollapsed.value).toBe(false);
  });

  it('list mode is one column in reading order: w:1, x:0, y:index', () => {
    const topics = useTopicsView(LAYOUT);
    topics.setViewMode('list' as TopicsViewMode);
    expect(topics.columns.value).toBe(1);
    expect(topics.displayLayout.value.map((w) => [w.i, w.x, w.y, w.w, w.h])).toEqual([
      ['KnowledgePanel.A', 0, 0, 1, 12],
      ['KnowledgePanel.B', 0, 1, 1, 12],
      ['KnowledgePanel.C', 0, 2, 1, 12],
    ]);
  });

  it('list mode keeps a collapsed widget collapsed', () => {
    const topics = useTopicsView(LAYOUT);
    topics.collapseValue.value.toggle('KnowledgePanel.C');
    topics.setViewMode('list' as TopicsViewMode);
    expect(topics.displayLayout.value.map((w) => [w.i, w.h])).toEqual([
      ['KnowledgePanel.A', 12],
      ['KnowledgePanel.B', 12],
      ['KnowledgePanel.C', 3],
    ]);
  });

  it('collapse state is derived: it follows the layout and is never written back', () => {
    const layout = ref(LAYOUT);
    const topics = useTopicsView(layout);
    topics.collapseValue.value.toggle('KnowledgePanel.A');
    expect(layout.value[0].h).toBe(3);
    expect(layout.value[0].y).toBe(0);
    layout.value = [item('KnowledgePanel.D', 0, 0)];
    expect(topics.collapseValue.value.isCollapsed('KnowledgePanel.A')).toBe(true);
    expect(topics.displayLayout.value.map((w) => w.i)).toEqual(['KnowledgePanel.D']);
    expect(topics.isEveryWidgetCollapsed.value).toBe(false);
  });
});
