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

  it('lists entries in rendered (en-US) label order, localeCompare', () => {
    const enTypes = enUS.settings.customProperties.types as TypeLabels;
    const labels = CUSTOM_PROPERTY_TYPE_ENTRIES.map(
      (entry) => enTypes[entry.type]?.label ?? '',
    );
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});
