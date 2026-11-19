/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Call-site exception adapters (DESIGN §9.5): the nine rows of the exception
 * table, each implemented once as a data-driven adapter. Exceptions take
 * priority over the §9.1 default builder and over registry titles: a view
 * must call its adapter instead of hand-writing a branch, and must never
 * substitute a registry title for an exception output.
 *
 * Every adapter takes resolved labels and caller-resolved locations as data.
 * Nothing here reads the registry, the router, or the locale: label keys and
 * route names stay owned by the registry, router, and i18n streams, and the
 * adapters only pin the pin-verified shape, order, link, and name source of
 * each output. Pin citations are per adapter, verified against the
 * `origin/main` object tree.
 */
import type { RouteLocationRaw } from 'vue-router';
import type { EntityBreadcrumb } from '@/features/crud/types';
import { startCase } from '@/utils/text';
import {
  getSettingPageBreadcrumbs,
  type SettingsBreadcrumbCatalog,
  type SettingsLocationResolver,
} from './breadcrumbs';

/** Registry key of the Members category (pin `GlobalSettingsMenuCategory.MEMBERS`). */
export const SETTINGS_CATEGORY_MEMBERS = 'members';

/** Registry key of the Preferences category (pin `GlobalSettingsMenuCategory.PREFERENCES`). */
export const SETTINGS_CATEGORY_PREFERENCES = 'preferences';

/** Registry key of the Custom Properties category (pin `GlobalSettingsMenuCategory.CUSTOM_PROPERTIES`). */
export const SETTINGS_CATEGORY_CUSTOM_PROPERTIES = 'customProperties';

/** Sub-category key of the Search sub-category (pin `GlobalSettingOptions.SEARCH_SETTINGS`). */
export const SETTINGS_SUBCATEGORY_SEARCH_SETTINGS = 'search-settings';

/** URL segment of the Data Asset Rules entry (pin `GlobalSettingOptions.DATA_ASSET_RULES`). */
export const DATA_ASSET_RULES_SEGMENT = 'dataAssetRules';

/**
 * The explicit "no breadcrumb" output, shared by the exception rows whose
 * pin call site renders no breadcrumb at all (Applications detail, user
 * detail). A fresh empty array per call: callers bind it straight to a
 * shell's `breadcrumbs` prop, and both shells render nothing for it.
 */
export function noBreadcrumbs(): EntityBreadcrumb[] {
  return [];
}

/**
 * Renders `label.entity-configuration` (`"{{entity}} Configuration"`) for one
 * entity label. The caller supplies the template application
 * (`(entity) => t('settings.shell.entityConfiguration', { entity })`); the
 * adapter owns where the template applies, the i18n stream owns the key.
 */
export type EntityConfigurationFormatter = (entity: string) => string;

/**
 * Row 1 — Persona detail: a page-owned array, never injected with the
 * `Settings` root. Usually two segments: `Personas` linked to the list, then
 * the entity name linked to the detail `#customize-ui` anchor; only when
 * `activeCategory` hits the customize-category table is a third, unlinked
 * category label appended (pin `PersonaDetailsPage.tsx:107-133`). The
 * customize-category table is C-4 content: the caller passes it, the adapter
 * performs the lookup, so a miss appends nothing.
 */
export interface PersonaCustomizeCategory {
  key: string;
  label: string;
}

export function personaDetailBreadcrumbs(input: {
  /** Resolved `label.persona-plural` (`Personas`, plural — not the `Persona` category name). */
  personasLabel: string;
  /** Entity display name (`getEntityName(persona)`). */
  entityName: string;
  /** Location of the persona list (`getSettingPath(PERSONA)`). */
  personaListLocation: RouteLocationRaw;
  /** Location of this persona's detail page including the `#customize-ui` hash. */
  personaDetailLocation: RouteLocationRaw;
  /** Customize-page categories (`getCustomizePageCategories()`), for the optional third segment. */
  customizeCategories: readonly PersonaCustomizeCategory[];
  /** Active customize category key, when the page is showing one. */
  activeCategory?: string;
}): EntityBreadcrumb[] {
  const crumbs: EntityBreadcrumb[] = [
    { label: input.personasLabel, to: input.personaListLocation },
    { label: input.entityName, to: input.personaDetailLocation },
  ];
  if (input.activeCategory) {
    const category = input.customizeCategories.find((item) => item.key === input.activeCategory);
    if (category) {
      crumbs.push({ label: category.label });
    }
  }
  return crumbs;
}

/**
 * Row 2 — Applications detail: no breadcrumb at all, and the Browse Apps
 * return button kept (pin `AppDetails.component.tsx:700-717` renders the
 * button and no breadcrumb; t350 AP-C1). The chrome object carries both
 * halves so the view cannot render one without the other.
 */
export interface ApplicationDetailChrome {
  breadcrumbs: EntityBreadcrumb[];
  browseAppsButton: { label: string; to: RouteLocationRaw };
}

export function applicationDetailChrome(input: {
  /** Resolved `label.browse-app-plural` (`Browse Apps`). */
  browseAppsLabel: string;
  /** Location of the applications list, the button's return target. */
  appsListLocation: RouteLocationRaw;
}): ApplicationDetailChrome {
  return {
    breadcrumbs: noBreadcrumbs(),
    browseAppsButton: { label: input.browseAppsLabel, to: input.appsListLocation },
  };
}

/**
 * Row 3 (Search half) — search-settings entity page: the default builder,
 * but the entity name is the `startCase` derivation of the URL segment, never
 * the registry nested-item title (pin `EntitySearchSettings.tsx:158-174`).
 */
export function searchEntitySettingBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  entityType: string,
): EntityBreadcrumb[] {
  return getSettingPageBreadcrumbs(
    catalog,
    locate,
    SETTINGS_CATEGORY_PREFERENCES,
    startCase(entityType),
    SETTINGS_SUBCATEGORY_SEARCH_SETTINGS,
  );
}

/**
 * Row 3 (Custom Properties half) — custom-properties type page: the default
 * builder, but the entity name is the `startCase` derivation of the `:tab`
 * segment, never the registry title and never the raw segment string (pin
 * `CustomPropertiesPageV1.tsx:67-80`).
 */
export function customPropertyTypeBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  tab: string,
): EntityBreadcrumb[] {
  return getSettingPageBreadcrumbs(
    catalog,
    locate,
    SETTINGS_CATEGORY_CUSTOM_PROPERTIES,
    startCase(tab),
  );
}

/**
 * Row 4 — Learning page: a self-built three-item array whose last item is
 * the SINGULAR `label.learning-resource`, never the plural registry title
 * `Learning Resources` (pin `LearningResourcesPage.tsx:146-155`). The shape
 * coincides with the default builder's output for this input; the adapter
 * exists to pin the name source, so the call site cannot pass the registry
 * title by mistake.
 */
export function learningResourcesBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  learningResourceLabel: string,
): EntityBreadcrumb[] {
  return getSettingPageBreadcrumbs(catalog, locate, SETTINGS_CATEGORY_PREFERENCES, learningResourceLabel);
}

/**
 * Row 5 — OM URL page: the default builder with the entity name generated by
 * the `label.entity-configuration` template over the brand URL label, giving
 * the full `{{brandName}} URL Configuration` — never the registry card's
 * short `{{brandName}} URL` title (pin `UrlConfigurationPage.tsx:65-74`).
 */
export function omUrlConfigurationBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  formatEntityConfiguration: EntityConfigurationFormatter,
  brandUrlLabel: string,
): EntityBreadcrumb[] {
  return getSettingPageBreadcrumbs(
    catalog,
    locate,
    SETTINGS_CATEGORY_PREFERENCES,
    formatEntityConfiguration(brandUrlLabel),
  );
}

/**
 * Row 6 — Lineage page: breadcrumb plus a plain `h5` heading, no `PageHeader`
 * (pin `LineageConfigPage.tsx:202-227` renders `TitleBreadcrumb` and a
 * `Typography as="h5"` with `label.lineage`; the file has no `PageHeader`).
 * The chrome object carries the heading contract with the crumbs so the view
 * renders the official shape instead of the generic shell header.
 */
export interface LineageConfigurationChrome {
  breadcrumbs: EntityBreadcrumb[];
  heading: { label: string; level: 'h5' };
}

export function lineageConfigurationChrome(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  lineageLabel: string,
): LineageConfigurationChrome {
  return {
    breadcrumbs: getSettingPageBreadcrumbs(catalog, locate, SETTINGS_CATEGORY_PREFERENCES, lineageLabel),
    heading: { label: lineageLabel, level: 'h5' },
  };
}

/**
 * Row 7 / §9.4 — Data Asset Rules page: pin's self-built three-item array,
 * NOT the default builder output. The last item KEEPS its link (unlike the
 * builder's unlinked last item) and its label comes from the
 * `label.entity-configuration` template over the Data Asset Rules label (pin
 * `DataAssetRulesPage.tsx:46-67`). Paths are the pin `getSettingPath` enum
 * segments, not catalog lookups: pin builds this array without the category
 * table.
 */
export function dataAssetRulesBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  formatEntityConfiguration: EntityConfigurationFormatter,
  dataAssetRulesLabel: string,
): EntityBreadcrumb[] {
  return [
    { label: catalog.settingsLabel, to: locate('') },
    {
      label: catalog.entries.get(SETTINGS_CATEGORY_PREFERENCES)?.label ?? '',
      to: locate(SETTINGS_CATEGORY_PREFERENCES),
    },
    {
      label: formatEntityConfiguration(dataAssetRulesLabel),
      to: locate(`${SETTINGS_CATEGORY_PREFERENCES}/${DATA_ASSET_RULES_SEGMENT}`),
    },
  ];
}

/**
 * Row 8 — Bot detail (top-level `/bots/:fqn`, outside the settings space):
 * a page-owned two-item array with no `Settings` root — `Bots` linked to the
 * settings bots list, then the raw bot name, unlinked (pin
 * `BotDetails.component.tsx:306-316`; first item is the literal `'Bots'`,
 * last item the raw `botData.name`). The caller resolves the `Bots` label
 * through i18n (the product renders no untranslated literals) and passes the
 * RAW name, not a display-name derivation.
 */
export function botDetailBreadcrumbs(input: {
  /** Resolved `label.bot-plural` (`Bots`). */
  botsLabel: string;
  /** Raw `botData.name` — not `displayName`, not `entityLabel`. */
  botName: string;
  /** Location of the settings bots list (`getSettingPath(BOTS)`). */
  botsListLocation: RouteLocationRaw;
}): EntityBreadcrumb[] {
  return [
    { label: input.botsLabel, to: input.botsListLocation },
    { label: input.botName },
  ];
}

/** One parent team in a non-Organization team's parent chain, in API order. */
export interface TeamParentLink {
  /** Parent display name (`getEntityName(parent)`). */
  displayName: string;
  /** Location of the parent team's FQN detail page. */
  location: RouteLocationRaw;
}

/**
 * Row 9 (team half) — team detail splits on Organization (partition batch
 * 02稿 §2.1 note, R-M5; pin `TeamDetailsV1.tsx:229-236, 539-562, 1051,
 * 1338-1343`): Organization renders the default builder's three levels
 * `[Settings, Members, Teams]` with NO team name and NO sub-category (the
 * two-argument call — a four-level call is explicitly forbidden by the
 * partition note); any other team renders the parent chain built from
 * `parentTeams`, each parent linked to its FQN detail path, ending with the
 * unlinked current team name and no `Settings` root. The branch lives here,
 * driven by the entity's `isOrganization`, never in the view.
 */
export function teamDetailBreadcrumbs(input: {
  /** Whether the team is the Organization root team. */
  isOrganization: boolean;
  catalog: SettingsBreadcrumbCatalog;
  locate: SettingsLocationResolver;
  /** Resolved `label.team-plural` (`Teams`), Organization branch only. */
  teamsLabel: string;
  /** Parent chain in API order, non-Organization branch only. */
  parents: readonly TeamParentLink[];
  /** Current team display name (`getEntityName(currentTeam)`). */
  currentTeamName: string;
}): EntityBreadcrumb[] {
  if (input.isOrganization) {
    return getSettingPageBreadcrumbs(input.catalog, input.locate, SETTINGS_CATEGORY_MEMBERS, input.teamsLabel);
  }
  return [
    ...input.parents.map((parent) => ({ label: parent.displayName, to: parent.location })),
    { label: input.currentTeamName },
  ];
}

/**
 * Row 9 (user half) — user detail: no breadcrumb. The page lives outside the
 * settings space and pin's `UserPage` contains no breadcrumb at all
 * (partition batch 02稿 §0.4 decision 1 / D-TC3; `UserPage.component.tsx`
 * has zero `Breadcrumb` references).
 */
export function userDetailBreadcrumbs(): EntityBreadcrumb[] {
  return noBreadcrumbs();
}

/**
 * R-WIRE-7 — Alert detail: pin self-built four-item array
 * (`useAlertDetailsData.ts`, notification branch): Settings →
 * Notifications → Alerts → entity. The default builder cannot express
 * the entry level ('alerts' is not in the §9.2 catalog), so the array
 * is composed here from the catalog, the resolver, and the
 * caller-resolved registry title — no hand-written label, no branch.
 * The entity name arrives resolved; the view's pre-existing fallback
 * stays at the call site. The pin observability branch (three items)
 * has no product route and is out of scope.
 */
export function alertDetailBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  alertsLabel: string,
  entityName: string,
): EntityBreadcrumb[] {
  return [
    { label: catalog.settingsLabel, to: locate('') },
    {
      label: catalog.entries.get('notifications')?.label ?? '',
      to: locate('notifications'),
    },
    { label: alertsLabel, to: locate('notifications/alerts') },
    { label: entityName },
  ];
}
