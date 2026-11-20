// gridLayoutUtils.ts — grid math for the C-4 detail/special editors.
//
// Ports of utils/CustomizePage/GridLayoutDragUtils.ts,
// utils/CustomizePage/CustomizePageWidgetUtils.ts and the details-grid
// functions of utils/CustomizableLandingPagePureUtils.ts at pin
// a3012259ca. The react-grid-layout engine itself is NOT ported (b*:
// behavior + save-semantics equivalence); vertical compaction is
// re-implemented to RGL `utils.compact(..., 'vertical', cols)` semantics
// (sorted order, step-up until collision, static items block but do not
// move). The 2-column quirk of getNewWidgetPlacement (it uses
// LANDING_PAGE_MAX_GRID_SIZE even on the details path) is preserved
// verbatim and marked.

import type { PersonaPage } from '@/types/persona';
import { GRID_ROW_HEIGHT, GRID_VERTICAL_MARGIN } from './customizePageData';
import { getWidgetHeight, WidgetWidths } from './customizePageData';
import type { CommonWidgetType, WidgetConfig } from './customizeTypes';
import { asCustomizeTab, deepEqualJson, tabLayout, uniqueId } from './customizeTypes';

export const HALF_PANEL_WIDTH = 0.5;
export const FULL_PANEL_WIDTH = 1;
const PANEL_WIDTH_TOLERANCE = 1e-9;

export const LANDING_PAGE_MAX_GRID_SIZE = 2;
export const EMPTY_WIDGET_PLACEHOLDER_KEY = 'ExtraWidget.EmptyWidgetPlaceholder';
const EMPTY_WIDGET_PLACEHOLDER_SELECTOR = '.EmptyWidgetPlaceholder';

function orderByYX<T extends WidgetConfig>(items: T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

function flowLeftPanel<T extends WidgetConfig>(children: T[]): T[] {
  let lineTop = 0;
  let lineHeight = 0;
  let lineEnd = 0;

  return children.map((child) => {
    if (lineEnd + child.w > FULL_PANEL_WIDTH + PANEL_WIDTH_TOLERANCE) {
      lineTop += lineHeight;
      lineHeight = 0;
      lineEnd = 0;
    }
    const placed = { ...child, x: lineEnd, y: lineTop };
    lineEnd += child.w;
    lineHeight = Math.max(lineHeight, child.h);

    return placed;
  });
}

export function getLeftPanelFlowLayout<T extends WidgetConfig>(children: T[] = []): T[] {
  return flowLeftPanel(orderByYX(children));
}

export function getLeftPanelHeight(children: WidgetConfig[] = []): number {
  return Math.max(0, ...getLeftPanelFlowLayout(children).map(({ y, h }) => y + h));
}

export function toLeftPanelEditGrid<T extends WidgetConfig>(widget: T, cols: number): T {
  return { ...widget, x: Math.round(widget.x * cols), w: Math.round(widget.w * cols) };
}

export function fromLeftPanelEditGrid<T extends WidgetConfig>(widget: T, cols: number): T {
  return { ...widget, x: widget.x / cols, w: widget.w / cols };
}

export function getGridRowAt(offset: number): number {
  return Math.max(0, Math.floor(offset / (GRID_ROW_HEIGHT + GRID_VERTICAL_MARGIN)));
}

export function isLeftPanelWidget(widget: WidgetConfig): boolean {
  return widget.i.startsWith('KnowledgePanel.LeftPanel');
}

function collides(a: WidgetConfig, b: WidgetConfig): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * RGL `utils.compact(layout, 'vertical', cols)` equivalent: items are
 * processed in (y, x) order; each non-static item steps upward until it
 * would collide with an already-placed item or reach row 0. The column
 * count plays no role in vertical compaction (only y moves, and the
 * x-bounds clamp lives in getDrawnLayout), so there is no `cols`
 * parameter here.
 */
export function compactVertical<T extends WidgetConfig>(layout: T[]): T[] {
  const placed: T[] = [];
  for (const item of orderByYX(layout)) {
    let y = item.y;
    if (!item.static) {
      while (y > 0 && !placed.some((other) => collides({ ...item, y: y - 1 }, other))) {
        y -= 1;
      }
    }
    placed.push({ ...item, y });
  }
  return placed;
}

/** `layout` where the grid draws it: in bounds and compacted upward. */
export function getDrawnLayout<T extends WidgetConfig>(layout: T[], cols: number): T[] {
  const drawn = compactVertical(
    layout.map((item) => ({ ...item, x: Math.max(0, Math.min(item.x, cols - item.w)) })),
  );
  return layout.map((item, index) => ({ ...item, x: drawn[index].x, y: drawn[index].y }));
}

export function placeWidgetInLeftPanel(
  layout: WidgetConfig[],
  widget: WidgetConfig,
  drop: { row: number; x: number; w: number },
): WidgetConfig[] {
  return layout
    .filter(({ i }) => i !== widget.i)
    .map((item) => {
      if (!isLeftPanelWidget(item)) {
        return item;
      }
      const children = getLeftPanelFlowLayout(item.children);
      const landedOn = children.findIndex(
        (child) => child.y > drop.row || (child.y === drop.row && child.x >= drop.x),
      );
      const at = landedOn === -1 ? children.length : landedOn;

      return {
        ...item,
        children: flowLeftPanel([
          ...children.slice(0, at),
          { ...widget, w: drop.w },
          ...children.slice(at),
        ]),
      };
    });
}

export function placeWidgetBesideLeftPanel(
  layout: WidgetConfig[],
  widget: WidgetConfig,
  row: number,
  cols: number,
): WidgetConfig[] {
  const panel = layout.find(isLeftPanelWidget);
  if (!panel) {
    return layout;
  }

  const x = panel.x + panel.w;

  return [
    { ...widget, x, y: row, w: cols - x },
    ...getDrawnLayout(layout, cols).map((item) =>
      isLeftPanelWidget(item)
        ? {
            ...item,
            children: getLeftPanelFlowLayout(
              item.children?.filter(({ i }) => i !== widget.i),
            ),
          }
        : item,
    ),
  ];
}

function toComparableWidget(widget: WidgetConfig): WidgetConfig {
  const { i, x, y, w, h, config, children } = widget;
  return {
    i,
    x,
    y,
    w,
    h,
    config,
    ...(children && {
      children: getLeftPanelFlowLayout(children).map(toComparableWidget),
    }),
  };
}

function toComparablePage(page: PersonaPage): Record<string, unknown> {
  // N-4: pin maps `page.tabs?.map(...)`, so an absent `tabs` stays
  // absent — an original without tabs vs an edited with `tabs: []`
  // is dirty under pin's fast-json-patch `compare` (an add op). The
  // previous normalization to `[]` collapsed that to clean. A
  // present-but-non-array `tabs` is compared opaquely instead: pin
  // would throw on `.map`, but a dirty predicate must never throw on
  // corrupt data (same treatment as a non-array layout, D2/D3).
  if (!Array.isArray(page.tabs)) {
    return { ...page };
  }
  return {
    ...page,
    tabs: page.tabs.map((rawTab) => {
      const tab = asCustomizeTab(rawTab);
      // D2/D3: a present-but-non-array layout is compared opaquely —
      // never normalized to [] — so an untouched object layout keeps
      // the page clean and a converted one diffs.
      if (!Array.isArray(tab.layout)) {
        return { ...tab };
      }
      return {
        ...tab,
        layout: tabLayout(tab)
          .filter(({ i }) => i !== EMPTY_WIDGET_PLACEHOLDER_KEY)
          .map(toComparableWidget),
      };
    }),
  };
}

/**
 * Whether two detail pages draw the same page. Official compares with
 * fast-json-patch `compare().length === 0` after the same reduction;
 * deepEqualJson is the equivalent predicate for these shapes.
 * Verified against fast-json-patch 3.1.1 (`_generate`, pin `^3.1.1`):
 * key order is ignored by both; `undefined`-valued keys are ignored
 * by deepEqualJson and, in `compare`, only matter when one side
 * carries the key and the other does not — which cannot arise here
 * (inputs are JSON-shaped, and `toComparableWidget` always emits the
 * `config` key on both sides, so its `undefined` is symmetric).
 * Numbers compare by `===` on both sides. The two deliberate
 * deviations from pin are the non-throwing opaque compares above.
 */
export function isSameDetailsPageLayout(original: PersonaPage, edited: PersonaPage): boolean {
  return deepEqualJson(toComparablePage(original), toComparablePage(edited));
}

export function calculateNewPosition(
  currentLayout: WidgetConfig[],
  newWidget: { w: number; h: number },
  maxCols = 8,
): { x: number; y: number } {
  const sortedLayout = [...currentLayout].sort((a, b) => a.y + a.h - (b.y + b.h));
  const lastWidget = sortedLayout[sortedLayout.length - 1];

  if (!lastWidget) {
    return { x: 0, y: 0 };
  }

  const lastRowY = lastWidget.y + lastWidget.h;
  const lastRowWidgets = sortedLayout.filter((widget) => widget.y + widget.h === lastRowY);
  const lastX = lastRowWidgets.reduce((maxX, widget) => Math.max(maxX, widget.x + widget.w), 0);

  if (lastX + newWidget.w <= maxCols) {
    return { x: lastX, y: lastRowY - lastWidget.h };
  }

  return { x: 0, y: lastRowY };
}

export function getNewWidgetPlacement(
  currentLayout: WidgetConfig[],
  widgetWidth: number,
): { x: number; y: number } {
  const lowestWidgetLayout = currentLayout.reduce(
    (acc, widget) => {
      if (widget.y >= acc.y && widget.i !== EMPTY_WIDGET_PLACEHOLDER_KEY) {
        if (widget.y === acc.y && widget.x < acc.x) {
          return acc;
        }
        return widget;
      }
      return acc;
    },
    { y: 0, x: 0, w: 0 },
  );

  // QUIRK (verbatim from official): the details add path reuses the
  // landing-page placement, which measures against 2 columns.
  if (
    LANDING_PAGE_MAX_GRID_SIZE - (lowestWidgetLayout.x + lowestWidgetLayout.w) >=
    widgetWidth
  ) {
    return { x: lowestWidgetLayout.x + lowestWidgetLayout.w, y: lowestWidgetLayout.y };
  }

  return { x: 0, y: lowestWidgetLayout.y + 1 };
}

export function getAddWidgetHandler(
  newWidgetData: CommonWidgetType,
  placeholderWidgetKey: string,
  widgetWidth: number,
  pageType: string,
  extraConfig?: WidgetConfig['config'],
): (currentLayout: WidgetConfig[]) => WidgetConfig[] {
  return (currentLayout: WidgetConfig[]) => {
    const widgetFQN = uniqueId(`${newWidgetData.fullyQualifiedName}-`);
    const widgetHeight = getWidgetHeight(pageType, newWidgetData.fullyQualifiedName);
    // Height is measured from content (DynamicHeightWidget), so the picked
    // size is kept as explicit meta. Only small/large exist; widths past
    // large (a full-width widget) count as large.
    const config = {
      ...extraConfig,
      size: widgetWidth >= WidgetWidths.large ? 'large' : 'small',
    };

    if (placeholderWidgetKey === EMPTY_WIDGET_PLACEHOLDER_KEY) {
      const newPlacement = getNewWidgetPlacement(currentLayout, widgetWidth);

      return [
        ...currentLayout.map((widget) =>
          widget.i === placeholderWidgetKey ? { ...widget, y: newPlacement.y + 1 } : widget,
        ),
        {
          i: widgetFQN,
          h: widgetHeight,
          w: widgetWidth,
          static: false,
          config,
          ...newPlacement,
        },
      ];
    }

    const { x: widgetX, y: widgetY } = calculateNewPosition(
      currentLayout.filter((widget) => widget.i !== EMPTY_WIDGET_PLACEHOLDER_KEY),
      { w: widgetWidth, h: widgetHeight },
    );

    return [
      ...currentLayout,
      { i: widgetFQN, h: widgetHeight, w: widgetWidth, x: widgetX, y: widgetY, config },
    ];
  };
}

/**
 * Apply a grid engine's layout output to stored widgets: grid fields
 * come from the engine, widget-owned fields (config, children) are
 * carried over from the previous widget with the same `i`.
 */
export function mergeGridLayout(
  gridLayout: WidgetConfig[],
  previous: WidgetConfig[] = [],
): WidgetConfig[] {
  return gridLayout.map((widget) => ({
    ...previous.find((prev) => prev.i === widget.i),
    ...widget,
  }));
}

export const asyncNoop = async (): Promise<void> => undefined;

export function updateWidgetHeightRecursively(
  widgetId: string,
  height: number,
  widgets: WidgetConfig[],
): WidgetConfig[] {
  return widgets.reduce<WidgetConfig[]>((acc, widget) => {
    if (widget.i === widgetId) {
      acc.push({ ...widget, h: height });
    } else if (widget.children) {
      acc.push({
        ...widget,
        children: widget.children.map((child) =>
          child.i === widgetId ? { ...child, h: height } : child,
        ),
      });
    } else {
      acc.push(widget);
    }
    return acc;
  }, []);
}

export function getLayoutWithEmptyWidgetPlaceholder(
  layout: WidgetConfig[],
  emptyWidgetHeight = 2,
  emptyWidgetWidth = 1,
): WidgetConfig[] {
  return [
    ...layout,
    {
      h: emptyWidgetHeight,
      i: EMPTY_WIDGET_PLACEHOLDER_KEY,
      w: emptyWidgetWidth,
      x: 0,
      y: 1000,
      isDraggable: false,
    },
  ];
}

export function getUniqueFilteredLayout(layout: WidgetConfig[]): WidgetConfig[] {
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
