// customPropertiesLayout.ts — CustomPropertyLayoutItem parsing and layout
// derivation.
//
// Port of parsePropertyLayout, applyPropertyLayout, toPropertyLayout and
// getTabDefaultWidth (components/common/CustomPropertyTable/
// CustomPropertiesWidget/CustomPropertiesWidget.utils.ts) and the
// CustomPropertyLayoutItem shape (CustomPropertiesWidget.interface.ts)
// at pin a3012259ca. The section fetches the entity's custom-property
// definitions and merges them with the stored layout, exactly as the
// official CustomPropertiesTabLayoutSection does.

import { getPropertyTypeBadge } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';

export type CustomPropertyLayoutWidth = 'half' | 'full';
export type CustomPropertyCardSize = 'small' | 'large';

export interface CustomPropertyLayoutItem {
  name: string;
  width: CustomPropertyLayoutWidth;
  size?: CustomPropertyCardSize;
}

/** A definition placed by the stored layout, with its resolved width. */
export interface LaidOutCustomProperty {
  property: CustomPropertyDef;
  width: CustomPropertyLayoutWidth;
  size?: CustomPropertyCardSize;
}

const WIDTHS: readonly string[] = ['half', 'full'];
const CARD_SIZES: readonly string[] = ['small', 'large'];

function isLayoutItem(value: unknown): value is CustomPropertyLayoutItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.width === 'string' &&
    WIDTHS.includes(item.width)
  );
}

export function parsePropertyLayout(propertyLayout: unknown): CustomPropertyLayoutItem[] {
  if (!Array.isArray(propertyLayout)) {
    return [];
  }
  return propertyLayout.filter(isLayoutItem).map(({ name, width, size }) =>
    size !== undefined && CARD_SIZES.includes(size) ? { name, width, size } : { name, width },
  );
}

/**
 * Official applyPropertyLayout: the stored layout orders the
 * definitions; definitions missing from the layout append at the end
 * with their default width. Layout entries for definitions that no
 * longer exist drop out (they match no property).
 */
export function applyPropertyLayout(
  properties: CustomPropertyDef[],
  propertyLayout: CustomPropertyLayoutItem[],
  getDefaultWidth: (property: CustomPropertyDef) => CustomPropertyLayoutWidth = getTabDefaultWidth,
): LaidOutCustomProperty[] {
  const position = new Map(propertyLayout.map((item, index) => [item.name, index]));
  const itemByName = new Map(propertyLayout.map((item) => [item.name, item]));
  const rank = (property: CustomPropertyDef): number =>
    position.get(property.name) ?? Number.MAX_SAFE_INTEGER;

  return [...properties]
    .sort((a, b) => rank(a) - rank(b))
    .map((property) => {
      const item = itemByName.get(property.name);
      return {
        property,
        width: item?.width ?? getDefaultWidth(property),
        ...(item?.size && { size: item.size }),
      };
    });
}

/** Official toPropertyLayout: the laid-out items back to a stored layout. */
export function toPropertyLayout(items: LaidOutCustomProperty[]): CustomPropertyLayoutItem[] {
  return items.map(({ property, width, size }) => ({
    name: property.name,
    width,
    ...(size && { size }),
  }));
}

/**
 * Official getTabDefaultWidth: wide property types (timeInterval,
 * table, sqlQuery, markdown — the `isWide` badge metadata) take the
 * full row, everything else half.
 */
export function getTabDefaultWidth(property: CustomPropertyDef): CustomPropertyLayoutWidth {
  return getPropertyTypeBadge(property.propertyType).isWide ? 'full' : 'half';
}
