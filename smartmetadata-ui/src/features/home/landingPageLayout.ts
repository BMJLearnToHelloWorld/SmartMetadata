/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getPersonaPage } from '@/views/admin/personaPage';
import type { PersonaDocument } from '@/types/persona';

/**
 * Landing-page grid, ported from the official framework
 * (openmetadata-ui `constants/CustomizeMyDataPage.constants.ts`,
 * `utils/CustomizeMyDataPageWidgetUtils.tsx`,
 * `utils/CustomizableLandingPagePureUtils.ts`,
 * `enums/CustomizablePage.enum.ts`).
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 * ADR:2026-11-07-my-data-row-height-non-subdivided
 *
 * The widget keys are the single source of key values: the registry in
 * `./landingPageWidgets` builds its entries from `LANDING_PAGE_WIDGET_KEYS`,
 * and `MY_DATA_WIDGET_KEYS` is the registry's key set in default-layout
 * order, so adding or retiring a widget is a change in exactly one place.
 */

export interface LandingPageLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static: boolean;
  /**
   * Per-widget saved config, official WidgetConfig.config. The normalizer
   * spreads the saved entry, so a config survives normalization; widgets
   * read it off the layout by key (see CuratedAssetsWidget) — never off a
   * `widgetConfig` prop.
   */
  config?: Record<string, unknown>;
}

export const LANDING_PAGE_DEFAULT_WIDGET_HEIGHT = 3;
export const LANDING_PAGE_WIDGET_MARGIN = 16;
export const LANDING_PAGE_ROW_HEIGHT = 133.33;
export const LANDING_PAGE_MAX_GRID_SIZE = 2;
export const LANDING_PAGE_WIDGET_COLUMN_SPAN = 1;

/** Official `LandingPageWidgetKeys`: the 13 keys the registry renders. */
export const LANDING_PAGE_WIDGET_KEYS = {
  PLATFORM_HEALTH: 'KnowledgePanel.PlatformHealth',
  DATA_ESTATE: 'KnowledgePanel.DataEstate',
  TOTAL_DATA_ASSETS: 'KnowledgePanel.TotalAssets',
  MY_TASK: 'KnowledgePanel.MyTask',
  PIPELINE_STATUS: 'KnowledgePanel.PipelineStatus',
  ACTIVITY_FEED: 'KnowledgePanel.ActivityFeed',
  YOURS_AND_FOLLOWED: 'KnowledgePanel.YoursAndFollowed',
  KNOWLEDGE_CENTER: 'KnowledgePanel.KnowledgeCenter',
  CURATED_ASSETS: 'KnowledgePanel.CuratedAssets',
  DATA_QUALITY: 'KnowledgePanel.DataQuality',
  DOMAINS: 'KnowledgePanel.Domains',
  DATA_PRODUCTS: 'KnowledgePanel.DataProducts',
  KPI: 'KnowledgePanel.KPI',
} as const;

/** Every landing-page widget key this build renders, in default-layout order. */
export const MY_DATA_WIDGET_KEYS: readonly string[] = [
  LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH,
  LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE,
  LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS,
  LANDING_PAGE_WIDGET_KEYS.MY_TASK,
  LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS,
  LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED,
  LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED,
  LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER,
  LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS,
  LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY,
  LANDING_PAGE_WIDGET_KEYS.DOMAINS,
  LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS,
  LANDING_PAGE_WIDGET_KEYS.KPI,
];

/**
 * Official `getExcludedWidgetFqns()`: the three retired keys, verbatim.
 * `MY_TASK` and `TOTAL_DATA_ASSETS` are not here — their keys were reused
 * for the topic cards that replaced them.
 */
export const EXCLUDED_WIDGET_FQNS: readonly string[] = [
  'KnowledgePanel.MyData',
  'KnowledgePanel.Following',
  'KnowledgePanel.DataAssets',
];

/**
 * Official `DEFAULT_LANDING_PAGE_LAYOUT`, copied item by item. Never
 * reuse the per-widget `*_DEFAULT_VALUES` templates for coordinates —
 * their x/y are placeholders (e.g. CuratedAssets `x:2, y:0`).
 */
export const DEFAULT_LANDING_PAGE_LAYOUT: readonly LandingPageLayoutItem[] = [
  { i: LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH, x: 0, y: 0, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE, x: 1, y: 0, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS, x: 0, y: 1, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.MY_TASK, x: 1, y: 1, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS, x: 0, y: 2, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED, x: 1, y: 2, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED, x: 0, y: 3, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER, x: 1, y: 3, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS, x: 0, y: 4, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY, x: 1, y: 4, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.DOMAINS, x: 0, y: 5, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS, x: 1, y: 5, w: 1, h: 3, static: false },
  { i: LANDING_PAGE_WIDGET_KEYS.KPI, x: 0, y: 6, w: 1, h: 3, static: false },
];

/**
 * Reserved height of one widget, non-subdivided rendering
 * (ADR:2026-11-07-my-data-row-height-non-subdivided): a widget spans
 * `h` rows of `rowHeight` with `margin` between them, so
 * `h * (rowHeight + margin) - margin`. With the stage-A values
 * (h=3, rowHeight=133.33, margin=16) this is 431.99px. This must stay
 * in step with the chosen row-height convention — never pair `h:3`
 * with the subdivided row height (21.3325), which would shrink a card
 * to about 96px.
 */
export function widgetHeight(h: number): number {
  return h * (LANDING_PAGE_ROW_HEIGHT + LANDING_PAGE_WIDGET_MARGIN) - LANDING_PAGE_WIDGET_MARGIN;
}

/** Reserved height of a default widget cell, in px. */
export const LANDING_PAGE_WIDGET_HEIGHT_PX = widgetHeight(LANDING_PAGE_DEFAULT_WIDGET_HEIGHT);

/** Official `isKnownMyDataWidgetKey`: prefix match, so an instance key carrying a `uniqueId` suffix still resolves. */
export function isKnownMyDataWidgetKey(
  widgetKey: string,
  knownWidgetKeys: readonly string[] = MY_DATA_WIDGET_KEYS,
): boolean {
  return knownWidgetKeys.some((prefix) => widgetKey.startsWith(prefix));
}

/** Official `getMyDataWidgetBaseKey`: the matched registry prefix, or the key itself when unknown. */
export function getMyDataWidgetBaseKey(
  widgetKey: string,
  knownWidgetKeys: readonly string[] = MY_DATA_WIDGET_KEYS,
): string {
  return knownWidgetKeys.find((prefix) => widgetKey.startsWith(prefix)) ?? widgetKey;
}

/** Official `isAvailableMyDataWidgetKey`: known and not retired. */
export function isAvailableMyDataWidgetKey(
  widgetKey: string,
  excludedWidgetFqns: readonly string[],
  knownWidgetKeys: readonly string[] = MY_DATA_WIDGET_KEYS,
): boolean {
  return (
    isKnownMyDataWidgetKey(widgetKey, knownWidgetKeys) &&
    !excludedWidgetFqns.some((fqn) => widgetKey.startsWith(fqn))
  );
}

/**
 * Official `reflowLayoutToGrid`: only re-packs when a widget overflows
 * the grid (`x + w > cols`); a layout that already fits is returned
 * untouched, so gaps in a saved layout are preserved, not "fixed".
 * On overflow, entries are placed in `y -> x` order, `w` truncated to
 * `cols`.
 */
export function reflowLayoutToGrid(
  widgets: LandingPageLayoutItem[],
  cols: number = LANDING_PAGE_MAX_GRID_SIZE,
): LandingPageLayoutItem[] {
  const overflows = widgets.some((widget) => widget.x + widget.w > cols);
  if (!overflows) {
    return widgets;
  }
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  let currentX = 0;
  let currentY = 0;
  let maxHeightInRow = 0;
  return ordered.map((widget) => {
    const w = Math.min(widget.w, cols);
    if (currentX + w > cols) {
      currentX = 0;
      currentY += maxHeightInRow;
      maxHeightInRow = 0;
    }
    const placed = { ...widget, w, x: currentX, y: currentY };
    currentX += w;
    maxHeightInRow = Math.max(maxHeightInRow, widget.h);
    return placed;
  });
}

function isLayoutItem(value: unknown): value is LandingPageLayoutItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as { i?: unknown; x?: unknown; y?: unknown };
  // The JSON editor stores pages verbatim, so a hand-edited layout can
  // carry a non-string key or non-numeric coordinates; official would
  // place those as NaN. Dropping them here keeps one bad entry from
  // breaking the whole grid, the same fail-safe as an unknown key.
  return (
    typeof item.i === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y)
  );
}

/**
 * Official `normalizeLandingPageLayout`, all five parameters: retired
 * keys are filtered out, `w:1, h:3` are forced (the landing grid has
 * no size control, so any other size is stale three-column-era state),
 * an empty result falls back to the default layout, and the result is
 * reflowed. A missing or non-array saved layout is the caller's
 * "no saved layout" (see `extractSavedLandingLayout`).
 */
export function normalizeLandingPageLayout(
  savedLayout: LandingPageLayoutItem[] | undefined,
  defaultLayout: readonly LandingPageLayoutItem[],
  excludedWidgetFqns: readonly string[],
  cols: number,
  knownWidgetKeys: readonly string[],
): LandingPageLayoutItem[] {
  const filtered = (savedLayout ?? [])
    .filter(isLayoutItem)
    .filter((widget) => isAvailableMyDataWidgetKey(widget.i, excludedWidgetFqns, knownWidgetKeys))
    .map((widget) => ({
      ...widget,
      w: LANDING_PAGE_WIDGET_COLUMN_SPAN,
      h: LANDING_PAGE_DEFAULT_WIDGET_HEIGHT,
    }));
  const source = filtered.length ? filtered : [...defaultLayout];
  return reflowLayoutToGrid(source, cols);
}

/**
 * The saved layout of a persona document's LandingPage, if it is an
 * array. A Record-shaped layout (the JSON editor stores pages
 * verbatim, and `PersonaPage.layout` tolerates that shape) is treated
 * as no saved layout, so the default layout applies.
 */
export function extractSavedLandingLayout(
  document: PersonaDocument | null | undefined,
): LandingPageLayoutItem[] | undefined {
  const layout = getPersonaPage(document, 'LandingPage')?.layout;
  return Array.isArray(layout) ? (layout as LandingPageLayoutItem[]) : undefined;
}

/**
 * The read path for a persona's landing layout: extract the saved
 * layout from the persona document and normalize it against the
 * five-parameter port above. No persona document, no LandingPage page,
 * or an empty/filtered-out layout all resolve to the default layout.
 */
export function resolveLandingPageLayout(
  document: PersonaDocument | null | undefined,
): LandingPageLayoutItem[] {
  return normalizeLandingPageLayout(
    extractSavedLandingLayout(document),
    DEFAULT_LANDING_PAGE_LAYOUT,
    EXCLUDED_WIDGET_FQNS,
    LANDING_PAGE_MAX_GRID_SIZE,
    MY_DATA_WIDGET_KEYS,
  );
}

export type TrackedFilter = 'owned' | 'followed';

/**
 * Official `getDefaultTrackedFilter` (`YoursAndFollowedWidget.utils.ts`):
 * the card opens on whichever list has something in it, so a reader
 * who only follows does not land on an empty "Owned" list. Both empty
 * (or owned non-empty) opens on Owned.
 */
export function getDefaultTrackedFilter(
  ownedTotal: number,
  followedTotal: number,
): TrackedFilter {
  return ownedTotal === 0 && followedTotal > 0 ? 'followed' : 'owned';
}
