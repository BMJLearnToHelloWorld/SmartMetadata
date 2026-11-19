// customPropertiesLayout.ts — CustomPropertyLayoutItem parsing.
//
// Port of parsePropertyLayout (components/common/CustomPropertyTable/
// CustomPropertiesWidget/CustomPropertiesWidget.utils.ts) and the
// CustomPropertyLayoutItem shape (CustomPropertiesWidget.interface.ts)
// at pin a3012259ca. The fetch-dependent parts (applyPropertyLayout,
// entity custom-property definitions) are NOT ported: editors never
// fetch, so the section arranges only the stored layout (see
// CustomPropertiesTabSection.vue).

export type CustomPropertyLayoutWidth = 'half' | 'full';
export type CustomPropertyCardSize = 'small' | 'large';

export interface CustomPropertyLayoutItem {
  name: string;
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
