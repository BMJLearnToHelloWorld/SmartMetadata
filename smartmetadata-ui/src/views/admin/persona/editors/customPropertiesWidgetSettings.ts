/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { CustomPropertyDef } from '@/types/collaboration';

/**
 * Product port of the official Custom Properties widget settings
 * (`components/common/CustomPropertyTable/CustomPropertiesWidget/
 * CustomPropertiesWidget.utils.ts:102-121` +
 * `CustomPropertiesWidget.constants.ts:21-40`, pin a3012259ca):
 * the free-form `widget.config` of a Custom Properties widget read as
 * display settings, each field validated against its allow-list with
 * the official default as fallback. Layouts saved before the widget
 * was configurable carry none of these keys and resolve to the
 * defaults (first five properties, header shown, small).
 *
 * What the product table does with each field:
 * - `displayMode`/`propertyNames`: `selectWidgetProperties` filters
 *   the defs (default → first five, all → all, selected → the named
 *   ones in selection order, skipping since-deleted names).
 * - `showHeader`: false hides the panel's lead paragraph (the
 *   product header equivalent of the official widget header).
 * - `size`: 'large' renders the antd table at size "middle" instead
 *   of "small" (product mapping: the table has no card-size concept;
 *   recorded here, not silently dropped).
 * - `propertyLayout`: parsed and validated, then applied as an
 *   ordering (properties named in the layout come first in layout
 *   order, unlisted ones keep their relative order at the end —
 *   official `applyPropertyLayout`); the per-property `width`
 *   (half/full) has no table equivalent and is carried in the parsed
 *   items but not rendered.
 */

export type CustomPropertiesDisplayMode = 'default' | 'all' | 'selected';

export type CustomPropertyCardSize = 'small' | 'large';

export interface CustomPropertyLayoutItem {
  name: string;
  width: 'half' | 'full';
  size?: CustomPropertyCardSize;
}

export interface CustomPropertiesWidgetSettings {
  displayMode: CustomPropertiesDisplayMode;
  propertyNames: string[];
  showHeader: boolean;
  size: CustomPropertyCardSize;
  propertyLayout: CustomPropertyLayoutItem[];
}

export const CUSTOM_PROPERTIES_WIDGET_DEFAULT_LIMIT = 5;

export const CUSTOM_PROPERTIES_DISPLAY_MODES: readonly CustomPropertiesDisplayMode[] = [
  'default',
  'all',
  'selected',
];

const CARD_SIZES: readonly CustomPropertyCardSize[] = ['small', 'large'];

export const DEFAULT_CUSTOM_PROPERTIES_WIDGET_SETTINGS: CustomPropertiesWidgetSettings = {
  displayMode: 'default',
  propertyNames: [],
  showHeader: true,
  size: 'small',
  propertyLayout: [],
};

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T);
}

function isLayoutItem(item: unknown): item is CustomPropertyLayoutItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const candidate = item as { name?: unknown; width?: unknown };
  return (
    typeof candidate.name === 'string' &&
    (candidate.width === 'half' || candidate.width === 'full')
  );
}

/** Reads a stored property layout, dropping malformed entries and sizes. */
export function parsePropertyLayout(propertyLayout: unknown): CustomPropertyLayoutItem[] {
  if (!Array.isArray(propertyLayout)) {
    return [];
  }
  return propertyLayout.filter(isLayoutItem).map(({ name, width, size }) => {
    const item = size !== undefined && isOneOf(size, CARD_SIZES) ? { name, width, size } : { name, width };
    return item as CustomPropertyLayoutItem;
  });
}

/**
 * Reads the widget settings from a persona layout item's free-form
 * config. Unknown or malformed values fall back to the defaults, one
 * field at a time — never the whole config.
 */
export function getCustomPropertiesWidgetSettings(
  config?: Record<string, unknown> | null,
): CustomPropertiesWidgetSettings {
  const defaults = DEFAULT_CUSTOM_PROPERTIES_WIDGET_SETTINGS;
  const { displayMode, propertyNames, showHeader, size, propertyLayout } = config ?? {};
  return {
    displayMode: isOneOf(displayMode, CUSTOM_PROPERTIES_DISPLAY_MODES)
      ? displayMode
      : defaults.displayMode,
    propertyNames: Array.isArray(propertyNames)
      ? propertyNames.filter((name): name is string => typeof name === 'string')
      : defaults.propertyNames,
    showHeader: typeof showHeader === 'boolean' ? showHeader : defaults.showHeader,
    size: isOneOf(size, CARD_SIZES) ? size : defaults.size,
    propertyLayout: parsePropertyLayout(propertyLayout),
  };
}

/**
 * Official `selectWidgetProperties`: 'all' keeps every property,
 * 'selected' keeps the named ones in selection order (skipping
 * since-deleted names), anything else ('default') keeps the first
 * five. Operates on defs (`CustomPropertyDef`) rather than the
 * official `CustomProperty` — the `name` key is the same.
 */
export function selectWidgetProperties(
  properties: CustomPropertyDef[],
  { displayMode, propertyNames }: CustomPropertiesWidgetSettings,
): CustomPropertyDef[] {
  switch (displayMode) {
    case 'all':
      return properties;
    case 'selected': {
      const byName = new Map(properties.map((property) => [property.name, property]));
      return propertyNames
        .map((name) => byName.get(name))
        .filter((property): property is CustomPropertyDef => property !== undefined);
    }
    default:
      return properties.slice(0, CUSTOM_PROPERTIES_WIDGET_DEFAULT_LIMIT);
  }
}

/**
 * Official `applyPropertyLayout` (ordering half): properties named in
 * the layout come first in layout order; properties missing from the
 * layout (added after it was saved) keep their relative order at the
 * end. Widths are not applied — the product renders a table, not
 * cards — but the order is the layout's observable effect here.
 */
export function applyPropertyLayoutOrder(
  properties: CustomPropertyDef[],
  propertyLayout: CustomPropertyLayoutItem[],
): CustomPropertyDef[] {
  const position = new Map(propertyLayout.map((item, index) => [item.name, index]));
  const rank = (property: CustomPropertyDef): number =>
    position.get(property.name) ?? Number.MAX_SAFE_INTEGER;
  return [...properties].sort((a, b) => rank(a) - rank(b));
}

/** The defs a widget cell shows: selection, then layout ordering. */
export function widgetVisibleProperties(
  properties: CustomPropertyDef[],
  settings: CustomPropertiesWidgetSettings,
): CustomPropertyDef[] {
  return applyPropertyLayoutOrder(selectWidgetProperties(properties, settings), settings.propertyLayout);
}
