/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import {
  CUSTOM_PROPERTY_ENTITY_TYPES,
  CUSTOM_PROPERTY_ENTITY_TYPE_SET,
  CUSTOM_PROPERTY_TYPE_ENTRIES,
} from './customProperties';
import { sortSettingsItemsByRenderedTitle } from './hub';

type TypeLabels = Record<string, { label?: string; entity?: string }>;

describe('custom property type entries (official 26)', () => {
  it('defines exactly the 26 official entity types, each once', () => {
    expect(CUSTOM_PROPERTY_TYPE_ENTRIES).toHaveLength(26);
    expect(new Set(CUSTOM_PROPERTY_ENTITY_TYPES).size).toBe(26);
    expect(CUSTOM_PROPERTY_ENTITY_TYPE_SET.size).toBe(26);
    for (const type of CUSTOM_PROPERTY_ENTITY_TYPES) {
      expect(CUSTOM_PROPERTY_ENTITY_TYPE_SET.has(type)).toBe(true);
    }
  });

  it('gives every entry an icon and a resolvable label in both locales', () => {
    const enTypes = enUS.settings.customProperties.types as TypeLabels;
    const zhTypes = zhCN.settings.customProperties.types as TypeLabels;
    for (const entry of CUSTOM_PROPERTY_TYPE_ENTRIES) {
      expect(entry.icon, entry.type).toBeTruthy();
      expect(enTypes[entry.type]?.label, entry.type).toBeTruthy();
      expect(zhTypes[entry.type]?.label, entry.type).toBeTruthy();
      if (entry.type === 'tableColumn') {
        expect(entry.entityKey).toBeUndefined();
        expect(enTypes[entry.type]?.entity).toBeUndefined();
      } else {
        expect(entry.entityKey, entry.type).toBeTruthy();
        expect(enTypes[entry.type]?.entity, entry.type).toBeTruthy();
        expect(zhTypes[entry.type]?.entity, entry.type).toBeTruthy();
      }
    }
  });

  it('sorts entries by rendered label at render time, per locale (R-2)', () => {
    const enTypes = enUS.settings.customProperties.types as TypeLabels;
    const zhTypes = zhCN.settings.customProperties.types as TypeLabels;
    const labelFor =
      (types: TypeLabels) =>
      (key: string): string =>
        types[key.replace('settings.customProperties.types.', '').replace('.label', '')]
          ?.label ?? '';
    // Shuffled input: the helper sorts a copy by rendered label and leaves
    // the input untouched (the authored order is NOT the display order).
    const shuffled = [...CUSTOM_PROPERTY_TYPE_ENTRIES].reverse();
    const enSorted = sortSettingsItemsByRenderedTitle(shuffled, labelFor(enTypes));
    const enLabels = enSorted.map((entry) => enTypes[entry.type]?.label ?? '');
    expect(enLabels).toEqual([...enLabels].sort((a, b) => a.localeCompare(b)));
    expect(shuffled).toEqual([...CUSTOM_PROPERTY_TYPE_ENTRIES].reverse());
    // The zh-CN rendered order differs from the en-US order: sorting must
    // follow the active locale, not the authored en-US order.
    const zhSorted = sortSettingsItemsByRenderedTitle(shuffled, labelFor(zhTypes));
    const zhLabels = zhSorted.map((entry) => zhTypes[entry.type]?.label ?? '');
    expect(zhLabels).toEqual([...zhLabels].sort((a, b) => a.localeCompare(b)));
    expect(zhSorted.map((entry) => entry.type)).not.toEqual(
      enSorted.map((entry) => entry.type),
    );
  });

  it('uses the plural entity label for the 17 official plural items (R-1)', () => {
    const enTypes = enUS.settings.customProperties.types as TypeLabels;
    expect(enTypes.table?.entity).toBe('Tables');
    expect(enTypes.storedProcedure?.entity).toBe('Stored procedures');
    expect(enTypes.dashboard?.entity).toBe('Dashboards');
    expect(enTypes.pipeline?.entity).toBe('Pipelines');
    expect(enTypes.topic?.entity).toBe('Topics');
    expect(enTypes.container?.entity).toBe('Containers');
    expect(enTypes.mlmodel?.entity).toBe('ML models');
    expect(enTypes.searchIndex?.entity).toBe('Search indexes');
    expect(enTypes.chart?.entity).toBe('Charts');
    expect(enTypes.directory?.entity).toBe('Directories');
    expect(enTypes.file?.entity).toBe('Files');
    expect(enTypes.spreadsheet?.entity).toBe('Spreadsheets');
    expect(enTypes.worksheet?.entity).toBe('Worksheets');
    expect(enTypes.page?.entity).toBe('Articles');
    expect(enTypes.team?.entity).toBe('Teams');
    expect(enTypes.user?.entity).toBe('Users');
    expect(enTypes.dashboardDataModel?.entity).toBe('Dashboard Data Models');
    // The 8 singular items stay singular.
    expect(enTypes.apiCollection?.entity).toBe('API collection');
    expect(enTypes.apiEndpoint?.entity).toBe('API endpoint');
    expect(enTypes.dataProduct?.entity).toBe('Data product');
    expect(enTypes.database?.entity).toBe('Database');
    expect(enTypes.databaseSchema?.entity).toBe('Database schema');
    expect(enTypes.metric?.entity).toBe('Metric');
    expect(enTypes.glossaryTerm?.entity).toBe('Glossary term');
    expect(enTypes.domain?.entity).toBe('Domain');
  });
});
