/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PersonaPage } from '@/types/persona';
import { getDefaultWidgetForTab } from '@/views/admin/persona/editors/customizePageData';
import type { WidgetConfig } from '@/views/admin/persona/editors/customizeTypes';

/**
 * Read-side widget-layout resolution for detail pages: the product
 * equivalent of the official `getLayoutFromCustomizedPage` +
 * `GenericProvider.getWidgetLayout` pair.
 *
 * Official sources (pin 392b3efd,
 * `openmetadata-ui/src/main/resources/ui/src/`):
 *
 * - `utils/CustomizePage/CustomizePageWidgetUtils.ts:145-162`
 *   (`getLayoutFromCustomizedPage`): no customized page or version view
 *   yields the default layout for the tab; a page with tabs yields the
 *   matching tab entry's `layout` (found by `id` only), or — when no tab
 *   is given — the first tab's layout with `[]` when it has none
 *   (`get(tabs.0.layout, [])`); a page without tabs yields the default
 *   layout. A tab entry that is not found yields `undefined`, and a
 *   found entry without a `layout` yields `undefined` too: neither
 *   silently presents a default.
 * - `components/Customization/GenericProvider/GenericProvider.tsx:56-62`
 *   (`getWidgetLayout`): a non-array resolution is coerced to `[]`, and
 *   `:205-209` recomputes it whenever `customizedPage`, the current tab,
 *   the page type, or the version-view flag changes.
 *
 * Two bounded adaptations, both forced by the product's stored shapes:
 *
 * - The `tabs` list is read only when it is an array. Official code
 *   relies on the typed `Page` shape; stored product documents are
 *   untyped JSON, so a present-but-non-array `tabs` is treated exactly
 *   like an absent one (the default layout), never dereferenced. Tab
 *   entries that are not objects are skipped by the same reasoning.
 * - The product `getDefaultWidgetForTab` takes a `string` tab id, so a
 *   missing tab is passed as `''`, which matches no page's
 *   `layoutAppliesTo` entry and yields `[]`. Official
 *   `getDefaultLayout(tab?)` treats a falsy tab as the page's primary
 *   tab (`if (tab && tab !== PRIMARY) return []`, e.g.
 *   `utils/TableClassBase.ts:142-145`); the product lookup has no such
 *   branch, so the undefined-tab default differs from official. Callers
 *   must pass their active tab id (detail views always have one); the
 *   divergence is recorded as a residual on the shared default lookup,
 *   not papered over here.
 *
 * Mount-narrowing combination semantics (M-1, recorded bounded
 * adaptation): officially `GenericTab` always mounts on a mount tab —
 * a missing mount entry resolves to `undefined` and coerces to `[]`
 * (empty grid), and an empty/absent `tabs` list renders the default
 * widget grid. The product mount gate requires an entry to exist; a
 * missing entry or no page renders the pre-existing default pane, not
 * the default grid — so the default branch of
 * `getLayoutFromCustomizedPage` is unreachable in view composition
 * (unit tests alone reach it). "An empty layout renders an empty grid,
 * with no fallback" must not be read as full coverage.
 */

function tabEntryId(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function tabEntryLayout(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) {
    return undefined;
  }
  return (entry as { layout?: unknown }).layout;
}

/**
 * Official `getLayoutFromCustomizedPage`, verbatim in structure: the
 * result is `unknown` on purpose — a stored layout that is not an
 * array (or a missing tab, or a tab without a layout) is returned
 * as-is so `resolveWidgetLayout` can apply the official non-array
 * coercion instead of this function inventing a default.
 */
export function getLayoutFromCustomizedPage(
  pageType: string,
  tabId: string | undefined,
  customizedPage: PersonaPage | null | undefined,
  isVersionView = false,
): unknown {
  if (!customizedPage || isVersionView) {
    return getDefaultWidgetForTab(pageType, tabId ?? '');
  }
  const tabs = customizedPage.tabs;
  if (Array.isArray(tabs) && tabs.length > 0) {
    if (tabId) {
      return tabEntryLayout(tabs.find((entry) => tabEntryId(entry) === tabId));
    }
    const firstLayout = tabEntryLayout(tabs[0]);
    return firstLayout === undefined ? [] : firstLayout;
  }
  return getDefaultWidgetForTab(pageType, tabId ?? '');
}

const GRID_COLUMNS = 8;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * LeftPanel children are flow units, not grid columns (`w: 0.5` is
 * legal), so children are only filtered — never geometry-clamped. A
 * non-array `children` value normalizes to `[]`; a clean array keeps
 * its identity.
 */
function sanitizeChildren(children: unknown): WidgetConfig[] | undefined {
  if (children === undefined) {
    return undefined;
  }
  if (!Array.isArray(children)) {
    return [];
  }
  let changed = false;
  const kept: WidgetConfig[] = [];
  for (const child of children) {
    if (
      typeof child !== 'object' ||
      child === null ||
      typeof (child as { i?: unknown }).i !== 'string'
    ) {
      changed = true;
      continue;
    }
    kept.push(child as WidgetConfig);
  }
  return changed ? kept : (children as WidgetConfig[]);
}

/**
 * One top-level grid entry: dropped when it is not an object or has no
 * string `i`; otherwise its geometry is clamped to the 8-column grid
 * (`x` in [0, 7], `w` in [1, 8 - x], fractions preserved — the
 * floor/ceil rounding stays solely in `GenericTab`) and non-finite
 * `h`/`y` fall back to 1/0. A clean entry keeps its identity; a fixed
 * entry is a spread copy, so the stored layout is never mutated.
 * Official `GenericTab` is equally fragile on null entries (it reads
 * `widget.i` unguarded), so this is a robustness hardening of the
 * stored-JSON read path, not an official deviation.
 */
function sanitizeEntry(entry: unknown): WidgetConfig | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const candidate = entry as WidgetConfig;
  if (typeof candidate.i !== 'string') {
    return null;
  }
  const x = Math.min(Math.max(finiteOr(candidate.x, 0), 0), GRID_COLUMNS - 1);
  const w = Math.min(Math.max(finiteOr(candidate.w, 1), 1), GRID_COLUMNS - x);
  const h = finiteOr(candidate.h, 1);
  const y = finiteOr(candidate.y, 0);
  const children = sanitizeChildren(candidate.children);
  if (
    x === candidate.x &&
    w === candidate.w &&
    h === candidate.h &&
    y === candidate.y &&
    children === candidate.children
  ) {
    return candidate;
  }
  return { ...candidate, x, y, w, h, children };
}

function sanitizeLayout(layout: unknown[]): WidgetConfig[] {
  let changed = false;
  const kept: WidgetConfig[] = [];
  for (const entry of layout) {
    const sanitized = sanitizeEntry(entry);
    if (sanitized === null) {
      changed = true;
      continue;
    }
    if (sanitized !== entry) {
      changed = true;
    }
    kept.push(sanitized);
  }
  return changed ? kept : (layout as WidgetConfig[]);
}

/**
 * Official `GenericProvider.getWidgetLayout`: the resolved layout when
 * it is an array, otherwise `[]`. This is the D4-safe coercion — a
 * missing tab, a missing layout, or a non-array stored layout renders
 * an empty grid, never a default layout. Array layouts additionally
 * pass through entry sanitization (dropped malformed entries, clamped
 * geometry); clean layouts keep their array identity.
 */
export function resolveWidgetLayout(
  pageType: string,
  tabId: string | undefined,
  customizedPage: PersonaPage | null | undefined,
  isVersionView?: boolean,
): WidgetConfig[] {
  const layout = getLayoutFromCustomizedPage(pageType, tabId, customizedPage, isVersionView);
  return Array.isArray(layout) ? sanitizeLayout(layout) : [];
}
