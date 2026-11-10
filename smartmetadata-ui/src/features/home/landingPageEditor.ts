/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
  LANDING_PAGE_MAX_GRID_SIZE,
  type LandingPageLayoutItem,
} from './landingPageLayout';

/**
 * Editor layout math, ported from the official framework
 * (openmetadata-ui `utils/CustomizableLandingPagePureUtils.ts`).
 *
 * The editor works on the same `LandingPageLayoutItem` the home page
 * reads, plus a trailing empty placeholder cell that is never
 * persisted. Two adaptations from pin, both recorded here rather than
 * hidden:
 *
 * - pin's `getAddWidgetHandler` takes a KnowledgePanel `Document` and
 *   resolves the widget height by name; every name resolves to the
 *   default height (3) in pin, and the product forces `h:3` on
 *   normalization anyway, so the product handler takes the widget FQN
 *   directly and always uses height 3.
 * - pin uses lodash `uniqueId` for instance keys; the product has no
 *   lodash dependency, so a module-local counter provides the same
 *   `prefix + incrementing integer` keys.
 *
 * ADR:2026-11-10-my-data-customize-page-drag
 */

/** Official `LandingPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER`. */
export const EMPTY_WIDGET_PLACEHOLDER = 'ExtraWidget.EmptyWidgetPlaceholder';

const EMPTY_WIDGET_PLACEHOLDER_SELECTOR = '.EmptyWidgetPlaceholder';

/** One editor layout entry: a layout item, optionally marked undraggable. */
export type EditorLayoutItem = LandingPageLayoutItem & {
  isDraggable?: boolean;
};

let uniqueIdCounter = 0;

/** lodash `uniqueId(prefix)`: the prefix plus an incrementing integer. */
function uniqueId(prefix: string): string {
  uniqueIdCounter += 1;
  return `${prefix}${uniqueIdCounter}`;
}

/** Official `getConstrainedWidgetWidth`: a widget never spans more than the grid. */
export function getConstrainedWidgetWidth(width: number): number {
  return Math.min(width, LANDING_PAGE_MAX_GRID_SIZE);
}

/**
 * Official `getNewWidgetPlacement`: the lowest widget's row, same row
 * when it fits beside it, else the next row. The returned coordinates
 * are a seed — the caller repacks (`ensurePlaceholderAtEnd`), which is
 * what resolves the overlap the `y + 1` next-row seed can introduce
 * against a height-3 widget.
 */
export function getNewWidgetPlacement(
  currentLayout: EditorLayoutItem[],
  widgetWidth: number,
): { x: number; y: number } {
  const lowestWidgetLayout = currentLayout.reduce(
    (acc, widget) => {
      if (widget.y >= acc.y && widget.i !== EMPTY_WIDGET_PLACEHOLDER) {
        if (widget.y === acc.y && widget.x < acc.x) {
          return acc;
        }
        return widget;
      }
      return acc;
    },
    { y: 0, x: 0, w: 0 },
  );
  if (
    LANDING_PAGE_MAX_GRID_SIZE - (lowestWidgetLayout.x + lowestWidgetLayout.w) >=
    widgetWidth
  ) {
    return {
      x: lowestWidgetLayout.x + lowestWidgetLayout.w,
      y: lowestWidgetLayout.y,
    };
  }
  return {
    x: 0,
    y: lowestWidgetLayout.y + 1,
  };
}

/** Official `createPlaceholderWidget`: the empty cell, static and undraggable. */
export function createPlaceholderWidget(x = 0, y = 0): EditorLayoutItem {
  return {
    h: LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
    i: EMPTY_WIDGET_PLACEHOLDER,
    w: 1,
    x,
    y,
    static: true,
    isDraggable: false,
  };
}

/** Official `separateWidgets`: regular widgets and the placeholder, if any. */
export function separateWidgets(layout: EditorLayoutItem[]): {
  regularWidgets: EditorLayoutItem[];
  placeholderWidget: EditorLayoutItem | undefined;
} {
  return {
    regularWidgets: layout.filter(
      (widget) => !widget.i.endsWith(EMPTY_WIDGET_PLACEHOLDER_SELECTOR),
    ),
    placeholderWidget: layout.find((widget) =>
      widget.i.endsWith(EMPTY_WIDGET_PLACEHOLDER_SELECTOR),
    ),
  };
}

/**
 * Official `packWidgetsTightly`: row-major tight packing, placeholder
 * excluded. Quirk, ported verbatim and NOT "fixed": a widget on the
 * placeholder's row at or after the placeholder's column keeps its
 * original position instead of being packed. The branch only fires
 * when the input still carries a placeholder (the repack entry point
 * strips it first), so it is reachable here, not through
 * `ensurePlaceholderAtEnd`.
 */
export function packWidgetsTightly(widgets: EditorLayoutItem[]): EditorLayoutItem[] {
  if (widgets.length === 0) {
    return [];
  }
  const { regularWidgets, placeholderWidget } = separateWidgets(widgets);
  const sortedWidgets = [...regularWidgets].sort((a, b) => {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
  const packedWidgets: EditorLayoutItem[] = [];
  let currentX = 0;
  let currentY = 0;
  let maxHeightInRow = 0;
  for (const widget of sortedWidgets) {
    if (
      widget.i !== EMPTY_WIDGET_PLACEHOLDER &&
      widget.y === placeholderWidget?.y &&
      widget.x >= (placeholderWidget?.x ?? 0)
    ) {
      // Keep the widget's original position if it's at or after
      // placeholder position (official quirk — see the module doc).
      packedWidgets.push({ ...widget, static: false });
      continue;
    }
    if (currentX + widget.w > LANDING_PAGE_MAX_GRID_SIZE) {
      currentX = 0;
      currentY += maxHeightInRow;
      maxHeightInRow = 0;
    }
    packedWidgets.push({ ...widget, x: currentX, y: currentY, static: false });
    currentX += widget.w;
    maxHeightInRow = Math.max(maxHeightInRow, widget.h);
  }
  return packedWidgets;
}

/**
 * Official `ensurePlaceholderAtEnd`: pack tightly, then put the
 * placeholder after the last widget — in the last row when it fits,
 * else on a row of its own. An empty layout is just a placeholder.
 */
export function ensurePlaceholderAtEnd(layout: EditorLayoutItem[]): EditorLayoutItem[] {
  if (!layout || layout.length === 0) {
    return [createPlaceholderWidget()];
  }
  const { regularWidgets } = separateWidgets(layout);
  if (regularWidgets.length === 0) {
    return [createPlaceholderWidget()];
  }
  const packedWidgets = packWidgetsTightly(regularWidgets);
  let maxX = 0;
  let maxY = 0;
  for (const widget of packedWidgets) {
    maxX = Math.max(maxX, widget.x + widget.w);
    maxY = Math.max(maxY, widget.y + widget.h);
  }
  const widgetsInLastRow = packedWidgets.filter(
    (widget) => widget.y === maxY - LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
  );
  let rightmostInLastRow = 0;
  for (const widget of widgetsInLastRow) {
    rightmostInLastRow = Math.max(rightmostInLastRow, widget.x + widget.w);
  }
  const canFitInLastRow = rightmostInLastRow + 1 <= LANDING_PAGE_MAX_GRID_SIZE;
  const placeholderWidget = createPlaceholderWidget(
    canFitInLastRow ? rightmostInLastRow : 0,
    canFitInLastRow ? maxY - LANDING_PAGE_DEFAULT_WIDGET_HEIGHT : maxY,
  );
  return [...packedWidgets, placeholderWidget];
}

/**
 * Official `getLayoutUpdateHandler`: the drag/drop (and any grid)
 * update. The grid's new coordinates are mapped onto the current
 * entries (width constrained, height forced to 3, never static), then
 * the layout is repacked with the placeholder at the end. An empty
 * update is a placeholder-only layout.
 */
export function getLayoutUpdateHandler(
  updatedLayout: Array<Pick<EditorLayoutItem, 'i' | 'x' | 'y' | 'w' | 'h'>>,
): (currentLayout: EditorLayoutItem[]) => EditorLayoutItem[] {
  return (currentLayout: EditorLayoutItem[]) => {
    if (!updatedLayout || updatedLayout.length === 0) {
      return [createPlaceholderWidget()];
    }
    const basicUpdatedLayout = updatedLayout.map((widget) => {
      const widgetData = currentLayout.find((item) => item.i === widget.i);
      return {
        ...(widgetData ?? {}),
        ...widget,
        w: getConstrainedWidgetWidth(widget.w),
        h: LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
        static: false,
      };
    });
    const { regularWidgets } = separateWidgets(basicUpdatedLayout);
    if (regularWidgets.length === 0) {
      return [createPlaceholderWidget()];
    }
    return ensurePlaceholderAtEnd(basicUpdatedLayout);
  };
}

/**
 * Official `getAddWidgetHandler`, adapted (see the module doc): the
 * widget FQN is passed directly and the height is always 3. A new
 * instance key carries a `uniqueId` suffix, so the same widget can
 * appear twice (CuratedAssets is the multi-instance case).
 */
export function getAddWidgetHandler(
  widgetFqn: string,
  placeholderWidgetKey: string,
  widgetWidth: number,
  maxGridSize: number,
): (currentLayout: EditorLayoutItem[]) => EditorLayoutItem[] {
  return (currentLayout: EditorLayoutItem[]) => {
    if (!widgetFqn) {
      return [createPlaceholderWidget()];
    }
    const widgetInstanceKey = uniqueId(`${widgetFqn}-`);
    const widgetHeight = LANDING_PAGE_DEFAULT_WIDGET_HEIGHT;
    if (!currentLayout || currentLayout.length === 0) {
      return [
        {
          w: widgetWidth,
          h: widgetHeight,
          i: widgetInstanceKey,
          static: false,
          x: 0,
          y: 0,
        },
        createPlaceholderWidget(widgetWidth, 0),
      ];
    }
    const { regularWidgets } = separateWidgets(currentLayout);
    if (placeholderWidgetKey === EMPTY_WIDGET_PLACEHOLDER) {
      const placement = getNewWidgetPlacement(regularWidgets, widgetWidth);
      const newWidget: EditorLayoutItem = {
        w: widgetWidth,
        h: widgetHeight,
        i: widgetInstanceKey,
        static: false,
        x: placement.x,
        y: placement.y,
      };
      return ensurePlaceholderAtEnd([...regularWidgets, newWidget]);
    }
    const updatedWidgets = currentLayout.map((widget) => {
      if (widget.i === placeholderWidgetKey) {
        return {
          ...widget,
          i: widgetInstanceKey,
          h: widgetHeight,
          w: widgetWidth,
          x: Math.min(widget.x, maxGridSize - widgetWidth),
          static: false,
        };
      }
      return widget;
    });
    return ensurePlaceholderAtEnd(updatedWidgets);
  };
}

/** Official `getRemoveWidgetHandler`: drop the widget, repack, placeholder at end. */
export function getRemoveWidgetHandler(
  widgetKey: string,
): (currentLayout: EditorLayoutItem[]) => EditorLayoutItem[] {
  return (currentLayout: EditorLayoutItem[]) => {
    if (!currentLayout || currentLayout.length === 0) {
      return [createPlaceholderWidget()];
    }
    const filteredLayout = currentLayout.filter((widget) => widget.i !== widgetKey);
    return ensurePlaceholderAtEnd(filteredLayout);
  };
}

/**
 * Official `getLandingPageLayoutWithEmptyWidgetPlaceholder`: the
 * editor's working layout — the saved/default layout with a
 * placeholder ensured at the end; a placeholder-only layout when
 * there is nothing to edit.
 */
export function getLandingPageLayoutWithEmptyWidgetPlaceholder(
  layout: EditorLayoutItem[],
  emptyWidgetHeight = LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
  emptyWidgetWidth = 1,
): EditorLayoutItem[] {
  if (!layout || layout.length === 0) {
    return [
      {
        h: emptyWidgetHeight,
        i: EMPTY_WIDGET_PLACEHOLDER,
        w: emptyWidgetWidth,
        x: 0,
        y: 0,
        isDraggable: false,
      },
    ];
  }
  return ensurePlaceholderAtEnd(layout);
}

/**
 * Official `getUniqueFilteredLayout`: the layout as it is saved —
 * KnowledgePanel entries only, the placeholder stripped, deduplicated
 * by key. The placeholder is never persisted.
 */
export function getUniqueFilteredLayout(layout: EditorLayoutItem[]): EditorLayoutItem[] {
  if (!layout || !Array.isArray(layout) || layout.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  return layout.filter((widget) => {
    if (
      !widget.i.startsWith('KnowledgePanel') ||
      widget.i.endsWith(EMPTY_WIDGET_PLACEHOLDER_SELECTOR) ||
      seen.has(widget.i)
    ) {
      return false;
    }
    seen.add(widget.i);
    return true;
  });
}

/**
 * The editor's `disableSave` comparison, hand-written per the review
 * (pin uses fast-json-patch; the product has no such dependency):
 * two filtered layouts are equal when they carry the same entries in
 * the same order with the same (i, x, y, w, h). The placeholder never
 * reaches this comparison — it is stripped by the filter above.
 */
export function isLayoutDirty(
  initialLayout: EditorLayoutItem[],
  currentLayout: EditorLayoutItem[],
): boolean {
  const initial = getUniqueFilteredLayout(initialLayout);
  const current = getUniqueFilteredLayout(currentLayout);
  if (initial.length !== current.length) {
    return true;
  }
  return initial.some((item, index) => {
    const other = current[index];
    return (
      item.i !== other.i ||
      item.x !== other.x ||
      item.y !== other.y ||
      item.w !== other.w ||
      item.h !== other.h
    );
  });
}
