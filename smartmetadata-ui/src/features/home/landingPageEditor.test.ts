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
import {
  EMPTY_WIDGET_PLACEHOLDER,
  createPlaceholderWidget,
  ensurePlaceholderAtEnd,
  getAddWidgetHandler,
  getLandingPageLayoutWithEmptyWidgetPlaceholder,
  getLayoutUpdateHandler,
  getNewWidgetPlacement,
  getRemoveWidgetHandler,
  getUniqueFilteredLayout,
  isLayoutDirty,
  packWidgetsTightly,
  separateWidgets,
  type EditorLayoutItem,
} from './landingPageEditor';

const A: EditorLayoutItem = { i: 'KnowledgePanel.DataQuality', x: 0, y: 0, w: 1, h: 3, static: false };
const B: EditorLayoutItem = { i: 'KnowledgePanel.Domains', x: 1, y: 0, w: 1, h: 3, static: false };
const C: EditorLayoutItem = { i: 'KnowledgePanel.KPI', x: 0, y: 1, w: 1, h: 3, static: false };

function keyAt(layout: EditorLayoutItem[], key: string): EditorLayoutItem | undefined {
  return layout.find((item) => item.i === key);
}

describe('landing page editor layout math', () => {
  it('creates a static, undraggable placeholder cell', () => {
    expect(createPlaceholderWidget()).toEqual({
      h: 3,
      i: EMPTY_WIDGET_PLACEHOLDER,
      w: 1,
      x: 0,
      y: 0,
      static: true,
      isDraggable: false,
    });
    expect(createPlaceholderWidget(1, 2).x).toBe(1);
    expect(createPlaceholderWidget(1, 2).y).toBe(2);
  });

  it('separates the placeholder from regular widgets', () => {
    const { regularWidgets, placeholderWidget } = separateWidgets([
      A,
      createPlaceholderWidget(1, 1),
      B,
    ]);
    expect(regularWidgets.map((item) => item.i)).toEqual([A.i, B.i]);
    expect(placeholderWidget?.i).toBe(EMPTY_WIDGET_PLACEHOLDER);
  });

  it('packs widgets tightly in reading order, closing gaps', () => {
    const packed = packWidgetsTightly([
      { ...C, x: 1, y: 5 },
      { ...A, x: 0, y: 4 },
    ]);
    expect(packed.map((item) => [item.i, item.x, item.y])).toEqual([
      [A.i, 0, 0],
      [C.i, 1, 0],
    ]);
  });

  it('keeps a widget on the placeholder row at or after the placeholder in place (official quirk)', () => {
    // C sits on the placeholder's row (y=0) at the placeholder's column
    // (x=1): the official pack keeps C at (1, 0) instead of packing it
    // to (0, 0), so A — which sorts after C — lands at (0, 0). Assert
    // the quirk; do not "fix" it.
    const packed = packWidgetsTightly([
      { ...A, x: 0, y: 1 },
      createPlaceholderWidget(1, 0),
      { ...C, x: 1, y: 0 },
    ]);
    expect(keyAt(packed, C.i)).toMatchObject({ x: 1, y: 0 });
    expect(keyAt(packed, A.i)).toMatchObject({ x: 0, y: 0 });
  });

  it('ensures the placeholder at the end: in the last row when it fits, else a row of its own', () => {
    const oneRow = ensurePlaceholderAtEnd([A]);
    expect(keyAt(oneRow, EMPTY_WIDGET_PLACEHOLDER)).toMatchObject({ x: 1, y: 0 });
    // A full row of height-3 widgets spans y=0..2, so the placeholder's
    // own row starts at y=3 — pin's rows are widget rows, not unit rows.
    const fullRow = ensurePlaceholderAtEnd([A, B]);
    expect(keyAt(fullRow, EMPTY_WIDGET_PLACEHOLDER)).toMatchObject({ x: 0, y: 3 });
    expect(ensurePlaceholderAtEnd([])).toEqual([createPlaceholderWidget()]);
    expect(ensurePlaceholderAtEnd([createPlaceholderWidget()])).toEqual([
      createPlaceholderWidget(),
    ]);
  });

  it('places a new widget beside the lowest widget when the row has room, else on the next row', () => {
    expect(getNewWidgetPlacement([A], 1)).toEqual({ x: 1, y: 0 });
    expect(getNewWidgetPlacement([A, B], 1)).toEqual({ x: 0, y: 1 });
    expect(getNewWidgetPlacement([], 1)).toEqual({ x: 0, y: 0 });
  });

  it('adds a widget at the end placement and repacks, placeholder still last', () => {
    const added = getAddWidgetHandler('KnowledgePanel.Domains', EMPTY_WIDGET_PLACEHOLDER, 1, 2)([
      A,
      createPlaceholderWidget(1, 0),
    ]);
    const addedWidget = added.find((item) => item.i.startsWith('KnowledgePanel.Domains-'));
    expect(addedWidget).toMatchObject({ x: 1, y: 0, w: 1, h: 3 });
    expect(added.at(-1)?.i).toBe(EMPTY_WIDGET_PLACEHOLDER);
    expect(keyAt(added, EMPTY_WIDGET_PLACEHOLDER)).toMatchObject({ x: 0, y: 3 });
  });

  it('adds the first widget to an empty layout with the placeholder beside it', () => {
    const added = getAddWidgetHandler('KnowledgePanel.Domains', EMPTY_WIDGET_PLACEHOLDER, 1, 2)([]);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 3 });
    expect(added[0].i.startsWith('KnowledgePanel.Domains-')).toBe(true);
    expect(added[1]).toEqual(createPlaceholderWidget(1, 0));
  });

  it('adds a widget by replacing a named placeholder cell in place', () => {
    const named = { ...createPlaceholderWidget(1, 0), i: 'KnowledgePanel.Domains' };
    const added = getAddWidgetHandler('KnowledgePanel.KPI', 'KnowledgePanel.Domains', 1, 2)([
      A,
      named,
    ]);
    const addedWidget = added.find((item) => item.i.startsWith('KnowledgePanel.KPI-'));
    expect(addedWidget).toMatchObject({ x: 1, y: 0, w: 1, h: 3 });
    expect(added.at(-1)?.i).toBe(EMPTY_WIDGET_PLACEHOLDER);
  });

  it('gives each added instance a unique key, so CuratedAssets can appear twice', () => {
    const first = getAddWidgetHandler(
      'KnowledgePanel.CuratedAssets',
      EMPTY_WIDGET_PLACEHOLDER,
      1,
      2,
    )([A, createPlaceholderWidget(1, 0)]);
    const second = getAddWidgetHandler(
      'KnowledgePanel.CuratedAssets',
      EMPTY_WIDGET_PLACEHOLDER,
      1,
      2,
    )(first);
    const instances = second.filter((item) =>
      item.i.startsWith('KnowledgePanel.CuratedAssets-'),
    );
    expect(instances).toHaveLength(2);
    expect(new Set(instances.map((item) => item.i)).size).toBe(2);
  });

  it('removes a widget and repacks with the placeholder at the end', () => {
    const removed = getRemoveWidgetHandler(A.i)([A, B, C, createPlaceholderWidget(1, 1)]);
    expect(removed.map((item) => item.i)).toEqual([
      B.i,
      C.i,
      EMPTY_WIDGET_PLACEHOLDER,
    ]);
    expect(keyAt(removed, B.i)).toMatchObject({ x: 0, y: 0 });
    expect(keyAt(removed, C.i)).toMatchObject({ x: 1, y: 0 });
    expect(keyAt(removed, EMPTY_WIDGET_PLACEHOLDER)).toMatchObject({ x: 0, y: 3 });
  });

  it('removing the last widget leaves a placeholder-only layout', () => {
    expect(getRemoveWidgetHandler(A.i)([A, createPlaceholderWidget(1, 0)])).toEqual([
      createPlaceholderWidget(),
    ]);
  });

  it('applies a grid update (drag) and repacks: moved widget lands, others follow', () => {
    const updated = getLayoutUpdateHandler([
      { ...A, x: 1, y: 0 },
      { ...B, x: 0, y: 0 },
      { ...C, x: 0, y: 1 },
    ])([A, B, C, createPlaceholderWidget(1, 1)]);
    expect(keyAt(updated, A.i)).toMatchObject({ x: 1, y: 0 });
    expect(keyAt(updated, B.i)).toMatchObject({ x: 0, y: 0 });
    expect(updated.at(-1)?.i).toBe(EMPTY_WIDGET_PLACEHOLDER);
  });

  it('forces w to the grid width and h to 3 on a grid update', () => {
    const updated = getLayoutUpdateHandler([{ ...A, x: 0, y: 0, w: 2, h: 5 }])([A]);
    expect(keyAt(updated, A.i)).toMatchObject({ w: 2, h: 3 });
  });

  it('an empty grid update is a placeholder-only layout', () => {
    expect(getLayoutUpdateHandler([])([A, B])).toEqual([createPlaceholderWidget()]);
  });

  it('builds the editor working layout with a placeholder at the end', () => {
    expect(getLandingPageLayoutWithEmptyWidgetPlaceholder([A, B]).at(-1)?.i).toBe(
      EMPTY_WIDGET_PLACEHOLDER,
    );
    // Pin's empty branch builds the placeholder inline, without the
    // `static` flag `createPlaceholderWidget` carries — ported as-is:
    // the placeholder has no drag handle, so it never drags either way.
    expect(getLandingPageLayoutWithEmptyWidgetPlaceholder([])).toEqual([
      { h: 3, i: EMPTY_WIDGET_PLACEHOLDER, w: 1, x: 0, y: 0, isDraggable: false },
    ]);
  });

  it('filters the saved layout: KnowledgePanel only, placeholder stripped, deduplicated', () => {
    const filtered = getUniqueFilteredLayout([
      A,
      B,
      A,
      createPlaceholderWidget(0, 1),
      { i: 'ExtraWidget.EmptyWidgetPlaceholder', x: 0, y: 2, w: 1, h: 3, static: true },
      { i: 'SomethingElse', x: 0, y: 3, w: 1, h: 3, static: false },
    ]);
    expect(filtered.map((item) => item.i)).toEqual([A.i, B.i]);
  });

  it('the placeholder is never persisted: a placeholder-only layout saves as empty', () => {
    expect(getUniqueFilteredLayout([createPlaceholderWidget()])).toEqual([]);
    expect(getUniqueFilteredLayout([])).toEqual([]);
  });

  it('disableSave compares (i, x, y, w, h) in order, ignoring the placeholder', () => {
    const initial = [A, B, createPlaceholderWidget(0, 1)];
    expect(isLayoutDirty(initial, [A, B, createPlaceholderWidget(0, 1)])).toBe(false);
    expect(isLayoutDirty(initial, [B, A, createPlaceholderWidget(0, 1)])).toBe(true);
    expect(isLayoutDirty(initial, [{ ...A, y: 1 }, B])).toBe(true);
    expect(isLayoutDirty(initial, [A])).toBe(true);
    expect(isLayoutDirty(initial, [A, B, C])).toBe(true);
  });
});
