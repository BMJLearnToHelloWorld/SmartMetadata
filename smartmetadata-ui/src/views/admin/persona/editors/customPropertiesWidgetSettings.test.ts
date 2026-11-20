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
import type { CustomPropertyDef } from '@/types/collaboration';
import {
  applyPropertyLayoutOrder,
  getCustomPropertiesWidgetSettings,
  parsePropertyLayout,
  selectWidgetProperties,
  widgetVisibleProperties,
} from './customPropertiesWidgetSettings';

function def(name: string): CustomPropertyDef {
  return { name, displayName: name, propertyType: { name: 'string' } } as unknown as CustomPropertyDef;
}

describe('getCustomPropertiesWidgetSettings', () => {
  it('resolves to the official defaults when there is no config', () => {
    expect(getCustomPropertiesWidgetSettings(undefined)).toEqual({
      displayMode: 'default',
      propertyNames: [],
      showHeader: true,
      size: 'small',
      propertyLayout: [],
    });
    expect(getCustomPropertiesWidgetSettings({})).toEqual(
      getCustomPropertiesWidgetSettings(undefined),
    );
  });

  it('accepts each valid value and falls back per field on invalid ones', () => {
    expect(
      getCustomPropertiesWidgetSettings({
        displayMode: 'selected',
        propertyNames: ['b', 7, 'a'],
        showHeader: false,
        size: 'large',
        propertyLayout: [{ name: 'a', width: 'half' }],
      }),
    ).toEqual({
      displayMode: 'selected',
      propertyNames: ['b', 'a'],
      showHeader: false,
      size: 'large',
      propertyLayout: [{ name: 'a', width: 'half' }],
    });
    expect(
      getCustomPropertiesWidgetSettings({
        displayMode: 'everything',
        propertyNames: 'b',
        showHeader: 'yes',
        size: 'huge',
        propertyLayout: 'a',
      }),
    ).toEqual(getCustomPropertiesWidgetSettings(undefined));
  });

  it('parses property layouts, dropping malformed entries and sizes', () => {
    expect(
      parsePropertyLayout([
        { name: 'a', width: 'half', size: 'large' },
        { name: 'b', width: 'full', size: 'huge' },
        { name: 'c', width: 'wide' },
        { width: 'half' },
        'd',
      ]),
    ).toEqual([
      { name: 'a', width: 'half', size: 'large' },
      { name: 'b', width: 'full' },
    ]);
    expect(parsePropertyLayout(undefined)).toEqual([]);
    expect(parsePropertyLayout({})).toEqual([]);
  });
});

describe('selectWidgetProperties', () => {
  const defs = [def('a'), def('b'), def('c'), def('d'), def('e'), def('f'), def('g')];

  it('shows the first five by default', () => {
    const settings = getCustomPropertiesWidgetSettings(undefined);
    expect(selectWidgetProperties(defs, settings).map((d) => d.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('shows all for displayMode all', () => {
    const settings = getCustomPropertiesWidgetSettings({ displayMode: 'all' });
    expect(selectWidgetProperties(defs, settings)).toEqual(defs);
  });

  it('shows the named ones in selection order for displayMode selected', () => {
    const settings = getCustomPropertiesWidgetSettings({
      displayMode: 'selected',
      propertyNames: ['g', 'missing', 'a'],
    });
    expect(selectWidgetProperties(defs, settings).map((d) => d.name)).toEqual(['g', 'a']);
  });
});

describe('applyPropertyLayoutOrder', () => {
  it('orders by the layout, keeping unlisted properties at the end', () => {
    const defs = [def('a'), def('b'), def('c'), def('d')];
    const layout = parsePropertyLayout([
      { name: 'c', width: 'full' },
      { name: 'a', width: 'half' },
    ]);
    expect(applyPropertyLayoutOrder(defs, layout).map((d) => d.name)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
    expect(applyPropertyLayoutOrder(defs, []).map((d) => d.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('combines selection and ordering', () => {
    const defs = [def('a'), def('b'), def('c'), def('d'), def('e'), def('f')];
    const settings = getCustomPropertiesWidgetSettings({
      displayMode: 'selected',
      propertyNames: ['f', 'b', 'd'],
      propertyLayout: [{ name: 'd', width: 'full' }],
    });
    expect(widgetVisibleProperties(defs, settings).map((d) => d.name)).toEqual([
      'd',
      'f',
      'b',
    ]);
  });
});
