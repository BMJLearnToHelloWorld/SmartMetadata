/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { PersonaPage } from '@/types/persona';
import {
  DEFAULT_MARKETPLACE_WIDGET_ENTRIES,
  resolveMarketplaceWidgetEntries,
} from './marketplaceLayout';

const PRODUCTS = 'KnowledgePanel.MarketplaceDataProducts';
const DOMAINS = 'KnowledgePanel.MarketplaceDomains';

function page(partial: Partial<PersonaPage>): PersonaPage {
  return { pageType: 'DataMarketplace', ...partial };
}

function overviewTab(layout: unknown): Record<string, unknown> {
  return { id: 'overview', layout };
}

describe('resolveMarketplaceWidgetEntries', () => {
  it('falls back to the default entries without a page', () => {
    expect(resolveMarketplaceWidgetEntries(undefined)).toEqual(
      DEFAULT_MARKETPLACE_WIDGET_ENTRIES,
    );
    expect(resolveMarketplaceWidgetEntries(undefined)).toEqual([
      { key: 'data-products', layoutKey: PRODUCTS },
      { key: 'domains', layoutKey: DOMAINS },
    ]);
  });

  // Ruling c*: with no tabs, official `getLayoutFromCustomizedPage`
  // returns the default widget set, so the page layout branch is
  // unreachable — a page layout on a tab-less page is ignored.
  it('ignores the page layout when the page has no tabs', () => {
    const reversed = [
      { i: DOMAINS, y: 0 },
      { i: PRODUCTS, y: 1 },
    ];
    expect(resolveMarketplaceWidgetEntries(page({ layout: reversed }))).toEqual(
      DEFAULT_MARKETPLACE_WIDGET_ENTRIES,
    );
    expect(resolveMarketplaceWidgetEntries(page({ layout: reversed, tabs: [] }))).toEqual(
      DEFAULT_MARKETPLACE_WIDGET_ENTRIES,
    );
  });

  it('sorts the overview tab layout by y ascending', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          tabs: [overviewTab([{ i: DOMAINS, y: 1 }, { i: PRODUCTS, y: 0 }])],
        }),
      ),
    ).toEqual([
      { key: 'data-products', layoutKey: PRODUCTS },
      { key: 'domains', layoutKey: DOMAINS },
    ]);
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          tabs: [overviewTab([{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }])],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  it('prefers the overview tab layout over the page layout', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          layout: [{ i: PRODUCTS, y: 0 }, { i: DOMAINS, y: 1 }],
          tabs: [overviewTab([{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }])],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  it('falls back to the page layout when the overview tab layout is empty', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }],
          tabs: [overviewTab([])],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  it('falls back to the page layout when no overview tab exists', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }],
          tabs: [{ id: 'other', layout: [{ i: PRODUCTS, y: 0 }] }],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  it('skips unknown keys and matches suffixed keys by prefix', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          tabs: [
            overviewTab([
              { i: 'KnowledgePanel.SomethingElse', y: 0 },
              { i: `${DOMAINS}:extra`, y: 1 },
              { i: PRODUCTS, y: 2 },
            ]),
          ],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: `${DOMAINS}:extra` },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  it('renders no widgets when every entry is unknown', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({ tabs: [overviewTab([{ i: 'KnowledgePanel.SomethingElse', y: 0 }])] }),
      ),
    ).toEqual([]);
  });

  // No dedup (ruling c*): every entry renders, including repeated
  // kinds. Entries without a numeric y keep their input order (NaN
  // compares as 0 under a stable sort).
  it('keeps input order for entries without a numeric y and renders repeated kinds per entry', () => {
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          tabs: [overviewTab([{ i: DOMAINS }, { i: DOMAINS, y: 0 }, { i: PRODUCTS }])],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          tabs: [
            overviewTab([
              { i: DOMAINS, y: 0 },
              { i: PRODUCTS, y: 2 },
              { i: DOMAINS, y: 1 },
            ]),
          ],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
  });

  // C-4 §4.4 D4, marketplace bifurcation: `{}` is empty (lodash
  // `isEmpty`), so it falls through to the next branch; a non-empty
  // object is non-empty, so it throws instead of silently defaulting.
  it('falls through on an empty-object layout and throws on a non-empty object layout', () => {
    // `{}` at the tab level falls through to the page layout.
    expect(
      resolveMarketplaceWidgetEntries(
        page({
          layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }],
          tabs: [overviewTab({})],
        }),
      ),
    ).toEqual([
      { key: 'domains', layoutKey: DOMAINS },
      { key: 'data-products', layoutKey: PRODUCTS },
    ]);
    // `{}` at the page level falls through to the default.
    expect(
      resolveMarketplaceWidgetEntries(
        page({ layout: {}, tabs: [overviewTab([])] }),
      ),
    ).toEqual(DEFAULT_MARKETPLACE_WIDGET_ENTRIES);
    // A non-empty object throws at either level.
    expect(() =>
      resolveMarketplaceWidgetEntries(page({ tabs: [overviewTab({ a: 1 })] })),
    ).toThrow(TypeError);
    expect(() =>
      resolveMarketplaceWidgetEntries(
        page({ layout: { widgets: [] }, tabs: [overviewTab([])] }),
      ),
    ).toThrow(TypeError);
  });
});
