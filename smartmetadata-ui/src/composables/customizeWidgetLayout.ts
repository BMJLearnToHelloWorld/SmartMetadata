/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PersonaPage } from '@/types/persona';
import { getDefaultWidgetForTab } from '@/views/admin/persona/editors/customizePageData';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';

/**
 * Read-side widget-layout resolution for detail pages: the product
 * equivalent of the official `getLayoutFromCustomizedPage` +
 * `GenericProvider.getWidgetLayout` pair.
 *
 * Official sources (pin 392b3efd,
 * `openmetadata-ui/src/main/resources/ui/src/`):
 *
 * - `utils/CustomizePage/CustomizePageWidgetUtils.ts:145-162`
 *   (`getLayoutFromCustomizedPage`): no customized page or version view
 *   yields the default layout for the tab; a page with tabs yields the
 *   matching tab entry's `layout` (found by `id` only), or — when no tab
 *   is given — the first tab's layout with `[]` when it has none
 *   (`get(tabs.0.layout, [])`); a page without tabs yields the default
 *   layout. A tab entry that is not found yields `undefined`, and a
 *   found entry without a `layout` yields `undefined` too: neither
 *   silently presents a default.
 * - `components/Customization/GenericProvider/GenericProvider.tsx:56-62`
 *   (`getWidgetLayout`): a non-array resolution is coerced to `[]`, and
 *   `:205-209` recomputes it whenever `customizedPage`, the current tab,
 *   the page type, or the version-view flag changes.
 *
 * Two bounded adaptations, both forced by the product's stored shapes:
 *
 * - The `tabs` list is read only when it is an array. A present-but-
 *   non-array `tabs` throws a TypeError (D-7, aligned with the tab
 *   layer's throw in `useCustomPages.getDetailsTabWithNewLabel` and
 *   with the official throw for a truthy non-array value: official
 *   `getLayoutFromCustomizedPage` reads `customizedPage?.tabs?.length`,
 *   so a length-bearing non-array reaches `.find` and throws, while a
 *   length-less one falls through to the default layout — the product
 *   takes the uniform throw, recorded here rather than silently
 *   defaulting either shape).
 * - The product `getDefaultWidgetForTab` takes a `string` tab id, so a
 *   missing tab is passed as `''`. Official `getDefaultLayout(tab?)`
 *   treats a falsy tab as the page's primary tab (`if (tab && tab !==
 *   PRIMARY) return []`, e.g. `utils/TableClassBase.ts:142-145`); the
 *   shared lookup now mirrors that (falsy tab yields the page's shared
 *   `defaultLayout`, which is the primary-tab layout — Container's
 *   SCHEMA layout, not its CHILDREN one), so the only remaining
 *   falsy-tab work is for callers to pass their active tab id.
 *
 * Mount-narrowing combination semantics (M-1, recorded bounded
 * adaptation): officially `GenericTab` always mounts on a mount tab —
 * a missing mount entry resolves to `undefined` and coerces to `[]`
 * (empty grid), and an empty/absent `tabs` list renders the default
 * widget grid. The product mount gate requires an entry to exist; a
 * missing entry or no page renders the pre-existing default pane, not
 * the default grid — so the default branch of
 * `getLayoutFromCustomizedPage` is unreachable in view composition
 * (unit tests alone reach it). "An empty layout renders an empty grid,
 * with no fallback" must not be read as full coverage.
 */

function tabEntryId(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function tabEntryLayout(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  return (entry as { layout?: unknown }).layout;
}

/**
 * Official `getLayoutFromCustomizedPage`, verbatim in structure: the
 * result is `unknown` on purpose — a stored layout that is not an
 * array (or a missing tab, or a tab without a layout) is returned
 * as-is so `resolveWidgetLayout` can apply the official non-array
 * coercion instead of this function inventing a default. A
 * present-but-non-array `tabs` list throws a TypeError (D-7): official
 * `customizedPage?.tabs?.length` lets a length-bearing non-array reach
 * `.find` and throw, and the tab layer already throws for the same
 * shape (`useCustomPages.getDetailsTabWithNewLabel`); the stored value
 * itself is never rewritten.
 */
export function getLayoutFromCustomizedPage(
  pageType: string,
  tabId: string | undefined,
  customizedPage: PersonaPage | null | undefined,
  isVersionView = false,
): unknown {
  if (!customizedPage || isVersionView) {
    return getDefaultWidgetForTab(pageType, tabId ?? '');
  }
  const tabs = customizedPage.tabs;
  if (tabs !== undefined && tabs !== null && !Array.isArray(tabs)) {
    throw new TypeError(
      'getLayoutFromCustomizedPage: customizedPage.tabs must be an array when present',
    );
  }
  if (Array.isArray(tabs) && tabs.length > 0) {
    if (tabId) {
      return tabEntryLayout(tabs.find((entry) => tabEntryId(entry) === tabId));
    }
    const firstLayout = tabEntryLayout(tabs[0]);
    return firstLayout === undefined ? [] : firstLayout;
  }
  return getDefaultWidgetForTab(pageType, tabId ?? '');
}

const GRID_COLUMNS = 8;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Official `DescriptionWidget` size read
 * (`components/DataAssets/CommonWidgets/widgets/DescriptionWidget.tsx:93`,
 * pin a3012259ca): a widget whose `config.size` is `'large'` shows the
 * full description (`removeBlur`); a small (or unconfigured) widget
 * keeps the read-more fold. The editor writes `size` on every added
 * widget (`getAddWidgetHandler`, `CustomizePageWidgetUtils.ts:56-97`),
 * so stored widgets carry it; layouts saved before that carry none
 * and read as small.
 */
export function isLargeWidget(widget: WidgetConfig | null | undefined): boolean {
  return (widget?.config as Record<string, unknown> | undefined)?.size === 'large';
}

/**
 * LeftPanel children are flow units, not grid columns (`w: 0.5` is
 * legal), so children are only filtered — never geometry-clamped. A
 * non-array `children` value normalizes to `[]`; a clean array keeps
 * its identity.
 */
function sanitizeChildren(children: unknown): WidgetConfig[] | undefined {
  if (children === undefined) {
    return undefined;
  }
  if (!Array.isArray(children)) {
    return [];
  }
  let changed = false;
  const kept: WidgetConfig[] = [];
  for (const child of children) {
    if (
      typeof child !== 'object' ||
      child === null ||
      typeof (child as { i?: unknown }).i !== 'string'
    ) {
      changed = true;
      continue;
    }
    kept.push(child as WidgetConfig);
  }
  return changed ? kept : (children as WidgetConfig[]);
}

/**
 * One top-level grid entry: dropped when it is not an object or has no
 * string `i`; otherwise its geometry is clamped to the 8-column grid
 * (`x` in [0, 7], `w` in [1, 8 - x], fractions preserved — the
 * floor/ceil rounding stays solely in `GenericTab`) and non-finite
 * `h`/`y` fall back to 1/0. A clean entry keeps its identity; a fixed
 * entry is a spread copy, so the stored layout is never mutated.
 * Official `GenericTab` is equally fragile on null entries (it reads
 * `widget.i` unguarded), so this is a robustness hardening of the
 * stored-JSON read path, not an official deviation.
 */
function sanitizeEntry(entry: unknown): WidgetConfig | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const candidate = entry as WidgetConfig;
  if (typeof candidate.i !== 'string') {
    return null;
  }
  const x = Math.min(Math.max(finiteOr(candidate.x, 0), 0), GRID_COLUMNS - 1);
  const w = Math.min(Math.max(finiteOr(candidate.w, 1), 1), GRID_COLUMNS - x);
  const h = finiteOr(candidate.h, 1);
  const y = finiteOr(candidate.y, 0);
  const children = sanitizeChildren(candidate.children);
  if (
    x === candidate.x &&
    w === candidate.w &&
    h === candidate.h &&
    y === candidate.y &&
    children === candidate.children
  ) {
    return candidate;
  }
  return { ...candidate, x, y, w, h, children };
}

function sanitizeLayout(layout: unknown[]): WidgetConfig[] {
  let changed = false;
  const kept: WidgetConfig[] = [];
  for (const entry of layout) {
    const sanitized = sanitizeEntry(entry);
    if (sanitized === null) {
      changed = true;
      continue;
    }
    if (sanitized !== entry) {
      changed = true;
    }
    kept.push(sanitized);
  }
  return changed ? kept : (layout as WidgetConfig[]);
}

/**
 * react-grid-layout v1 vertical compaction, ported verbatim in
 * structure (`compact` / `compactItem` / `resolveCompactionCollision`
 * / `collides` / `sortLayoutItemsByRowCol`, lib/utils.js): the
 * official `GenericTab` renders through `ReactGridLayout` with
 * `verticalCompact`, so stored layouts are compacted on every render
 * — items move up to fill gaps and collisions push later items down.
 * That is load-bearing, not cosmetic: the official default layouts
 * themselves overlap (Table schema right column: FrequentlyJoinedTables
 * `[0,2)` vs AssetHealth `[1,4)` vs DataProducts `[2,4)` at `x:6,w:2`,
 * `utils/TableClassBase.ts:142-246`), and only compaction makes them
 * render without overlap. A CSS grid places stored rects verbatim, so
 * the read path compacts here, before the floor/ceil placement in
 * `GenericTab`. Static items (the LeftPanel) never move; other items
 * flow around them. The input array is never mutated: each item is
 * spread-copied, and the output keeps the input order. Fractional
 * geometry survives (the `y--` walk and the `<=` collision tests work
 * on fractions, as in RGL); the integer rounding stays in GenericTab.
 */
function widgetsCollide(a: WidgetConfig, b: WidgetConfig): boolean {
  if (a.i === b.i) {
    return false;
  }
  if (a.x + a.w <= b.x || a.x >= b.x + b.w) {
    return false;
  }
  if (a.y + a.h <= b.y || a.y >= b.y + b.h) {
    return false;
  }
  return true;
}

function firstCollision(layout: WidgetConfig[], item: WidgetConfig): WidgetConfig | null {
  for (const other of layout) {
    if (widgetsCollide(other, item)) {
      return other;
    }
  }
  return null;
}

function layoutBottom(layout: WidgetConfig[]): number {
  let max = 0;
  for (const item of layout) {
    max = Math.max(max, item.y + item.h);
  }
  return max;
}

function resolveCompactionCollision(
  layout: WidgetConfig[],
  item: WidgetConfig,
  moveToCoord: number,
): void {
  item.y += 1;
  const itemIndex = layout.findIndex((entry) => entry.i === item.i);
  for (let i = itemIndex + 1; i < layout.length; i++) {
    const other = layout[i];
    if (other.static) {
      continue;
    }
    if (other.y > item.y + item.h) {
      break;
    }
    if (widgetsCollide(item, other)) {
      resolveCompactionCollision(layout, other, moveToCoord + item.h);
    }
  }
  item.y = moveToCoord;
}

function compactItemVertical(
  compareWith: WidgetConfig[],
  item: WidgetConfig,
  fullLayout: WidgetConfig[],
): WidgetConfig {
  item.y = Math.min(layoutBottom(compareWith), item.y);
  while (item.y > 0 && !firstCollision(compareWith, item)) {
    item.y -= 1;
  }
  let collision: WidgetConfig | null;
  while ((collision = firstCollision(compareWith, item))) {
    resolveCompactionCollision(fullLayout, item, collision.y + collision.h);
  }
  item.y = Math.max(item.y, 0);
  item.x = Math.max(item.x, 0);
  return item;
}

export function compactWidgetLayoutVertical(layout: WidgetConfig[]): WidgetConfig[] {
  // Clones throughout: RGL's `sorted` holds the input's own items and
  // its cascade mutates them; the product must never mutate the stored
  // layout, so each entry is cloned once up front and the original
  // index is carried alongside for the order-preserving output.
  const sorted = layout
    .map((item, index) => ({ item: { ...item }, index }))
    .sort((a, b) => {
      if (a.item.y > b.item.y || (a.item.y === b.item.y && a.item.x > b.item.x)) {
        return 1;
      }
      if (a.item.y === b.item.y && a.item.x === b.item.x) {
        return 0;
      }
      return -1;
    });
  const compareWith = sorted.filter(({ item }) => item.static).map(({ item }) => item);
  const sortedItems = sorted.map(({ item }) => item);
  const out: WidgetConfig[] = new Array(layout.length);
  for (const { item, index } of sorted) {
    if (!item.static) {
      compactItemVertical(compareWith, item, sortedItems);
      compareWith.push(item);
    }
    out[index] = item;
  }
  // Same reference when nothing moved: a clean layout keeps its
  // identity, so consumers that bail out on reference equality (and
  // tests that lock it) see no churn from the compaction pass.
  const moved = out.some((item, index) => item.x !== layout[index].x || item.y !== layout[index].y);
  return moved ? out : layout;
}

/**
 * Official `GenericProvider.getWidgetLayout`: the resolved layout when
 * it is an array, otherwise `[]`. This is the D4-safe coercion — a
 * missing tab, a missing layout, or a non-array stored layout renders
 * an empty grid, never a default layout. Array layouts additionally
 * pass through entry sanitization (dropped malformed entries, clamped
 * geometry) and RGL-style vertical compaction (stored rects may
 * overlap, as the official defaults do); clean layouts keep their
 * array identity.
 */
export function resolveWidgetLayout(
  pageType: string,
  tabId: string | undefined,
  customizedPage: PersonaPage | null | undefined,
  isVersionView?: boolean,
): WidgetConfig[] {
  const layout = getLayoutFromCustomizedPage(pageType, tabId, customizedPage, isVersionView);
  if (!Array.isArray(layout)) {
    return [];
  }
  return compactWidgetLayoutVertical(sanitizeLayout(layout));
}
