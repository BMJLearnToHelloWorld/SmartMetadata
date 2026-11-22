// customizePageData.ts — dispatch functions for the C-4 detail/special editors.
//
// Ports of utils/CustomizePage/CustomizePageDispatchUtils.ts
// (getDefaultTabs, getDefaultWidgetForTab, getCustomizableWidgetByPage,
// getDummyDataByPage, getWidgetHeight, getTabDisplayName) and
// utils/CustomizePage/CustomizeDetailPage.interface.ts
// (PageTypeToEntityTypeMap, WidgetWidths, DetailPageWidgetKeys) at pin
// a3012259ca. Data tables live in pageDataTables.ts (mechanical
// extraction); this file holds only the dispatch behavior.
//
// Dispatch semantics preserved verbatim, including the unknown-pageType
// branches: getDefaultTabs returns a single CUSTOM_PROPERTIES tab,
// getDefaultWidgetForTab / getCustomizableWidgetByPage return [],
// getDummyDataByPage returns {}.
//
// Glossary/GlossaryTerm dispatch is split in official code across two
// class bases (CustomizeGlossaryPage for Glossary tabs/layouts, and
// CustomizeGlossaryTermBaseClass for GlossaryTerm + the shared
// getCommonWidgetList(isGlossary)); the tables encode the merged result.

import { PAGE_DATA_TABLES, TAB_LABEL_MAP } from './pageDataTables';
import type {
  CommonWidgetType,
  CustomizeTab,
  DummyEntityData,
  WidgetConfig,
} from './customizeTypes';
import { cloneJson } from './customizeTypes';

export const TAB_GRID_MAX_COLUMNS = 8;
export const GRID_ROW_HEIGHT = 100;
export const GRID_VERTICAL_MARGIN = 16;
export const MARKETPLACE_ROW_HEIGHT = 170;

/** Official WidgetWidths (enums/CustomizablePage.enum.ts). */
export const WidgetWidths: Record<string, number> = {
  large: 3,
  medium: 2,
  small: 1,
};

/** Official DetailPageWidgetKeys subset used by the editors. */
export const DetailPageWidgetKeys = {
  LEFT_PANEL: 'KnowledgePanel.LeftPanel',
  HEADER: 'KnowledgePanel.Header',
  DESCRIPTION: 'KnowledgePanel.Description',
  TAGS: 'KnowledgePanel.Tags',
  DOMAIN: 'KnowledgePanel.Domain',
  CUSTOM_PROPERTIES: 'KnowledgePanel.CustomProperties',
  // LandingPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER
  // (enums/CustomizablePage.enum.ts) — note the ExtraWidget prefix.
  EMPTY_WIDGET_PLACEHOLDER: 'ExtraWidget.EmptyWidgetPlaceholder',
} as const;

export const EMPTY_WIDGET_PLACEHOLDER = DetailPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER;

/**
 * Official DETAILS_PAGE_TYPES (enums/CustomizablePage.enum.ts), hand-written
 * order in the spec §1.4. Tag/Classification/LandingPage/DataMarketplace
 * and the governance four are excluded here by design.
 */
export const DETAILS_PAGE_TYPES = [
  'Table',
  'Topic',
  'StoredProcedure',
  'DashboardDataModel',
  'Dashboard',
  'Pipeline',
  'DatabaseSchema',
  'Database',
  'Container',
  'SearchIndex',
  'Metric',
  'MlModel',
  'APIEndpoint',
  'APICollection',
  'Chart',
  'Directory',
  'File',
  'Spreadsheet',
  'Worksheet',
] as const;

/** Official PageTypeToEntityTypeMap (CustomizeDetailPage.interface.ts). */
export const PageTypeToEntityTypeMap: Record<string, string> = {
  LandingPage: 'ALL',
  Table: 'TABLE',
  Topic: 'TOPIC',
  Dashboard: 'DASHBOARD',
  DashboardDataModel: 'DASHBOARD_DATA_MODEL',
  Pipeline: 'PIPELINE',
  MlModel: 'MLMODEL',
  Container: 'CONTAINER',
  SearchIndex: 'SEARCH_INDEX',
  StoredProcedure: 'STORED_PROCEDURE',
  Database: 'DATABASE',
  DatabaseSchema: 'DATABASE_SCHEMA',
  Glossary: 'GLOSSARY',
  GlossaryTerm: 'GLOSSARY_TERM',
  DataProduct: 'DATA_PRODUCT',
  Domain: 'DOMAIN',
  Metric: 'METRIC',
  APICollection: 'API_COLLECTION',
  APIEndpoint: 'API_ENDPOINT',
  Chart: 'CHART',
  Directory: 'DIRECTORY',
  File: 'FILE',
  Spreadsheet: 'SPREADSHEET',
  Worksheet: 'WORKSHEET',
};

export function getWidgetHeight(pageType: string, widgetName: string): number {
  const table = PAGE_DATA_TABLES[pageType];
  if (!table) {
    return 1;
  }
  const mapped = table.heightMap[widgetName];
  return mapped ?? table.heightFallback;
}

/**
 * Default tabs for a page type. Official stores `displayName` as the
 * RESOLVED label (`i18n.t(TAB_LABEL_MAP[...])`, see
 * getGlossaryDefaultTabs/getGlossaryTermDefaultTabs); the optional
 * `resolveLabel` reproduces that. Without a resolver the label key is
 * stored (data-only use, e.g. tests). Table's TabsIds entries carry no
 * displayName — the absence is preserved verbatim. The unknown-type
 * fallback is official's verbatim: a single custom_properties tab
 * WITH displayName and the GlossaryTerm custom_properties layout
 * (which is []), and NO editable key.
 */
export function getDefaultTabs(
  pageType: string,
  resolveLabel?: (tabId: string, labelKey: string) => string,
): CustomizeTab[] {
  const table = PAGE_DATA_TABLES[pageType];
  if (!table || !table.tabs) {
    const labelKey = TAB_LABEL_MAP.custom_properties;
    return [
      {
        id: 'custom_properties',
        name: 'custom_properties',
        displayName: resolveLabel
          ? resolveLabel('custom_properties', labelKey)
          : labelKey,
        layout: getDefaultWidgetForTab('GlossaryTerm', 'custom_properties'),
      },
    ];
  }
  return table.tabs.map((tab) => {
    const labelKey = TAB_LABEL_MAP[tab.id];
    return {
      id: tab.id,
      name: tab.id,
      ...(tab.displayLabelKey && labelKey
        ? { displayName: resolveLabel ? resolveLabel(tab.id, labelKey) : labelKey }
        : {}),
      editable: tab.editable,
      layout: getDefaultWidgetForTab(pageType, tab.id),
    };
  });
}

/**
 * Default widget layout for one tab; [] when the tab has no default.
 * A per-tab entry (`defaultLayoutByTab`) wins over the shared
 * `defaultLayout`: official `getDefaultLayout(tab)` is tab-sensitive,
 * and Container is the page type where that matters — CHILDREN gets
 * the single CONTAINER_CHILDREN widget, SCHEMA the LeftPanel layout
 * (`utils/ContainerDetailsClassBase.ts:115-204`, pin 392b3efd). This
 * lookup is shared by the editor (`getDefaultTabs` initial tab
 * layouts, `CustomizeTabWidget` preview) and the read-side default
 * (`customizeWidgetLayout`), so the correction lands on both paths
 * at once; neither path may bypass it with the raw table.
 *
 * A falsy tab yields the page's shared `defaultLayout`, as official
 * `getDefaultLayout(tab?)` does (`if (tab && tab !== PRIMARY) return
 * []`, e.g. `utils/TableClassBase.ts:142-145` — falsy means the primary
 * tab's layout). The shared layout IS the primary-tab layout: Table's
 * is the SCHEMA layout, and Container's is the SCHEMA layout too
 * (its `defaultLayoutByTab` holds only the CHILDREN override, pin
 * `ContainerDetailsClassBase.ts:115-131` falls through to SCHEMA for a
 * falsy tab). A non-empty tab outside `layoutAppliesTo` still yields
 * `[]`, and an unknown page type yields `[]`.
 */
export function getDefaultWidgetForTab(pageType: string, tab: string): WidgetConfig[] {
  const table = PAGE_DATA_TABLES[pageType];
  if (!table) {
    return [];
  }
  if (!tab) {
    return cloneJson(table.defaultLayout) as WidgetConfig[];
  }
  if (!table.layoutAppliesTo.includes(tab)) {
    return [];
  }
  return cloneJson(table.defaultLayoutByTab?.[tab] ?? table.defaultLayout) as WidgetConfig[];
}

/**
 * Whether the official detail page mounts its widget grid (`GenericTab`)
 * on this tab. Officially each page type mounts the grid on exactly one
 * tab (Container: two) — the tab whose `getDefaultLayout` is non-trivial
 * — and every other tab renders fixed children, so a stored layout on a
 * non-mount tab is never rendered (verified by `<GenericTab` mount grep
 * at pin 392b3efd: one mount per `*Utils.tsx` tab builder, e.g.
 * Table SCHEMA, Glossary TERMS, Container CHILDREN + SCHEMA, Metric
 * OVERVIEW). The 25 official mount points (24 page types; Container
 * mounts twice) all fall inside `layoutAppliesTo`; `layoutAppliesTo`
 * additionally carries DataMarketplace/overview, which has no official
 * GenericTab mount (the marketplace walks its own chain), and the two
 * Container mounts are mutually exclusive (see `widgetLayoutFor` in
 * AssetDetailView.vue). No view consults this gate with DataMarketplace,
 * so the extra entry has zero runtime effect. Read-side activation must
 * consult this: mounting a grid on any resolved tab entry would blank
 * every non-primary tab of any editor-saved page, because the editor
 * saves all tabs with `layout: []` on the non-editable ones.
 */
export function isWidgetLayoutTab(pageType: string, tabId: string): boolean {
  const table = PAGE_DATA_TABLES[pageType];
  return table ? table.layoutAppliesTo.includes(tabId) : false;
}

/**
 * Batch 6 mount-gate convergence: (pageType, tabId) pairs whose mount
 * gate is unconditional — the widget grid mounts with the default
 * layout when no customized page exists, instead of the legacy
 * default pane. A tab is listed here only when its widgets are all
 * ready and its default-panel equivalence is verified against pin
 * source for that tab. One tab at a time; never flip a whole page
 * type at once. Pin: officially GenericTab always mounts on a mount
 * tab (GenericProvider getWidgetLayout + getLayoutFromCustomizedPage
 * default branch); the product mount gate used to require a
 * customized tab entry, rendering the pre-existing default pane
 * instead — this table retires that gate, tab by tab.
 */
export const UNCONDITIONAL_MOUNT_TABS: Record<string, readonly string[]> = {
  DataProduct: ['documentation'],
  Domain: ['documentation'],
  Glossary: ['terms'],
  GlossaryTerm: ['overview'],
};

export function isUnconditionalMountTab(pageType: string, tabId: string): boolean {
  return UNCONDITIONAL_MOUNT_TABS[pageType]?.includes(tabId) ?? false;
}

export function getCustomizableWidgetByPage(pageType: string): CommonWidgetType[] {
  const table = PAGE_DATA_TABLES[pageType];
  if (!table) {
    return [];
  }
  return table.widgets.map((widget) => ({
    fullyQualifiedName: widget.fqn,
    labelKey: widget.labelKey,
    gridSizes: [...widget.gridSizes],
  }));
}

export function getDummyDataByPage(pageType: string): DummyEntityData {
  const table = PAGE_DATA_TABLES[pageType];
  if (!table) {
    return {};
  }
  return { ...table.dummy } as DummyEntityData;
}

/**
 * Official getTabDisplayName: `displayName ?? labelFromId(name)` —
 * the lookup key is the tab NAME, not the id: a custom tab carries
 * the user-typed name and an generated `custom*` id, and renders its
 * name (getTabLabelFromId falls back to its input when unmapped).
 * The label key is returned (not a translated string); callers
 * resolve it against product i18n and fall back to the raw tab id
 * when no product key exists (missing keys are listed in the notes).
 */
export function getTabDisplayName(tab: CustomizeTab): string {
  if (tab.displayName) {
    return tab.displayName;
  }
  const name = tab.name ?? tab.id ?? '';
  return TAB_LABEL_MAP[name] ?? name;
}

/** Label key for a tab id, or the raw id when unmapped. */
export function getTabLabelKey(tabId: string): string {
  return TAB_LABEL_MAP[tabId] ?? tabId;
}

/** Whether a tab is the Custom Properties tab (special section). */
export function isCustomPropertiesTab(tab: CustomizeTab): boolean {
  return (tab.id ?? tab.name) === 'custom_properties';
}
