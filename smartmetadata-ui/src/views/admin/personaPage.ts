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
 * Stage D (G-11): upserts the user's own header-colour choice for a
 * persona into `personPreferences`, mirroring the official
 * `handleBackgroundColorUpdate` (which appends when the persona has
 * no entry and maps the matching entry otherwise). An undefined colour
 * clears the choice — the entry stays, with `headerColor` dropped by
 * JSON serialization, exactly as official stores it.
 */
export function updatePersonPreferences(
  preferences: PersonaPreferences[],
  persona: { id: string; name: string },
  headerColor: string | undefined,
): PersonaPreferences[] {
  const hasEntry = preferences.some((entry) => entry.personaId === persona.id);
  if (!hasEntry) {
    return [
      ...preferences,
      {
        personaId: persona.id,
        personaName: persona.name,
        landingPageSettings: { headerColor },
      },
    ];
  }
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
 * Customize categories this console ships editors for, mirroring the
 * official PersonaClassBase categories minus navigation and the AI
 * sidebar, whose editors are a separate batch: app-layout, the home
 * page, the data marketplace, and govern entity pages.
 */
export const PERSONA_CUSTOMIZE_CATEGORIES = [
  { key: 'app-layout', titleKey: 'persona.customizeAppLayout' },
  { key: 'LandingPage', titleKey: 'persona.customizeLandingPage' },
  { key: 'DataMarketplace', titleKey: 'persona.customizeMarketplace' },
  { key: 'governance', titleKey: 'persona.customizeGovern' },
] as const;

export type PersonaCustomizeCategory = (typeof PERSONA_CUSTOMIZE_CATEGORIES)[number]['key'];

/** Entity page types the entity customize overlay offers (official PageType enum). */
export const ENTITY_PAGE_TYPES = [
  'APICollection',
  'APIEndpoint',
  'Chart',
  'Classification',
  'Container',
  'Dashboard',
  'DashboardDataModel',
  'DataProduct',
  'Database',
  'DatabaseSchema',
  'Directory',
  'Domain',
  'File',
  'Glossary',
  'GlossaryTerm',
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
] as const;
