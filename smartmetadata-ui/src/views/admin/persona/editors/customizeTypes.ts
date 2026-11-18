// customizeTypes.ts — shared types and equality helpers for the C-4 editors.
//
// Official sources (pin a3012259ca, openmetadata-ui/src/main/resources/ui/src):
// - WidgetConfig: components/Customization/CustomizablePage.interface.ts
//   (RGL Layout fields i/x/y/h/w/static/isDraggable + children? + config? + data?)
// - Tab: generated/system/ui/page.ts (Tab: id?/name?/displayName?/layout?/editable?)
// - compare(): utils/CustomizePage/CustomizePageDispatchUtils.ts via
//   fast-json-patch; dirty checks are `compare(a, b).length === 0`.

import type { PageTab, PersonaPage } from '@/types/persona';

/** A widget entry in a page/tab layout grid. Mirrors official WidgetConfig. */
export interface WidgetConfig {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
  isDraggable?: boolean;
  children?: WidgetConfig[];
  config?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A page tab as stored on PersonaPage.tabs. Mirrors official Tab. */
export interface CustomizeTab {
  id?: string;
  name?: string;
  displayName?: string;
  layout?: WidgetConfig[];
  editable?: boolean;
  [key: string]: unknown;
}

export function asCustomizeTab(tab: PageTab): CustomizeTab {
  return tab as unknown as CustomizeTab;
}

export function tabId(tab: CustomizeTab): string {
  return tab.id ?? tab.name ?? '';
}

export function tabLayout(tab: CustomizeTab): WidgetConfig[] {
  return Array.isArray(tab.layout) ? tab.layout : [];
}

/** A widget offered by the add-widget modal. Mirrors official CommonWidgetType. */
export interface CommonWidgetType {
  fullyQualifiedName: string;
  labelKey: string;
  gridSizes: string[];
}

/** Header-only projection of an official *DUMMY_DATA constant. */
export interface DummyEntityData {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
}

/**
 * Key-order-insensitive deep equality for JSON-shaped values, ignoring
 * keys whose value is `undefined` — the semantics lodash `isEqual` and
 * fast-json-patch `compare().length === 0` agree on for the document
 * shapes compared here (official uses both: isEqual for navigation and
 * app-layout, compare for page dirty checks). No lodash dependency in
 * the product; this follows the product's JSON deep-equality convention
 * (see admin/jsonPatch.ts).
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqualJson(item, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined);
  const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bRecord, key) &&
      deepEqualJson(aRecord[key], bRecord[key]),
  );
}

/** Equivalence of `compare(a, b).length === 0` for dirty checks. */
export function jsonPatchEmpty(a: unknown, b: unknown): boolean {
  return deepEqualJson(a, b);
}

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Placeholder page used when the store has no page for the pageFqn. */
export function placeholderPage(pageType: string): PersonaPage {
  return { pageType } as PersonaPage;
}

let uniqueCounter = 0;

/**
 * Module-local unique id, same contract as the landing editor's
 * `uniqueId` (landingPageEditor.ts) and lodash `uniqueId` used by
 * official CustomizeTabWidget (`uniqueId('custom')`, `uniqueId('FQN-')`).
 */
export function uniqueId(prefix = ''): string {
  uniqueCounter += 1;
  return `${prefix}${uniqueCounter}`;
}
