/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  PageViewMode,
  PersonaAppLayoutPreferences,
  PersonaDocument,
  PersonaPage,
  PersonaPreferences,
  ViewModePage,
} from '@/types/persona';
import { startCase } from '@/utils/text';

/**
 * Pure persona-document helpers, mirroring the official
 * utils/CustomizePage/PersonaPage.utils.ts. No network, no store: every
 * function is unit-testable on plain document objects.
 */

export type { PersonaPage };

const isPersonaPage = (value: unknown): value is PersonaPage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { pageType?: unknown }).pageType === 'string';

function pageEntries(document: PersonaDocument | null | undefined): unknown[] | undefined {
  const pages = document?.data?.pages as unknown;
  return Array.isArray(pages) ? pages : undefined;
}

export function getPersonaPage(
  document: PersonaDocument | null | undefined,
  pageType: string | null | undefined,
): PersonaPage | undefined {
  if (!pageType) {
    return undefined;
  }
  return pageEntries(document)?.find(
    (page): page is PersonaPage => isPersonaPage(page) && page.pageType === pageType,
  );
}

/** Drops page entries without a string pageType, as the official normalizer does. */
export function normalizePersonaDocument(document: PersonaDocument): PersonaDocument {
  const entries = pageEntries(document);
  if (!entries) {
    return document;
  }
  const pages = entries.filter(isPersonaPage);
  if (pages.length === entries.length) {
    return document;
  }
  return { ...document, data: { ...document.data, pages } };
}

/**
 * Upserts (newPage given) or removes (newPage omitted) the page of a
 * pageType. Removing a page that is absent and has no invalid siblings
 * is a no-op returning the same document, as official does.
 */
export function updatePersonaDocumentPage(
  document: PersonaDocument,
  pageType: string,
  newPage?: PersonaPage,
): PersonaDocument {
  const entries = pageEntries(document);
  const pages = entries?.filter(isPersonaPage) ?? [];
  const hasPage = pages.some((page) => page.pageType === pageType);
  const hasInvalidPage = entries !== undefined && entries.length !== pages.length;
  if (!newPage && !hasPage && !hasInvalidPage) {
    return document;
  }
  let updatedPages: PersonaPage[];
  if (!newPage) {
    updatedPages = pages.filter((page) => page.pageType !== pageType);
  } else if (hasPage) {
    updatedPages = pages.map((page) => (page.pageType === pageType ? newPage : page));
  } else {
    updatedPages = [...pages, newPage];
  }
  return { ...document, data: { ...document.data, pages: updatedPages } };
}

export function getPersonaPreferences(
  document: PersonaDocument | null | undefined,
  personaId: string | undefined,
): PersonaPreferences | undefined {
  return document?.data?.personaPreferences?.find((entry) => entry.personaId === personaId);
}

/**
 * Stage D (G-11): the same lookup on the per-user array. The two
 * arrays must never be confused: `personaPreferences` holds the
 * persona admin's choices, `personPreferences` holds a single user's
 * own choices for the persona (today: the landing-page header colour).
 */
export function getPersonPreferences(
  document: PersonaDocument | null | undefined,
  personaId: string | undefined,
): PersonaPreferences | undefined {
  return document?.data?.personPreferences?.find((entry) => entry.personaId === personaId);
}

/**
 * Options for the header-colour branch condition. The official
 * `handleBackgroundColorUpdate` branches on `document.id` and the
 * stored array length — not on whether this persona already has an
 * entry — so the caller supplies the persisted document id. The
 * branch lives in this helper (not inlined in the parent callback):
 * the parent callback passes `{ documentId: doc.id }` and assigns the
 * returned array.
 */
export interface UpdatePersonPreferencesOptions {
  documentId?: string | null;
}

/**
 * Stage D (G-11), C-4 §3.3 callback 3 (RB-7): writes the user's own
 * header-colour choice for a persona into `personPreferences`,
 * mirroring the official `handleBackgroundColorUpdate` branch for
 * branch — quirks included:
 *
 * - Persisted document (`documentId` set) with a non-empty array:
 *   map only. An entry for this persona is updated in place; entries
 *   for other personas are returned unchanged; when no entry matches,
 *   nothing is appended and the array is unchanged — the change is
 *   silently lost and the document is unchanged. That is the official
 *   behaviour, reproduced exactly and pinned by tests; the save layer
 *   then sees no change and sends no request.
 * - Otherwise (no document id, or an empty array): append a fresh
 *   entry unconditionally, even if an entry for this persona is
 *   already present. The appended entry carries only
 *   `landingPageSettings: { headerColor }` — the official code
 *   spreads the array's own (nonexistent) landingPageSettings, which
 *   contributes nothing.
 *
 * An undefined colour clears the choice in the map branch — the entry
 * stays, with `headerColor` dropped by JSON serialization, exactly as
 * official stores it.
 */
export function updatePersonPreferences(
  preferences: PersonaPreferences[],
  persona: { id: string; name: string },
  headerColor: string | undefined,
  options: UpdatePersonPreferencesOptions,
): PersonaPreferences[] {
  if (options.documentId && preferences.length) {
    return preferences.map((entry) => {
      if (entry.personaId !== persona.id) {
        return entry;
      }
      return {
        ...entry,
        landingPageSettings: {
          ...entry.landingPageSettings,
          headerColor,
        },
      };
    });
  }
  return [
    ...preferences,
    {
      personaId: persona.id,
      personaName: persona.name,
      landingPageSettings: { headerColor },
    },
  ];
}

const APP_LAYOUT_PREFERENCE_KEYS: Array<keyof PersonaAppLayoutPreferences> = [
  'appMode',
  'defaultLandingPage',
  'defaultViewModes',
];

/**
 * Replaces a persona's app-layout preferences. An undefined field is
 * removed rather than stored, so "no value" keeps meaning "fall through
 * to the next default", as official documents.
 */
export function updatePersonaAppLayout(
  preferences: PersonaPreferences[],
  persona: { id: string; name: string },
  changes: PersonaAppLayoutPreferences,
): PersonaPreferences[] {
  const values = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as PersonaAppLayoutPreferences;
  const hasEntry = preferences.some((entry) => entry.personaId === persona.id);
  if (!hasEntry) {
    return Object.keys(values).length
      ? [...preferences, { personaId: persona.id, personaName: persona.name, ...values }]
      : preferences;
  }
  return preferences.map((entry) => {
    if (entry.personaId !== persona.id) {
      return entry;
    }
    // Omit the app-layout keys first (official omit), then apply the
    // surviving values, so "no value" removes the key rather than
    // storing an explicit undefined.
    const stripped = { ...entry };
    for (const key of APP_LAYOUT_PREFERENCE_KEYS) {
      delete stripped[key];
    }
    return { ...stripped, ...values };
  });
}

/**
 * Curated landing-page options, mirroring the official
 * personaAppLayout.constants LANDING_PAGE_SECTIONS but mapped to
 * product routes: official Explore is the product's /search page, and
 * every option below is a route that exists in this console. Only
 * these paths are honoured as a stored landing page.
 */
export interface LandingPageOption {
  path: string;
  labelKey: string;
}

export interface LandingPageSection {
  titleKey: string;
  options: LandingPageOption[];
}

export const DEFAULT_LANDING_PAGE = '/my-data';

export const LANDING_PAGE_SECTIONS: LandingPageSection[] = [
  {
    titleKey: 'persona.landingSections.general',
    options: [
      { path: '/my-data', labelKey: 'persona.landingHome' },
      { path: '/search', labelKey: 'persona.landingExplore' },
      { path: '/lineage', labelKey: 'persona.landingLineage' },
    ],
  },
  {
    titleKey: 'persona.landingSections.marketplace',
    options: [
      { path: '/marketplace', labelKey: 'persona.landingMarketplace' },
      { path: '/governance/domains', labelKey: 'persona.landingDomains' },
      { path: '/governance/data-products', labelKey: 'persona.landingDataProducts' },
    ],
  },
  {
    titleKey: 'persona.landingSections.observability',
    options: [
      { path: '/quality/test-cases', labelKey: 'persona.landingDataQuality' },
      { path: '/observability/incidents', labelKey: 'persona.landingIncidents' },
      { path: '/insights', labelKey: 'persona.landingInsights' },
    ],
  },
  {
    titleKey: 'persona.landingSections.govern',
    options: [
      { path: '/governance/glossaries', labelKey: 'persona.landingGlossaries' },
      { path: '/governance/classifications', labelKey: 'persona.landingClassifications' },
      { path: '/governance/metrics', labelKey: 'persona.landingMetrics' },
    ],
  },
];

export function isLandingPageOption(path?: string): path is string {
  return LANDING_PAGE_SECTIONS.some((section) =>
    section.options.some((option) => option.path === path),
  );
}

/**
 * Where a user of this persona lands when they open the app. Only
 * paths from the curated option list are honoured; a stale or
 * hand-edited value falls back to Home instead of navigating somewhere
 * unexpected, as official does.
 */
export function resolvePersonaLandingPage(
  document: PersonaDocument | null | undefined,
  personaId: string | undefined,
): string {
  const path = getPersonaPreferences(document, personaId)?.defaultLandingPage;
  return isLandingPageOption(path) ? path : DEFAULT_LANDING_PAGE;
}

export interface ViewModePageOption {
  page: ViewModePage;
  labelKey: string;
  views: PageViewMode[];
}

export const DEFAULT_PAGE_VIEW_MODE: PageViewMode = 'table';

/** Only pages that render a view toggle, each with the views its toggle offers. */
export const VIEW_MODE_PAGES: ViewModePageOption[] = [
  { page: 'domains', labelKey: 'persona.viewDomains', views: ['table', 'card', 'tree'] },
  { page: 'subDomains', labelKey: 'persona.viewSubDomains', views: ['table', 'card'] },
  { page: 'dataProducts', labelKey: 'persona.viewDataProducts', views: ['table', 'card'] },
  { page: 'learningResources', labelKey: 'persona.viewLearningResources', views: ['table', 'card'] },
];

/** A stored view the page doesn't offer falls back to Table, as official does. */
export function resolvePersonaViewMode(
  document: PersonaDocument | null | undefined,
  personaId: string | undefined,
  page: ViewModePage,
): PageViewMode {
  const view = getPersonaPreferences(document, personaId)?.defaultViewModes?.[page];
  const offered = VIEW_MODE_PAGES.find((option) => option.page === page);
  return view && offered?.views.includes(view) ? view : DEFAULT_PAGE_VIEW_MODE;
}

/** Session flag marking the app entry as landing-handled. */
export const PERSONA_LANDING_HANDLED_KEY = 'sm.persona-landing-handled.v1';

/**
 * Landing-redirect decision, mirroring the official
 * PersonaLandingRedirect: only the app entry is redirected, and only
 * when the persona's landing page differs from the default. Later
 * visits to the root (alreadyHandled) always resolve to Home.
 */
export function resolveLandingRedirect(args: {
  landingPage: string;
  alreadyHandled: boolean;
}): string | null {
  if (args.alreadyHandled || args.landingPage === DEFAULT_LANDING_PAGE) {
    return null;
  }
  return args.landingPage;
}

/**
 * C-4 §1.1/§1.2: the official customize-page category and option
 * tables, built once from the official sources
 * (`PersonaClassBase.getCustomizePageCategories` /
 * `getCustomizePageOptions`, `PageType` enum order). The legacy
 * four-item category table and 25-item entity-page-type table were
 * deleted with the legacy customize views they served.
 */

/** The 27 PageType values, in official enum order. */
export type CustomizePageType =
  | 'APICollection'
  | 'APIEndpoint'
  | 'Chart'
  | 'Classification'
  | 'Container'
  | 'Dashboard'
  | 'DashboardDataModel'
  | 'DataMarketplace'
  | 'DataProduct'
  | 'Database'
  | 'DatabaseSchema'
  | 'Directory'
  | 'Domain'
  | 'File'
  | 'Glossary'
  | 'GlossaryTerm'
  | 'LandingPage'
  | 'Metric'
  | 'MlModel'
  | 'Pipeline'
  | 'SearchIndex'
  | 'Spreadsheet'
  | 'StoredProcedure'
  | 'Table'
  | 'Tag'
  | 'Topic'
  | 'Worksheet';

/** PageType enum order, as iterated by the official option filter. */
export const CUSTOMIZE_PAGE_TYPE_ORDER: readonly CustomizePageType[] = [
  'APICollection',
  'APIEndpoint',
  'Chart',
  'Classification',
  'Container',
  'Dashboard',
  'DashboardDataModel',
  'DataMarketplace',
  'DataProduct',
  'Database',
  'DatabaseSchema',
  'Directory',
  'Domain',
  'File',
  'Glossary',
  'GlossaryTerm',
  'LandingPage',
  'Metric',
  'MlModel',
  'Pipeline',
  'SearchIndex',
  'Spreadsheet',
  'StoredProcedure',
  'Table',
  'Tag',
  'Topic',
  'Worksheet',
];

/**
 * Official customize-page category labels (pin PersonaClassBase.ts:96-153)
 * for the detail breadcrumb's optional category segment only (PER-D3):
 * the segment renders only when the hash's second segment hits this
 * table, and carries no link. Transitional: the C-4 batch rebuilds the
 * category table (DEL-10); this lookup must not drive the customize UI.
 * Keys are the pin category keys, including the PageType values
 * `LandingPage` and `DataMarketplace` (generated/system/ui/uiCustomization.ts).
 */
export const CUSTOMIZE_PAGE_CATEGORY_LABEL_KEYS: Readonly<Record<string, string>> = {
  navigation: 'label.navigation',
  'app-layout': 'label.app-layout',
  askCollateSidebar: 'label.app-mode-sidebar',
  LandingPage: 'label.home-page',
  DataMarketplace: 'label.data-marketplace',
  governance: 'label.governance',
  'data-assets': 'label.data-asset-plural',
};

/** Entity page types the entity customize overlay offers (official PageType enum). */
export const ENTITY_PAGE_TYPES = [
  'APICollection',
  'APIEndpoint',
  'Chart',
  'Classification',
  'Container',
  'Dashboard',
  'DashboardDataModel',
  'DataMarketplace',
  'DataProduct',
  'Database',
  'DatabaseSchema',
  'Directory',
  'Domain',
  'File',
  'Glossary',
  'GlossaryTerm',
  'LandingPage',
  'Metric',
  'MlModel',
  'Pipeline',
  'SearchIndex',
  'Spreadsheet',
  'StoredProcedure',
  'Table',
  'Tag',
  'Topic',
  'Worksheet',
];

export type CustomizePageCategoryKey =
  | 'navigation'
  | 'app-layout'
  | 'askCollateSidebar'
  | 'LandingPage'
  | 'DataMarketplace'
  | 'governance'
  | 'data-assets';

/**
 * Icon keys, mirroring the official `CustomizeIconKeys` union: every
 * PageType plus the five non-PageType keys. Note the two deliberate
 * mismatches with category keys — the `governance` category uses icon
 * key `govern`, and `data-assets` uses `dataAssets`. The icon key is
 * data; the view layer resolves it to a component.
 */
export type CustomizePageIconKey =
  | CustomizePageType
  | 'govern'
  | 'dataAssets'
  | 'navigation'
  | 'askCollateSidebar'
  | 'app-layout';

export interface CustomizePageCategory {
  key: CustomizePageCategoryKey;
  /** i18n key for the card label; the en-US value is the pin value. */
  labelKey: string;
  /** i18n key for the card description; the en-US value is the pin value. */
  descriptionKey: string;
  /**
   * i18n key whose resolved value fills the `{entity}` slot of
   * `descriptionKey`. Only `DataMarketplace` sets it (its own label
   * key): the official description interpolates the marketplace label
   * into the shared entity-customize template.
   */
  descriptionEntityKey?: string;
  icon: CustomizePageIconKey;
}

/** Shared entity-customize description template (official `message.entity-customize-description`). */
export const ENTITY_CUSTOMIZE_DESCRIPTION_KEY = 'persona.entityCustomizeDescription';

/**
 * The seven customize categories, in official order. Description
 * provenance follows the official source per item: four descriptions
 * are pin literal strings (`navigation`, `LandingPage`, `governance`,
 * `data-assets`) and three come from pin i18n keys (`app-layout`,
 * `askCollateSidebar`, `DataMarketplace`); in this product every
 * description is addressed by an i18n key whose en-US value is the
 * pin value, with the exact values listed in the C-4 implementation
 * notes. The label/description keys are new — the legacy category
 * keys carry non-pin English text and must not be reused.
 */
export const CUSTOMIZE_PAGE_CATEGORIES: readonly CustomizePageCategory[] = [
  {
    key: 'navigation',
    labelKey: 'persona.customizeCategoryNavigation',
    descriptionKey: 'persona.customizeCategoryNavigationDescription',
    icon: 'navigation',
  },
  {
    key: 'app-layout',
    labelKey: 'persona.customizeCategoryAppLayout',
    descriptionKey: 'persona.customizeCategoryAppLayoutDescription',
    icon: 'app-layout',
  },
  {
    key: 'askCollateSidebar',
    labelKey: 'persona.customizeCategoryAiSidebar',
    descriptionKey: 'persona.customizeCategoryAiSidebarDescription',
    icon: 'askCollateSidebar',
  },
  {
    key: 'LandingPage',
    labelKey: 'persona.customizeCategoryHomePage',
    descriptionKey: 'persona.customizeCategoryHomePageDescription',
    icon: 'LandingPage',
  },
  {
    key: 'DataMarketplace',
    labelKey: 'persona.customizeCategoryMarketplace',
    descriptionKey: ENTITY_CUSTOMIZE_DESCRIPTION_KEY,
    descriptionEntityKey: 'persona.customizeCategoryMarketplace',
    icon: 'DataMarketplace',
  },
  {
    key: 'governance',
    labelKey: 'persona.customizeCategoryGovernance',
    descriptionKey: 'persona.customizeCategoryGovernanceDescription',
    icon: 'govern',
  },
  {
    key: 'data-assets',
    labelKey: 'persona.customizeCategoryDataAssets',
    descriptionKey: 'persona.customizeCategoryDataAssetsDescription',
    icon: 'dataAssets',
  },
];

/**
 * Card-rendering scope, expressed as data (C-4 §1.6): the category
 * table above carries all seven keys, and this exclusion set is the
 * single place that keeps `askCollateSidebar` off the card grid
 * pending the R-C4-SIDEBAR product scope ruling. No hand-written
 * conditional hides the card. When the ruling lands, this set — not
 * the category table — changes.
 */
export const CUSTOMIZE_PAGE_CARD_EXCLUDED_KEYS: ReadonlySet<CustomizePageCategoryKey> = new Set([
  'askCollateSidebar',
]);

/** The categories rendered as cards, in official order. */
export function getCustomizePageCardCategories(): CustomizePageCategory[] {
  return CUSTOMIZE_PAGE_CATEGORIES.filter(
    (category) => !CUSTOMIZE_PAGE_CARD_EXCLUDED_KEYS.has(category.key),
  );
}

export interface CustomizePageOption {
  key: CustomizePageType;
  /** Display label: startCase of the key, as the official generator computes it. */
  label: string;
  /** i18n key for the option description (the shared entity-customize template). */
  descriptionKey: string;
  /** Literal entity label filling the `{entity}` slot: the option label itself. */
  descriptionEntity: string;
  icon: CustomizePageIconKey;
}

function generateCustomizePageOption(pageType: CustomizePageType): CustomizePageOption {
  const label = startCase(pageType);
  return {
    key: pageType,
    label,
    descriptionKey: ENTITY_CUSTOMIZE_DESCRIPTION_KEY,
    descriptionEntity: label,
    icon: pageType,
  };
}

const GOVERNANCE_PAGE_TYPES: ReadonlySet<CustomizePageType> = new Set([
  'Glossary',
  'GlossaryTerm',
  'Domain',
  'DataProduct',
]);

const DATA_ASSETS_EXCLUDED_PAGE_TYPES: ReadonlySet<CustomizePageType> = new Set([
  'Glossary',
  'GlossaryTerm',
  'Domain',
  'DataProduct',
  'LandingPage',
  'Tag',
  'Classification',
  'DataMarketplace',
]);

/**
 * Sub-options for a parent category, mirroring the official
 * `getCustomizePageOptions`: iterate the PageType enum order and keep
 * the whitelist (`governance`, 4 items) or everything outside the
 * exclusion set (`data-assets`, 19 items). `Tag` and `Classification`
 * appear under no parent. Anything else — including unknown and empty
 * categories — returns `[]`.
 */
export function getCustomizePageOptions(category: string): CustomizePageOption[] {
  switch (category) {
    case 'governance':
      return CUSTOMIZE_PAGE_TYPE_ORDER.filter((pageType) =>
        GOVERNANCE_PAGE_TYPES.has(pageType),
      ).map(generateCustomizePageOption);
    case 'data-assets':
      return CUSTOMIZE_PAGE_TYPE_ORDER.filter(
        (pageType) => !DATA_ASSETS_EXCLUDED_PAGE_TYPES.has(pageType),
      ).map(generateCustomizePageOption);
    default:
      return [];
  }
}
