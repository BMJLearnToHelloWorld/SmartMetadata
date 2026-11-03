/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import type { PersonaPage } from '@/types/persona';
import {
  DEFAULT_MARKETPLACE_WIDGET_ORDER,
  resolveMarketplaceWidgetOrder,
} from './marketplaceLayout';

const PRODUCTS = 'KnowledgePanel.MarketplaceDataProducts';
const DOMAINS = 'KnowledgePanel.MarketplaceDomains';

function page(partial: Partial<PersonaPage>): PersonaPage {
  return { pageType: 'DataMarketplace', ...partial };
}

describe('resolveMarketplaceWidgetOrder', () => {
  it('falls back to the default order without a page', () => {
    expect(resolveMarketplaceWidgetOrder(undefined)).toEqual(DEFAULT_MARKETPLACE_WIDGET_ORDER);
    expect(resolveMarketplaceWidgetOrder(undefined)).toEqual(['data-products', 'domains']);
  });

  it('sorts the page layout by y ascending', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({ layout: [{ i: DOMAINS, y: 1 }, { i: PRODUCTS, y: 0 }] }),
      ),
    ).toEqual(['data-products', 'domains']);
    expect(
      resolveMarketplaceWidgetOrder(
        page({ layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }] }),
      ),
    ).toEqual(['domains', 'data-products']);
  });

  it('prefers the overview tab layout over the page layout', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({
          layout: [{ i: PRODUCTS, y: 0 }, { i: DOMAINS, y: 1 }],
          tabs: [{ id: 'overview', layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }] }],
        }),
      ),
    ).toEqual(['domains', 'data-products']);
  });

  it('falls back to the page layout when the overview tab layout is empty', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({
          layout: [{ i: DOMAINS, y: 0 }, { i: PRODUCTS, y: 1 }],
          tabs: [{ id: 'overview', layout: [] }],
        }),
      ),
    ).toEqual(['domains', 'data-products']);
  });

  it('ignores non-overview tabs and non-array layouts', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({
          layout: { widgets: [] } as unknown as Record<string, unknown>,
          tabs: [{ id: 'other', layout: [{ i: DOMAINS, y: 0 }] }],
        }),
      ),
    ).toEqual(DEFAULT_MARKETPLACE_WIDGET_ORDER);
  });

  it('skips unknown keys and matches suffixed keys by prefix', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({
          layout: [
            { i: 'KnowledgePanel.SomethingElse', y: 0 },
            { i: `${DOMAINS}:extra`, y: 1 },
            { i: PRODUCTS, y: 2 },
          ],
        }),
      ),
    ).toEqual(['domains', 'data-products']);
  });

  it('renders no widgets when every entry is unknown', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({ layout: [{ i: 'KnowledgePanel.SomethingElse', y: 0 }] }),
      ),
    ).toEqual([]);
  });

  it('keeps input order for entries without a numeric y and dedupes keys', () => {
    expect(
      resolveMarketplaceWidgetOrder(
        page({
          layout: [{ i: DOMAINS }, { i: DOMAINS, y: 0 }, { i: PRODUCTS }],
        }),
      ),
    ).toEqual(['domains', 'data-products']);
  });
});
