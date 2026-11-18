/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue';
import { usePersonaStore } from '@/stores/persona';
import type { PersonaPage } from '@/types/persona';
import { getPersonaPage } from '@/views/admin/personaPage';

/**
 * Product equivalent of the official `useCustomPages` hook
 * (`openmetadata-ui/src/main/resources/ui/src/hooks/useCustomPages.ts`):
 * the selected persona's customized page for a `pageType`, plus the
 * document's `navigation` array, read from the same document the
 * customize editors write.
 *
 * U-09 equivalence (C-4 spec §8, S-C4STORE decision §4): the product
 * has no query-key cache, so the shared cache slot is the persona
 * store's single `document` slot, and saves land on it through the
 * store's FQN-gated `syncSavedDocument` (normalize + write only when
 * the saved document's FQN equals the selected persona's document
 * FQN). Every consumer below reads that same reactive slot plus
 * `getPersonaPage` and builds no separate document-fetch chain, so a
 * save updates all consumers without a refetch — the store-sync form
 * of the official `docStoreQueryKey` slot
 * (`rest/queries/docStoreQuery.ts:20-41`). Known non-equivalence,
 * recorded by the storage flow: no 5-minute stale window and no
 * React Query dedup/background refetch; closure is the §6.2 item 7
 * live check. The load trigger here mirrors the marketplace reader:
 * personas first, then the document, skipped when already loaded or
 * loading; it uses the store's own `loadDocument()` (global selected
 * scope), not a new fetch chain.
 *
 * Error semantics: the store exposes no load-error state (a failed
 * read leaves `document` null, exactly like a 404), so the official
 * error branch (`navigation: []`, `useCustomPages.ts`) cannot be told
 * apart from "no document" here — both yield `null`. The outcomes
 * coincide for the only `navigation` consumer, the sidebar: the
 * official filter returns the default item set for both `[]` and
 * `null` (`CustomizeNavigation.ts:316-338`), and the store's
 * null-on-error likewise yields defaults, with no stale document
 * retained. See `useSidebarItems.ts`.
 */
export interface PersonaNavigationItem {
  children?: PersonaNavigationItem[];
  id: string;
  isHidden?: boolean;
  pageId: string;
  title: string;
}

/**
 * Product entity-type strings to official `PageType` values, mirroring
 * `ENTITY_PAGE_TYPE_MAP` (`constants/Customize.constants.ts:105-130`).
 * The official map has no Classification entry and the product adds
 * none: Classification has no consumption call officially (C-4 spec
 * §1.7, data retention only). `query` likewise has no PageType.
 * Directory/file/spreadsheet/worksheet are mapped for completeness —
 * the product has no detail views for them (residual R-C4-DRIVE, C-4
 * spec §6.4), so the mapping alone renders nothing.
 */
export const ENTITY_TYPE_PAGE_TYPE_MAP: Record<string, string> = {
  table: 'Table',
  topic: 'Topic',
  storedProcedure: 'StoredProcedure',
  dashboardDataModel: 'DashboardDataModel',
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  databaseSchema: 'DatabaseSchema',
  database: 'Database',
  container: 'Container',
  searchIndex: 'SearchIndex',
  metric: 'Metric',
  mlmodel: 'MlModel',
  apiEndpoint: 'APIEndpoint',
  apiCollection: 'APICollection',
  chart: 'Chart',
  directory: 'Directory',
  file: 'File',
  spreadsheet: 'Spreadsheet',
  worksheet: 'Worksheet',
  domain: 'Domain',
  dataProduct: 'DataProduct',
  glossary: 'Glossary',
  glossaryTerm: 'GlossaryTerm',
  tag: 'Tag',
};

export function pageTypeForEntityType(entityType: string): string | undefined {
  return ENTITY_TYPE_PAGE_TYPE_MAP[entityType];
}

export function useCustomPages(pageType: MaybeRefOrGetter<string | null | undefined>) {
  const store = usePersonaStore();

  // The document is the shared slot: make sure it is loading, exactly
  // once per persona, the way the marketplace reader does. The store
  // swallows load failures internally; the catch only guards the
  // trigger itself against an unexpected rejection.
  void (async () => {
    try {
      await store.ensureLoaded();
      if (store.selectedPersona && !store.documentLoaded && !store.documentLoading) {
        await store.loadDocument();
      }
    } catch {
      // No persona document: consumers render their defaults.
    }
  })();

  // Official `hasMounted`: entity pages show their loader on the first
  // paint only, then update in place when the document arrives
  // (`useCustomPages.ts`, `isLoading: !hasMounted`). Product detail
  // views keep their own loaders; this flag exists so a consumer that
  // needs the official first-paint signal has it.
  const hasMounted = ref(false);
  onMounted(() => {
    hasMounted.value = true;
  });

  const customizedPage = computed<PersonaPage | null>(
    () => getPersonaPage(store.document, toValue(pageType)) ?? null,
  );
  const navigation = computed<PersonaNavigationItem[] | null>(() => {
    const raw = store.document?.data?.navigation;
    return Array.isArray(raw) ? (raw as PersonaNavigationItem[]) : null;
  });
  const isLoading = computed(() => !hasMounted.value);

  return { customizedPage, navigation, isLoading };
}

/**
 * Official tab ids to product tab keys, consulted only when the id does
 * not match a rendered tab key exactly. Each entry is one concept under
 * two spellings, or the product tab that renders the official tab's
 * content: `activity_feed`/`custom_properties` are the EntityTabs
 * spellings of the camelCase product keys; `subdomains` is the
 * EntityTabs spelling of the Domain view's `subDomains`; `documentation`
 * is the Domain/DataProduct first tab, rendered by the product
 * `overview` tab; `details` is the Chart first tab, rendered by the
 * fallback `overview` tab (split views match `details` exactly, so the
 * alias never fires there); `relations_graph` is the Glossary
 * relations pane; `apiEndpoint` is the endpoints tab of both API
 * views, whose keys differ (`apiEndpoints` on the collection view,
 * `endpoint` on the endpoint view) — the first candidate present in
 * the rendered tabs wins.
 */
export const CUSTOMIZED_TAB_KEY_ALIASES: Record<string, readonly string[]> = {
  activity_feed: ['activity'],
  custom_properties: ['customProperties'],
  subdomains: ['subDomains'],
  documentation: ['overview'],
  details: ['overview'],
  relations_graph: ['relations'],
  apiEndpoint: ['apiEndpoints', 'endpoint'],
};

function readCustomizedTabIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id === 'string' && id) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Official `getTabLabelMapFromTabs`
 * (`utils/CustomizePage/CustomizePageEntityTabUtils.ts:91-107`): tab id
 * to `displayName`, for entries that carry both. The label map is what
 * renames rendered tabs; entries without a displayName keep the
 * default label.
 */
export function getTabLabelMapFromTabs(tabs: unknown): Record<string, string> {
  const labelMap: Record<string, string> = {};
  if (!Array.isArray(tabs)) {
    return labelMap;
  }
  for (const entry of tabs) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { id, displayName } = entry as { id?: unknown; displayName?: unknown };
    if (typeof id === 'string' && id && typeof displayName === 'string' && displayName) {
      labelMap[id] = displayName;
    }
  }
  return labelMap;
}

function resolveTabKey(
  id: string,
  renderedKeys: ReadonlySet<string>,
  aliases: Record<string, readonly string[]>,
): string | undefined {
  if (renderedKeys.has(id)) {
    return id;
  }
  for (const candidate of aliases[id] ?? []) {
    if (renderedKeys.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Official `getDetailsTabWithNewLabel`
 * (`utils/CustomizePage/CustomizePageEntityTabUtils.ts:51-76`): the
 * customized tabs replace the default tab list, in the customized
 * order, with `displayName` labels. Two bounded adaptations, both
 * forced by the product's tab model:
 *
 * - Unknown ids are dropped instead of synthesized with the overview
 *   tab's children: the product shell renders tab content from slots
 *   named by tab key, so a foreign key has no content to render. The
 *   editor writes official tab ids for the page type, which resolve
 *   through exact matches and `CUSTOMIZED_TAB_KEY_ALIASES`.
 * - `preserveUnlisted` keeps rendered tabs the customized list does
 *   not mention, appended in default order. Product tab sets carry
 *   tabs with no official id (`overview` on API/chart/pipeline views,
 *   `quality`, `endpoint`, `status`, `assets`, `relations`); the
 *   official replacement would silently remove those surfaces the
 *   moment any customization exists. All product call sites pass
 *   `preserveUnlisted: true` until the editor's tab model covers the
 *   product tabs; the default (`false`) is the official replacement,
 *   kept and tested so a later batch can adopt it per view.
 *
 * An absent tab list leaves the defaults untouched, and so does a
 * present but non-array one — exactly as officially, where
 * `customizedTabs?.map(...) ?? defaultTabs` yields defaults for any
 * value without `.map`. That is not a §4.4 D4 violation: D4 governs
 * `layout` fields, and the detail `tabs` list is not one. The
 * `layout` fields themselves (page and per-tab widget layouts) have
 * no product consumer on detail pages yet, so no default layout is
 * ever silently presented for them here; D4 handling for those
 * fields belongs to the future widget-layout renderer (residual).
 * An empty array under replacement yields no tabs, as officially. A
 * version view always renders defaults (official `isVersionView`
 * branch); product detail views are never version views.
 */
export function getDetailsTabWithNewLabel<T extends { key: string; label: string }>(
  defaultTabs: readonly T[],
  customizedTabs: unknown,
  options: {
    isVersionView?: boolean;
    preserveUnlisted?: boolean;
    keyAliases?: Record<string, readonly string[]>;
  } = {},
): T[] {
  if (options.isVersionView) {
    return [...defaultTabs];
  }
  const ids = readCustomizedTabIds(customizedTabs);
  if (ids === undefined) {
    return [...defaultTabs];
  }
  const labelMap = getTabLabelMapFromTabs(customizedTabs);
  const byKey = new Map(defaultTabs.map((tab) => [tab.key, tab]));
  const renderedKeys = new Set(byKey.keys());
  const aliases = options.keyAliases ?? CUSTOMIZED_TAB_KEY_ALIASES;
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of ids) {
    const key = resolveTabKey(id, renderedKeys, aliases);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const tab = byKey.get(key) as T;
    const label = labelMap[id];
    ordered.push(label ? { ...tab, label } : tab);
  }
  if (options.preserveUnlisted) {
    for (const tab of defaultTabs) {
      if (!seen.has(tab.key)) {
        ordered.push(tab);
      }
    }
  }
  return ordered;
}

/**
 * Official `getRenderedActiveTab`
 * (`utils/CustomizePage/CustomizePageEntityTabUtils.ts:79-88`): the
 * selected tab when it is in the rendered list, else the first
 * rendered tab. The official fallback constant (overview) is omitted:
 * with no rendered tabs there is no tab to select, so the result is
 * the empty string the product shell already treats as "no tab".
 */
export function getRenderedActiveTab(
  tabs: readonly { key: string }[] | undefined,
  selectedTab: string | undefined,
): string {
  if (selectedTab && tabs?.some((tab) => tab.key === selectedTab)) {
    return selectedTab;
  }
  return tabs?.[0]?.key ?? '';
}
