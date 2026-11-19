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
 * Settings breadcrumb builder: the product equivalent of official
 * `getSettingPageEntityBreadCrumb` (pin `utils/GlobalSettingsUtils.tsx:76-115`).
 * It is the DEFAULT breadcrumb output, not the only legal one: pages whose
 * pin call site builds its own array, or derives the entity name with
 * `startCase`/`capitalize`, are covered by the exception adapters in
 * `./breadcrumbExceptions.ts` (DESIGN §9.5), which take priority over this
 * builder and over registry titles.
 *
 * The builder is pure: display names arrive resolved through the catalog
 * (DESIGN §9.2, owned by the registry module), and settings-space paths are
 * turned into route locations by a resolver owned by the router stream. This
 * module hard-codes no label and no route name.
 */
import type { RouteLocationRaw } from 'vue-router';
import type { SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import type { EntityBreadcrumb } from '@/features/crud/types';
import type { SettingsBreadcrumbName, SettingsTranslator } from './registry';

/**
 * A settings-space path below `/settings`, in pin `getSettingPath` form:
 * `''` is the Hub, `'members'` a category, `'preferences/search-settings'`
 * a sub-category. The resolver maps it to a route location; the mapping
 * table belongs to the router stream (DESIGN §3.6).
 */
export type SettingsPath = string;

/** Maps a settings-space path to the route location the crumb links to. */
export type SettingsLocationResolver = (path: SettingsPath) => RouteLocationRaw;

/**
 * One resolved row of the §9.2 category-name table: the breadcrumb name and
 * the settings-space path. Unknown keys are absent from the catalog, which
 * is what makes an unknown `:category` render the pin empty-name crumb
 * (D-10) instead of throwing or falling back to a wrong name.
 */
export interface SettingsBreadcrumbNameEntry {
  label: string;
  path: SettingsPath;
}

/**
 * Everything the builder needs from the registry module: the resolved
 * `Settings` root label and the §9.2 name table. Built from the registry
 * export with {@link buildSettingsBreadcrumbCatalog}.
 */
export interface SettingsBreadcrumbCatalog {
  settingsLabel: string;
  entries: ReadonlyMap<string, SettingsBreadcrumbNameEntry>;
}

/**
 * Resolves the registry module's §9.2 table (`SETTINGS_BREADCRUMB_NAMES` in
 * `./registry`, a `Record` keyed by bare segment) into the catalog the
 * builder consumes. `settingsNameKey` is the i18n key of the `Settings` root
 * label (DESIGN §12.1 retains the existing `settings.title` key). The import
 * from `./registry` is type-only: the builder stays decoupled from the
 * registry at runtime, and a registry shape change fails the type gate
 * instead of drifting silently.
 */
export function buildSettingsBreadcrumbCatalog(
  settingsNameKey: string,
  names: Readonly<Record<string, SettingsBreadcrumbName>>,
  t: SettingsTranslator,
): SettingsBreadcrumbCatalog {
  return {
    settingsLabel: t(settingsNameKey),
    entries: new Map(
      Object.entries(names).map(([segment, row]) => [
        segment,
        { label: t(row.nameKey), path: row.path },
      ]),
    ),
  };
}

/**
 * Pin `getSettingPageEntityBreadCrumb` semantics, step for step
 * (`utils/GlobalSettingsUtils.tsx:76-115`):
 *
 * 1. `{Settings, linked to the Hub}` — always first, always linked.
 * 2. `{category name, linked to the category path when `entityName` is
 *    present, otherwise unlinked and active}`. An unknown category renders
 *    the empty name (D-10); pin would throw when an unknown category is
 *    combined with an entity name, a combination no pin call site produces —
 *    the builder renders the empty unlinked crumb instead of crashing.
 * 3. When `subCategory` is present: `{sub-category name, linked to the
 *    sub-category path when `entityName` is present, otherwise unlinked}`.
 *    An unknown sub-category combined with an entity name reproduces pin
 *    literally: the empty name linked to the Hub (`subCategoryObject?.url
 *    ?? ''` through `getSettingPath`, whose empty input yields `/settings`).
 * 4. When `entityName` is present: `{entity name, unlinked, active}`.
 *
 * Empty-string `entityName`/`subCategory` count as absent, exactly as pin's
 * truthiness checks treat them. The neutral output is `EntityBreadcrumb[]`:
 * `EntityDetailShell` consumes it directly, `SmBreadcrumb` through
 * {@link toSmBreadcrumbItems}.
 */
export function getSettingPageBreadcrumbs(
  catalog: SettingsBreadcrumbCatalog,
  locate: SettingsLocationResolver,
  category: string,
  entityName?: string,
  subCategory?: string,
): EntityBreadcrumb[] {
  const categoryEntry = catalog.entries.get(category);
  const subCategoryEntry = subCategory ? catalog.entries.get(subCategory) : undefined;
  const hasEntity = Boolean(entityName);

  const crumbs: EntityBreadcrumb[] = [
    { label: catalog.settingsLabel, to: locate('') },
    categoryEntry && hasEntity
      ? { label: categoryEntry.label, to: locate(categoryEntry.path) }
      : { label: categoryEntry?.label ?? '' },
  ];

  if (subCategory) {
    crumbs.push(
      hasEntity
        ? { label: subCategoryEntry?.label ?? '', to: locate(subCategoryEntry?.path ?? '') }
        : { label: subCategoryEntry?.label ?? '' },
    );
  }

  if (entityName) {
    crumbs.push({ label: entityName });
  }

  return crumbs;
}

/**
 * Lodash `startCase` for URL segments, as pin applies it to `tab` /
 * `entityType` (`CustomPropertiesPageV1.tsx:73`, `EntitySearchSettings.tsx:166`;
 * both import it from lodash). The product has no lodash dependency, and the
 * input vocabulary is the §3.4/§3.5 segment set, so the rule is implemented
 * for segments: split camelCase and separators into words, upper-case each
 * word's first letter, keep the rest untouched (`databaseSchemas` becomes
 * `Database Schemas`, `mlmodels` becomes `Mlmodels`).
 */
export function startCaseSegment(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Lodash `capitalize` for URL segments, as pin applies it to the services
 * `tab` (`ServicesPage.tsx:109`, lodash import at `:15`): first letter
 * upper-cased, the rest lower-cased. That lower-casing is pin behaviour, not
 * a typo: `databaseServices` becomes `Databaseservices`.
 */
export function capitalizeSegment(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Pin `GlobalSettingOptions.DATA_OBSERVABILITY` value. */
export const DATA_OBSERVABILITY_TAB = 'dataObservability';

/**
 * The services list entity name (DESIGN §9.3, B-8): pin renders the
 * translated Data Observability label for the `dataObservability` tab and
 * `capitalize(tab)` for every other tab (`ServicesPage.tsx:105-110`).
 */
export function servicesTabEntityName(tab: string, dataObservabilityLabel: string): string {
  return tab === DATA_OBSERVABILITY_TAB ? dataObservabilityLabel : capitalizeSegment(tab);
}

/**
 * Thin `SmBreadcrumb` adapter (DESIGN §9.1): `to` becomes `routeName` /
 * `routeParams`. Only plain named locations convert — `SmBreadcrumbItem`
 * cannot express string paths, hashes, queries, or array params, so crumbs
 * carrying those render unlinked through this adapter. That is a projection
 * limit, not a data loss: the neutral output keeps the full location, and
 * views that need hash links (Persona detail) render through
 * `EntityDetailShell`, which consumes `to` directly.
 *
 * The adapter maps every crumb uniformly, including a linked last crumb
 * (Data Asset Rules, §9.4). `SmBreadcrumb` links any item carrying a
 * route name, including the last one, so the adapter's linked last
 * crumb renders linked.
 */
export function toSmBreadcrumbItems(crumbs: readonly EntityBreadcrumb[]): SmBreadcrumbItem[] {
  return crumbs.map((crumb) => {
    const route = toNamedRoute(crumb.to);
    return route
      ? { label: crumb.label, routeName: route.name, ...(route.params ? { routeParams: route.params } : {}) }
      : { label: crumb.label };
  });
}

function toNamedRoute(
  to: RouteLocationRaw | undefined,
): { name: string; params?: Record<string, string> } | undefined {
  if (!to || typeof to !== 'object') {
    return undefined;
  }
  const { name, params, hash, query } = to as {
    name?: unknown;
    params?: unknown;
    hash?: unknown;
    query?: unknown;
  };
  if (typeof name !== 'string' || hash !== undefined || query !== undefined) {
    return undefined;
  }
  if (params === undefined) {
    return { name };
  }
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return undefined;
  }
  const routeParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (typeof value === 'string') {
      routeParams[key] = value;
    } else if (typeof value === 'number') {
      routeParams[key] = String(value);
    } else {
      return undefined;
    }
  }
  return { name, params: routeParams };
}
