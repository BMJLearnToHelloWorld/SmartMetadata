/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed } from 'vue';
import { NAV_ENTRIES, type NavEntry, type NavItem } from '@/layouts/nav';
import { useCustomPages } from './useCustomPages';

/**
 * Product equivalent of the official `useSidebarItems` hook
 * (`openmetadata-ui/src/main/resources/ui/src/hooks/useSidebarItems.ts`)
 * plus `filterHiddenNavigationItems`
 * (`utils/CustomizaNavigation/CustomizeNavigation.ts:316-338`): the
 * persona document's `navigation` array, read through the same
 * `useCustomPages('Navigation')` call the official hook makes, filtered
 * against the default sidebar item set.
 *
 * Official filter semantics, kept: an absent or empty navigation
 * renders the default item set; otherwise items render in the saved
 * order, hidden items and ids with no default item are dropped, and
 * children follow the same rules. Titles and icons always come from
 * the default entries — the saved `title` is never rendered, exactly
 * as the official enhancer spreads the base sidebar item. The product
 * has no application-plugin sidebar actions, so the official plugin
 * merge has no equivalent here; the default set is `NAV_ENTRIES`
 * itself, which stays the single definition of the default sidebar
 * (`layouts/nav.ts` is not modified by this batch).
 *
 * Two rendering adaptations for the single-level product menu: a saved
 * section with no surviving children renders as a plain item (an
 * official item without children renders as a single item, and an
 * empty submenu would be a dead row), and grandchildren are not
 * rendered (the product default tree is two levels deep, so the
 * navigation editor cannot produce deeper trees from it). Footer
 * actions (Settings/Logout) are not navigation items and never enter
 * the customizable map.
 */
interface BaseNavNode {
  key: string;
  titleKey: string;
  testId?: string;
  kind: 'item' | 'section';
}

function baseNavNodes(entries: readonly NavEntry[]): Map<string, BaseNavNode> {
  const nodes = new Map<string, BaseNavNode>();
  for (const entry of entries) {
    if (entry.kind === 'section') {
      nodes.set(entry.key, {
        key: entry.key,
        titleKey: entry.titleKey,
        testId: entry.testId,
        kind: 'section',
      });
      for (const item of entry.items) {
        nodes.set(item.key, {
          key: item.key,
          titleKey: item.titleKey,
          testId: item.testId,
          kind: 'item',
        });
      }
    } else if (entry.kind === 'item') {
      nodes.set(entry.key, {
        key: entry.key,
        titleKey: entry.titleKey,
        testId: entry.testId,
        kind: 'item',
      });
    }
  }
  return nodes;
}

interface SavedNavItem {
  id: string;
  isHidden: boolean;
  children: unknown;
}

function readSavedNavItem(value: unknown): SavedNavItem | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as { id?: unknown; isHidden?: unknown; children?: unknown };
  if (typeof record.id !== 'string' || !record.id) {
    return null;
  }
  return { id: record.id, isHidden: Boolean(record.isHidden), children: record.children };
}

function enhanceChildren(children: unknown, nodes: Map<string, BaseNavNode>): NavItem[] {
  if (!Array.isArray(children)) {
    return [];
  }
  const seen = new Set<string>();
  const items: NavItem[] = [];
  for (const child of children) {
    const saved = readSavedNavItem(child);
    if (!saved || saved.isHidden) {
      continue;
    }
    const base = nodes.get(saved.id);
    if (!base || seen.has(base.key)) {
      continue;
    }
    seen.add(base.key);
    items.push({ key: base.key, titleKey: base.titleKey, testId: base.testId });
  }
  return items;
}

function enhanceTopLevel(value: unknown, nodes: Map<string, BaseNavNode>): NavEntry | null {
  const saved = readSavedNavItem(value);
  if (!saved || saved.isHidden) {
    return null;
  }
  const base = nodes.get(saved.id);
  if (!base) {
    return null;
  }
  if (base.kind === 'section') {
    const items = enhanceChildren(saved.children, nodes);
    if (!items.length) {
      return { kind: 'item', key: base.key, titleKey: base.titleKey, testId: base.testId };
    }
    return { kind: 'section', key: base.key, titleKey: base.titleKey, testId: base.testId, items };
  }
  return { kind: 'item', key: base.key, titleKey: base.titleKey, testId: base.testId };
}

export function filterHiddenNavigationItems(
  navigation: unknown,
  baseEntries: readonly NavEntry[] = NAV_ENTRIES,
): NavEntry[] {
  if (!Array.isArray(navigation) || navigation.length === 0) {
    return [...baseEntries];
  }
  const nodes = baseNavNodes(baseEntries);
  const seen = new Set<string>();
  const entries: NavEntry[] = [];
  for (const item of navigation) {
    const enhanced = enhanceTopLevel(item, nodes);
    if (!enhanced || seen.has(enhanced.key)) {
      continue;
    }
    seen.add(enhanced.key);
    entries.push(enhanced);
  }
  return entries;
}

export function useSidebarItems() {
  const { navigation } = useCustomPages('Navigation');
  return computed(() => filterHiddenNavigationItems(navigation.value));
}
