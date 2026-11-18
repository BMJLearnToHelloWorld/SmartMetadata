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
  DETAILS_PAGE_TYPES,
  PageTypeToEntityTypeMap,
  getCustomizableWidgetByPage,
  getDefaultTabs,
  getDefaultWidgetForTab,
  getDummyDataByPage,
  getTabDisplayName,
  getWidgetHeight,
} from './customizePageData';
import { PAGE_DATA_TABLES } from './pageDataTables';

describe('customizePageData dispatch', () => {
  it('exposes the 19 details page types in the spec order', () => {
    expect(DETAILS_PAGE_TYPES).toHaveLength(19);
    expect(DETAILS_PAGE_TYPES[0]).toBe('Table');
    expect(DETAILS_PAGE_TYPES[18]).toBe('Worksheet');
    expect(DETAILS_PAGE_TYPES).not.toContain('Tag');
    expect(DETAILS_PAGE_TYPES).not.toContain('Classification');
    expect(DETAILS_PAGE_TYPES).not.toContain('LandingPage');
    expect(DETAILS_PAGE_TYPES).not.toContain('DataMarketplace');
  });

  it('maps page types to entity types (24 entries incl. LandingPage→ALL)', () => {
    expect(PageTypeToEntityTypeMap.LandingPage).toBe('ALL');
    expect(PageTypeToEntityTypeMap.Table).toBe('TABLE');
    expect(PageTypeToEntityTypeMap.GlossaryTerm).toBe('GLOSSARY_TERM');
    expect(PageTypeToEntityTypeMap.DataProduct).toBe('DATA_PRODUCT');
    expect(Object.keys(PageTypeToEntityTypeMap)).toHaveLength(24);
  });

  it('returns 10 Table tabs with no displayName (official absence preserved)', () => {
    const tabs = getDefaultTabs('Table');
    expect(tabs.map((tab) => tab.id)).toEqual([
      'schema',
      'activity_feed',
      'sample_data',
      'table_queries',
      'profiler',
      'lineage',
      'dbt',
      'view_definition',
      'contract',
      'custom_properties',
    ]);
    expect(tabs.every((tab) => tab.displayName === undefined)).toBe(true);
    expect(tabs[0].editable).toBe(true);
  });

  it('resolves Table tab labels through TAB_LABEL_MAP', () => {
    const tabs = getDefaultTabs('Table');
    expect(getTabDisplayName(tabs[0])).toBe('label.schema');
    expect(getTabDisplayName(tabs[9])).toBe('label.custom-property-plural');
  });

  it('stores resolved labels when a resolver is given', () => {
    const tabs = getDefaultTabs('Topic', (id, key) => `${id}:${key}`);
    expect(tabs[0].displayName).toBe('schema:label.schema');
  });

  it('returns a single custom-properties tab for unknown page types', () => {
    const tabs = getDefaultTabs('NoSuchPage');
    expect(tabs).toHaveLength(1);
    // Official verbatim fallback shape: id + name, resolved displayName
    // (label key without a resolver), the GlossaryTerm
    // custom_properties layout ([]), and NO editable key.
    expect(tabs[0].id).toBe('custom_properties');
    expect(tabs[0].name).toBe('custom_properties');
    expect(tabs[0].displayName).toBe('label.custom-property-plural');
    expect(tabs[0].layout).toEqual([]);
    expect('editable' in tabs[0]).toBe(false);
    expect(getDefaultWidgetForTab('NoSuchPage', 'overview')).toEqual([]);
    expect(getCustomizableWidgetByPage('NoSuchPage')).toEqual([]);
    expect(getDummyDataByPage('NoSuchPage')).toEqual({});
  });

  it('getTabDisplayName renders a custom tab by its typed name', () => {
    // Official: displayName ?? getTabLabelFromId(name); the label map
    // falls back to its input, so a custom tab shows its name, never
    // its generated custom* id.
    expect(
      getTabDisplayName({ id: 'custom1', name: 'My Tab', editable: true }),
    ).toBe('My Tab');
    expect(getTabDisplayName({ id: 'schema', name: 'schema' })).toBe('label.schema');
    expect(
      getTabDisplayName({ id: 'schema', name: 'schema', displayName: 'Renamed' }),
    ).toBe('Renamed');
  });

  it('returns the Table schema default layout (left panel + right column)', () => {
    const layout = getDefaultWidgetForTab('Table', 'schema');
    expect(layout.length).toBeGreaterThan(0);
    const panel = layout.find((widget) => widget.i === 'KnowledgePanel.LeftPanel');
    expect(panel).toMatchObject({ w: 6, x: 0, y: 0, static: true });
    expect(panel?.children?.length).toBeGreaterThan(0);
    const right = layout.filter((widget) => widget.x === 6);
    expect(right.length).toBeGreaterThan(0);
    expect(right.every((widget) => widget.w === 2)).toBe(true);
  });

  it('returns [] for tabs without a default layout', () => {
    expect(getDefaultWidgetForTab('Table', 'overview')).toEqual([]);
    expect(getDefaultWidgetForTab('DataMarketplace', 'schema')).toEqual([]);
  });

  it('returns the marketplace default layout (2 full-width widgets)', () => {
    const layout = getDefaultWidgetForTab('DataMarketplace', 'overview');
    expect(layout).toHaveLength(2);
    expect(layout.every((widget) => widget.w === 8 && widget.x === 0 && widget.h === 1)).toBe(true);
    expect(layout.map((widget) => widget.y)).toEqual([0, 1]);
  });

  it('applies the Container default layout to both children and schema tabs', () => {
    expect(getDefaultWidgetForTab('Container', 'children').length).toBeGreaterThan(0);
    expect(getDefaultWidgetForTab('Container', 'schema').length).toBeGreaterThan(0);
    expect(getDefaultWidgetForTab('Container', 'overview')).toEqual([]);
  });

  it('preserves the Topic duplicate KnowledgeArticle widget entry', () => {
    const widgets = getCustomizableWidgetByPage('Topic');
    const articles = widgets.filter(
      (widget) => widget.fullyQualifiedName === 'KnowledgePanel.KnowledgeArticle',
    );
    expect(articles).toHaveLength(2);
  });

  it('returns GlossaryTerm tabs with the overview tab editable', () => {
    const tabs = getDefaultTabs('GlossaryTerm');
    expect(tabs.map((tab) => tab.id)).toEqual([
      'overview',
      'glossary_terms',
      'assets',
      'activity_feed',
      'relations_graph',
      'custom_properties',
      'data_observability',
    ]);
    expect(tabs[0].editable).toBe(true);
    expect(getDefaultWidgetForTab('GlossaryTerm', 'overview').length).toBeGreaterThan(0);
  });

  it('returns Glossary tabs with the terms tab editable', () => {
    const tabs = getDefaultTabs('Glossary');
    expect(tabs.map((tab) => tab.id)).toEqual([
      'terms',
      'review',
      'relations_graph',
      'activity_feed',
    ]);
    expect(tabs[0].editable).toBe(true);
    expect(getDefaultWidgetForTab('Glossary', 'terms').length).toBeGreaterThan(0);
    expect(getDefaultWidgetForTab('Glossary', 'overview')).toEqual([]);
  });

  it('resolves widget heights with per-type maps and fallbacks', () => {
    expect(getWidgetHeight('Table', 'KnowledgePanel.Description')).toBe(
      PAGE_DATA_TABLES.Table.heightMap['KnowledgePanel.Description'],
    );
    expect(getWidgetHeight('Metric', 'KnowledgePanel.NoSuchWidget')).toBe(1);
    expect(getWidgetHeight('Glossary', 'KnowledgePanel.Description')).toBe(2);
    expect(getWidgetHeight('NoSuchPage', 'KnowledgePanel.Description')).toBe(1);
  });

  it('returns header projections of the official dummy data', () => {
    expect(getDummyDataByPage('Table')).toMatchObject({
      name: 'raw_product_catalog',
      fullyQualifiedName: 'sample_data.ecommerce_db.shopify.raw_product_catalog',
    });
    expect(getDummyDataByPage('Database')).toMatchObject({
      fullyQualifiedName: 'sample_data.ecommerce_db',
    });
    expect(getDummyDataByPage('DataProduct')).toMatchObject({
      id: 'dummy-data-product',
      fullyQualifiedName: 'sample.dataProduct',
    });
    expect(getDummyDataByPage('DataMarketplace')).toEqual({});
    expect(getDummyDataByPage('Glossary')).toEqual({});
    expect(getDummyDataByPage('GlossaryTerm')).toEqual({});
  });

  it('keeps every default layout within the 8-column grid', () => {
    for (const [pageType, table] of Object.entries(PAGE_DATA_TABLES)) {
      for (const widget of table.defaultLayout as Array<Record<string, unknown>>) {
        const x = widget.x as number;
        const w = widget.w as number;
        expect(
          x + w <= 8,
          `${pageType} widget ${String(widget.i)} exceeds 8 columns`,
        ).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
