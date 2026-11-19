/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import type { PersonaPage } from '@/types/persona';

/**
 * Marketplace read side, ruling c* (C-4 spec §6.3, adjudication item
 * 7): the official read side is a full-width column, sorted by `y`,
 * with content-driven height — the stored `x`/`w`/`h` carry no grid
 * semantics on read. Official
 * `DataMarketplacePage.component.tsx:61-68,117-140`:
 *
 * - `normalizeLayout` forces `w:8, x:0` (full width) and sorts by `y`
 *   ascending. A missing or non-numeric `y` compares as NaN, which
 *   `Array.sort` treats as 0, so such entries keep their input order
 *   — mirrored below.
 * - The layout chain is `isEmpty`-gated: the overview tab's layout
 *   when non-empty, else the page-level layout when non-empty, else
 *   the default layout. `getLayoutFromCustomizedPage`
 *   (`CustomizePageWidgetUtils.ts:145-161`) returns the default
 *   widget set when a page has no tabs, so with no tabs the page
 *   layout branch is unreachable and the default order applies.
 *   When tabs exist but no overview tab is found, the tab layout is
 *   `undefined`, which is empty, so the chain falls through to the
 *   page layout.
 * - Widgets render per layout entry with no dedup: the same kind
 *   appearing twice renders twice. Keys resolve by prefix
 *   (`getDataMarketplaceWidgetsFromKey`, `DataMarketplaceUtils`):
 *   a key starting with `KnowledgePanel.MarketplaceDataProducts`
 *   renders the data-products widget, one starting with
 *   `KnowledgePanel.MarketplaceDomains` renders the domains widget,
 *   and anything else resolves to null — it is skipped, never
 *   rendered. A non-empty layout of only unknown keys therefore
 *   yields no widgets, distinct from an empty layout, which falls
 *   back to the default.
 *
 * Object-shaped layouts (C-4 §4.4 D4): the official chain guards
 * only with lodash `isEmpty`, which is true for `{}` and false for a
 * non-empty object. `{}` therefore falls through to the next branch
 * (and to the default at the page level), while a non-empty object
 * reaches `normalizeLayout` and throws on `.map`. This resolver
 * reproduces that bifurcation: empty values fall through, non-empty
 * non-array values throw a `TypeError` instead of silently
 * presenting the default layout. The view renders an explicit error
 * state for the throw; the `{}`-vs-object behavior awaits live
 * confirmation (U-02, live step L1).
 *
 * Fixed chrome outside the layout (greeting banner, search hero,
 * announcements) is not a layout widget and never moves; only the
 * data-products / domains column follows the layout.
 */
export type MarketplaceWidgetKey = 'data-products' | 'domains';

/** One rendered widget: its kind plus the layout key that produced it. */
export interface MarketplaceWidgetEntry {
  key: MarketplaceWidgetKey;
  layoutKey: string;
}

const DATA_PRODUCTS_LAYOUT_KEY = 'KnowledgePanel.MarketplaceDataProducts';
const DOMAINS_LAYOUT_KEY = 'KnowledgePanel.MarketplaceDomains';

export const DEFAULT_MARKETPLACE_WIDGET_ENTRIES: MarketplaceWidgetEntry[] = [
  { key: 'data-products', layoutKey: DATA_PRODUCTS_LAYOUT_KEY },
  { key: 'domains', layoutKey: DOMAINS_LAYOUT_KEY },
];

const WIDGET_KEY_PREFIXES: Array<{ prefix: string; key: MarketplaceWidgetKey }> = [
  { prefix: DATA_PRODUCTS_LAYOUT_KEY, key: 'data-products' },
  { prefix: DOMAINS_LAYOUT_KEY, key: 'domains' },
];

const OVERVIEW_TAB_ID = 'overview';

interface LayoutEntry {
  i?: unknown;
  y?: unknown;
}

/**
 * Lodash `isEmpty` over the JSON shapes a stored layout can take
 * (the official chain's only guard): nullish, empty arrays/strings,
 * and objects with no keys are empty; numbers and booleans are
 * empty too, as lodash defines them. Anything else is non-empty.
 */
function isEmptyLayoutValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return true;
}

/**
 * One chain step: an empty value falls through to the next branch
 * (undefined), a non-empty array supplies its entries, and a
 * non-empty non-array value throws (D4) instead of silently
 * defaulting.
 */
function checkedLayoutEntries(value: unknown): LayoutEntry[] | undefined {
  if (isEmptyLayoutValue(value)) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`Marketplace layout must be an array, received ${typeof value}`);
  }
  return value as LayoutEntry[];
}

function overviewTabLayout(page: PersonaPage): unknown {
  if (!Array.isArray(page.tabs)) {
    return undefined;
  }
  const tab = page.tabs.find(
    (entry): entry is { id?: unknown; layout?: unknown } =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { id?: unknown }).id === OVERVIEW_TAB_ID,
  );
  return tab?.layout;
}

function toWidgetEntries(entries: LayoutEntry[]): MarketplaceWidgetEntry[] {
  const known = entries.flatMap((entry) => {
    if (typeof entry?.i !== 'string') {
      return [];
    }
    const match = WIDGET_KEY_PREFIXES.find((candidate) => entry.i.startsWith(candidate.prefix));
    if (!match) {
      return [];
    }
    return [
      {
        key: match.key,
        layoutKey: entry.i,
        y: typeof entry.y === 'number' ? entry.y : Number.NaN,
      },
    ];
  });
  known.sort((a, b) => a.y - b.y);
  // No dedup: every entry renders, including repeated kinds.
  return known.map(({ key, layoutKey }) => ({ key, layoutKey }));
}

export function resolveMarketplaceWidgetEntries(
  page: PersonaPage | undefined,
): MarketplaceWidgetEntry[] {
  if (!page) {
    return [...DEFAULT_MARKETPLACE_WIDGET_ENTRIES];
  }
  // No tabs: official `getLayoutFromCustomizedPage` returns the
  // default widget set, so the page layout branch is unreachable.
  if (!Array.isArray(page.tabs) || page.tabs.length === 0) {
    return [...DEFAULT_MARKETPLACE_WIDGET_ENTRIES];
  }
  const tabEntries = checkedLayoutEntries(overviewTabLayout(page));
  if (tabEntries !== undefined) {
    return toWidgetEntries(tabEntries);
  }
  const pageEntries = checkedLayoutEntries(page.layout);
  if (pageEntries !== undefined) {
    return toWidgetEntries(pageEntries);
  }
  return [...DEFAULT_MARKETPLACE_WIDGET_ENTRIES];
}
