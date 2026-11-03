/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import type { PersonaPage } from '@/types/persona';

/**
 * B3-6 reader ruling — official DataMarketplacePage.component.tsx
 * (openmetadata-ui, snapshot 888654d2):
 *
 * - Fixed chrome outside the layout: the greeting banner + search hero,
 *   and AnnouncementsWidgetV2 above the widget column. Announcements is
 *   NOT a layout widget, so it never moves.
 * - The layout column holds exactly two widget kinds, resolved by
 *   getDataMarketplaceWidgetsFromKey (DataMarketplaceUtils): a key
 *   starting with 'KnowledgePanel.MarketplaceDataProducts' renders the
 *   data-products widget, one starting with
 *   'KnowledgePanel.MarketplaceDomains' renders the domains widget, and
 *   anything else resolves to null — it is skipped, never rendered.
 * - Layout resolution, in order: no persona or no document -> default;
 *   the OVERVIEW tab's layout (tabs.find(id === 'overview').layout) when
 *   non-empty -> normalized; else the page-level layout when non-empty
 *   -> normalized; else default. (Official's getLayoutFromCustomizedPage
 *   also returns a default widget set when a page has no tabs; that set
 *   orders the same as the default layout, so it collapses into the
 *   default branch here instead of being replicated.)
 * - normalizeLayout forces full width and sorts by y ascending. A
 *   missing or non-numeric y compares as NaN, which Array.sort treats
 *   as 0, so such entries keep their input order — mirrored below.
 * - Default layout: data-products (y 0), then domains (y 1).
 *
 * Product mapping: the hero and announcements stay fixed above, and
 * only the data-products / domains column order follows the layout.
 * The product keeps its side-by-side Row (two half-width columns);
 * stacking them full-width would change product visuals, which the
 * product's own design language owns — order is what this feature
 * governs, not the column geometry.
 */
export type MarketplaceWidgetKey = 'data-products' | 'domains';

export const DEFAULT_MARKETPLACE_WIDGET_ORDER: MarketplaceWidgetKey[] = [
  'data-products',
  'domains',
];

const WIDGET_KEY_PREFIXES: Array<{ prefix: string; key: MarketplaceWidgetKey }> = [
  { prefix: 'KnowledgePanel.MarketplaceDataProducts', key: 'data-products' },
  { prefix: 'KnowledgePanel.MarketplaceDomains', key: 'domains' },
];

const OVERVIEW_TAB_ID = 'overview';

interface LayoutEntry {
  i?: unknown;
  y?: unknown;
}

function asLayoutEntries(value: unknown): LayoutEntry[] | undefined {
  return Array.isArray(value) ? (value as LayoutEntry[]) : undefined;
}

function overviewTabLayout(page: PersonaPage): LayoutEntry[] | undefined {
  if (!Array.isArray(page.tabs)) {
    return undefined;
  }
  const tab = page.tabs.find(
    (entry): entry is { id?: unknown; layout?: unknown } =>
      typeof entry === 'object' && entry !== null && (entry as { id?: unknown }).id === OVERVIEW_TAB_ID,
  );
  return tab ? asLayoutEntries(tab.layout) : undefined;
}

export function resolveMarketplaceWidgetOrder(
  page: PersonaPage | undefined,
): MarketplaceWidgetKey[] {
  if (!page) {
    return [...DEFAULT_MARKETPLACE_WIDGET_ORDER];
  }
  const tabEntries = overviewTabLayout(page);
  const pageEntries = asLayoutEntries(page.layout);
  const entries = tabEntries?.length ? tabEntries : pageEntries?.length ? pageEntries : undefined;
  if (!entries) {
    return [...DEFAULT_MARKETPLACE_WIDGET_ORDER];
  }
  // Unknown keys resolve to null officially, so they are dropped here;
  // a non-empty layout of only unknown keys therefore yields no widgets
  // (distinct from an empty layout, which falls back to the default).
  const known = entries.flatMap((entry) => {
    if (typeof entry?.i !== 'string') {
      return [];
    }
    const match = WIDGET_KEY_PREFIXES.find((candidate) => entry.i.startsWith(candidate.prefix));
    if (!match) {
      return [];
    }
    return [{ key: match.key, y: typeof entry.y === 'number' ? entry.y : Number.NaN }];
  });
  known.sort((a, b) => a.y - b.y);
  const order: MarketplaceWidgetKey[] = [];
  for (const item of known) {
    if (!order.includes(item.key)) {
      order.push(item.key);
    }
  }
  return order;
}
