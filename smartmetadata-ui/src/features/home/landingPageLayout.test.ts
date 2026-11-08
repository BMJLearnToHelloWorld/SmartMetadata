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
  DEFAULT_LANDING_PAGE_LAYOUT,
  EXCLUDED_WIDGET_FQNS,
  LANDING_PAGE_MAX_GRID_SIZE,
  LANDING_PAGE_WIDGET_KEYS,
  MY_DATA_WIDGET_KEYS,
  extractSavedLandingLayout,
  getDefaultTrackedFilter,
  getMyDataWidgetBaseKey,
  isAvailableMyDataWidgetKey,
  isKnownMyDataWidgetKey,
  normalizeLandingPageLayout,
  reflowLayoutToGrid,
  resolveLandingPageLayout,
  widgetHeight,
  type LandingPageLayoutItem,
} from './landingPageLayout';
import type { PersonaDocument } from '@/types/persona';

function item(i: string, x: number, y: number, w = 1, h = 3): LandingPageLayoutItem {
  return { i, x, y, w, h, static: false };
}

function documentWithLayout(layout: unknown): PersonaDocument {
  return {
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: { pages: [{ pageType: 'LandingPage', layout: layout as never }] },
  };
}

describe('landing page layout', () => {
  it('keeps the official 13-item default layout, 2 columns, w:1 h:3', () => {
    expect(DEFAULT_LANDING_PAGE_LAYOUT).toHaveLength(13);
    expect(MY_DATA_WIDGET_KEYS).toHaveLength(13);
    expect(DEFAULT_LANDING_PAGE_LAYOUT.map((entry) => entry.i)).toEqual([
      ...MY_DATA_WIDGET_KEYS,
    ]);
    expect(DEFAULT_LANDING_PAGE_LAYOUT).toEqual([
      item(LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH, 0, 0),
      item(LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE, 1, 0),
      item(LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS, 0, 1),
      item(LANDING_PAGE_WIDGET_KEYS.MY_TASK, 1, 1),
      item(LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS, 0, 2),
      item(LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED, 1, 2),
      item(LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED, 0, 3),
      item(LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER, 1, 3),
      item(LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS, 0, 4),
      item(LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY, 1, 4),
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 0, 5),
      item(LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS, 1, 5),
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 6),
    ]);
    expect(LANDING_PAGE_MAX_GRID_SIZE).toBe(2);
  });

  it('excludes exactly the three retired keys', () => {
    expect(EXCLUDED_WIDGET_FQNS).toEqual([
      'KnowledgePanel.MyData',
      'KnowledgePanel.Following',
      'KnowledgePanel.DataAssets',
    ]);
    // Keys reused by the topic cards that replaced them are not excluded.
    expect(
      isAvailableMyDataWidgetKey(
        LANDING_PAGE_WIDGET_KEYS.MY_TASK,
        EXCLUDED_WIDGET_FQNS,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toBe(true);
    expect(
      isAvailableMyDataWidgetKey(
        LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS,
        EXCLUDED_WIDGET_FQNS,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toBe(true);
  });

  it('matches known keys by prefix, so instance suffixes still resolve', () => {
    expect(isKnownMyDataWidgetKey('KnowledgePanel.Domains-211')).toBe(true);
    expect(isKnownMyDataWidgetKey('KnowledgePanel.Foo')).toBe(false);
    expect(getMyDataWidgetBaseKey('KnowledgePanel.Domains-211')).toBe(
      LANDING_PAGE_WIDGET_KEYS.DOMAINS,
    );
    expect(getMyDataWidgetBaseKey('KnowledgePanel.Foo')).toBe('KnowledgePanel.Foo');
  });

  it('reserves h * (rowHeight + margin) - margin per widget (non-subdivided)', () => {
    expect(widgetHeight(3)).toBeCloseTo(431.99, 2);
    expect(widgetHeight(1)).toBeCloseTo(133.33, 2);
  });

  it('falls back to the default layout when nothing is saved', () => {
    expect(
      normalizeLandingPageLayout(
        undefined,
        DEFAULT_LANDING_PAGE_LAYOUT,
        EXCLUDED_WIDGET_FQNS,
        LANDING_PAGE_MAX_GRID_SIZE,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toEqual(DEFAULT_LANDING_PAGE_LAYOUT);
    expect(
      normalizeLandingPageLayout(
        [],
        DEFAULT_LANDING_PAGE_LAYOUT,
        EXCLUDED_WIDGET_FQNS,
        LANDING_PAGE_MAX_GRID_SIZE,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toEqual(DEFAULT_LANDING_PAGE_LAYOUT);
  });

  it('filters retired keys and falls back to default when nothing survives', () => {
    const retiredOnly = [
      item('KnowledgePanel.MyData', 0, 0),
      item('KnowledgePanel.Following', 1, 0),
      item('KnowledgePanel.DataAssets', 0, 1),
    ];
    expect(
      normalizeLandingPageLayout(
        retiredOnly,
        DEFAULT_LANDING_PAGE_LAYOUT,
        EXCLUDED_WIDGET_FQNS,
        LANDING_PAGE_MAX_GRID_SIZE,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toEqual(DEFAULT_LANDING_PAGE_LAYOUT);
  });

  it('filters retired and unknown keys, forces w:1 h:3, keeps the rest in place', () => {
    const saved = [
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 0, 2, 6),
      item('KnowledgePanel.MyData', 1, 0),
      item('KnowledgePanel.Nope', 0, 1),
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 1, 1, 2, 4),
    ];
    expect(
      normalizeLandingPageLayout(
        saved,
        DEFAULT_LANDING_PAGE_LAYOUT,
        EXCLUDED_WIDGET_FQNS,
        LANDING_PAGE_MAX_GRID_SIZE,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toEqual([
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 0),
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 1, 1),
    ]);
  });

  it('drops entries with a non-string key or non-numeric coordinates instead of placing NaN', () => {
    const saved = [
      { i: 42, x: 0, y: 0, w: 1, h: 3, static: false } as unknown as LandingPageLayoutItem,
      { i: LANDING_PAGE_WIDGET_KEYS.KPI, x: 'a', y: 0, w: 1, h: 3, static: false } as unknown as LandingPageLayoutItem,
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 0, 0),
    ];
    expect(
      normalizeLandingPageLayout(
        saved,
        DEFAULT_LANDING_PAGE_LAYOUT,
        EXCLUDED_WIDGET_FQNS,
        LANDING_PAGE_MAX_GRID_SIZE,
        MY_DATA_WIDGET_KEYS,
      ),
    ).toEqual([item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 0, 0)]);
  });

  it('reflow returns a fitting layout untouched, gaps included', () => {
    const fitted = [
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 0),
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 0, 2),
    ];
    expect(reflowLayoutToGrid(fitted, 2)).toBe(fitted);
  });

  it('reflow re-packs only on overflow, in y -> x order, truncating w to cols', () => {
    const overflowing = [
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 1, 1),
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 2, 0),
      item(LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS, 0, 0),
    ];
    expect(reflowLayoutToGrid(overflowing, 2)).toEqual([
      item(LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS, 0, 0),
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 1, 0),
      item(LANDING_PAGE_WIDGET_KEYS.DOMAINS, 0, 3),
    ]);
    // A width wider than the grid is truncated to cols when re-packing.
    expect(reflowLayoutToGrid([item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 0, 3, 3)], 2)).toEqual([
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 0, 0, 2, 3),
    ]);
  });

  it('treats a Record-shaped saved layout as no saved layout', () => {
    expect(extractSavedLandingLayout(documentWithLayout({ KPI: { x: 0, y: 0 } }))).toBeUndefined();
    expect(resolveLandingPageLayout(documentWithLayout({ KPI: { x: 0, y: 0 } }))).toEqual(
      DEFAULT_LANDING_PAGE_LAYOUT,
    );
  });

  it('extracts an array saved layout and resolves it through normalization', () => {
    const saved = [item(LANDING_PAGE_WIDGET_KEYS.KPI, 1, 0)];
    expect(extractSavedLandingLayout(documentWithLayout(saved))).toEqual(saved);
    expect(resolveLandingPageLayout(documentWithLayout(saved))).toEqual([
      item(LANDING_PAGE_WIDGET_KEYS.KPI, 1, 0),
    ]);
    expect(resolveLandingPageLayout(null)).toEqual(DEFAULT_LANDING_PAGE_LAYOUT);
    expect(resolveLandingPageLayout(documentWithLayout(undefined))).toEqual(
      DEFAULT_LANDING_PAGE_LAYOUT,
    );
  });

  it('opens YoursAndFollowed on whichever list has something in it', () => {
    expect(getDefaultTrackedFilter(0, 0)).toBe('owned');
    expect(getDefaultTrackedFilter(3, 0)).toBe('owned');
    expect(getDefaultTrackedFilter(3, 5)).toBe('owned');
    expect(getDefaultTrackedFilter(0, 5)).toBe('followed');
  });
});
