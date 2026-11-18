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
 * Service-category tab derivations for the services list page gate
 * (DESIGN §6.4 页内视图门, §6A GAP-HUB-1→(a)): the product equivalent
 * of the two pin lookups the official `ServicesPage.tsx` performs over
 * its raw `:tab` segment.
 *
 * `getResourceEntityFromServiceCategory` reproduces
 * `RESOURCE_ENTITY_BY_CATEGORY_MAP` (pin
 * `utils/ServicePureUtils.ts:135-174`) key for key, including its dual
 * keys (URL-segment spellings plus `ServiceCategory` enum values) and
 * its `DATABASE_SERVICE` fallback for anything unmapped. The fallback
 * is load-bearing, not a convenience: several valid list segments are
 * absent from the pin map (`mlmodels`, `storages`, `search`,
 * `security`, `drives`) and `dataObservability` is absent too, so the
 * gate for those tabs checks the database-service view permission,
 * exactly as pin does. Never derive the resource from the resolved
 * kind — the pin lookup runs on the raw segment, and a kind-derived
 * lookup would grant the wrong resource for those tabs. Resource
 * values come from `RESOURCE_KEY_BY_ENTITY` (the single home of the
 * permission resource keys, `./permissionRules.ts`); this module adds
 * no second spelling of any key.
 *
 * `getServiceNameForTab` reproduces the pin `serviceName` memo
 * (`ServicesPage.tsx:72-88`): `dataObservabilityServices` for the
 * data-observability tab, the `SERVICE_CATEGORY` mapping
 * (`constants/ServiceType.constant.ts:54-66`) for a mapping key, the
 * segment itself for a `ServiceCategory` enum value, and
 * `databaseServices` otherwise. The gate's permissionValue feeds it
 * through `startCase`, as pin does (`:207-209`).
 */
import { DATA_OBSERVABILITY_TAB } from './breadcrumbs';
import { RESOURCE_KEY_BY_ENTITY } from './permissionRules';

/**
 * Pin `RESOURCE_ENTITY_BY_CATEGORY_MAP`, dual-keyed. Values are the
 * pin `ResourceEntity` values, which are the GET /v1/permissions
 * resource keys (see `RESOURCE_KEY_BY_ENTITY`).
 */
const RESOURCE_KEY_BY_CATEGORY: Readonly<Record<string, string>> = {
  dashboards: RESOURCE_KEY_BY_ENTITY.DASHBOARD_SERVICE,
  dashboardServices: RESOURCE_KEY_BY_ENTITY.DASHBOARD_SERVICE,

  databases: RESOURCE_KEY_BY_ENTITY.DATABASE_SERVICE,
  databaseServices: RESOURCE_KEY_BY_ENTITY.DATABASE_SERVICE,

  mlModels: RESOURCE_KEY_BY_ENTITY.ML_MODEL_SERVICE,
  mlmodelServices: RESOURCE_KEY_BY_ENTITY.ML_MODEL_SERVICE,

  messaging: RESOURCE_KEY_BY_ENTITY.MESSAGING_SERVICE,
  messagingServices: RESOURCE_KEY_BY_ENTITY.MESSAGING_SERVICE,

  pipelines: RESOURCE_KEY_BY_ENTITY.PIPELINE_SERVICE,
  pipelineServices: RESOURCE_KEY_BY_ENTITY.PIPELINE_SERVICE,

  metadata: RESOURCE_KEY_BY_ENTITY.METADATA_SERVICE,
  metadataServices: RESOURCE_KEY_BY_ENTITY.METADATA_SERVICE,

  storageServices: RESOURCE_KEY_BY_ENTITY.STORAGE_SERVICE,

  searchIndex: RESOURCE_KEY_BY_ENTITY.SEARCH_SERVICE,
  searchServices: RESOURCE_KEY_BY_ENTITY.SEARCH_SERVICE,

  apiServices: RESOURCE_KEY_BY_ENTITY.API_SERVICE,

  directories: RESOURCE_KEY_BY_ENTITY.DRIVE_SERVICE,
  files: RESOURCE_KEY_BY_ENTITY.DRIVE_SERVICE,
  spreadsheets: RESOURCE_KEY_BY_ENTITY.DRIVE_SERVICE,
  worksheets: RESOURCE_KEY_BY_ENTITY.DRIVE_SERVICE,
  driveServices: RESOURCE_KEY_BY_ENTITY.DRIVE_SERVICE,

  securityServices: RESOURCE_KEY_BY_ENTITY.SECURITY_SERVICE,
};

/** Pin `getResourceEntityFromServiceCategory`: unmapped categories fall back to `DATABASE_SERVICE`. */
export function getResourceEntityFromServiceCategory(category: string): string {
  return RESOURCE_KEY_BY_CATEGORY[category] ?? RESOURCE_KEY_BY_ENTITY.DATABASE_SERVICE;
}

/** Pin `SERVICE_CATEGORY` (URL segment → `ServiceCategory` enum value). */
const SERVICE_CATEGORY_BY_SEGMENT: Readonly<Record<string, string>> = {
  databases: 'databaseServices',
  messaging: 'messagingServices',
  dashboards: 'dashboardServices',
  pipelines: 'pipelineServices',
  mlmodels: 'mlmodelServices',
  metadata: 'metadataServices',
  storages: 'storageServices',
  search: 'searchServices',
  apiServices: 'apiServices',
  security: 'securityServices',
  drives: 'driveServices',
};

/** Pin `serviceName` for the data-observability tab (not a service category). */
const DATA_OBSERVABILITY_SERVICE_NAME = 'dataObservabilityServices';

/** Pin `ServiceCategory.DATABASE_SERVICES`, the `serviceName` fallback. */
const DATABASE_SERVICES = 'databaseServices';

/**
 * Every accepted segment spelling → its pin `serviceName`: mapping
 * keys via `SERVICE_CATEGORY_BY_SEGMENT`, enum values to themselves,
 * and the data-observability tab to its dedicated name. Anything else
 * falls back to `DATABASE_SERVICES` (pin memo default).
 */
const SERVICE_NAME_BY_TAB: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [segment, category] of Object.entries(SERVICE_CATEGORY_BY_SEGMENT)) {
    map.set(segment, category);
  }
  for (const category of Object.values(SERVICE_CATEGORY_BY_SEGMENT)) {
    map.set(category, category);
  }
  map.set(DATA_OBSERVABILITY_TAB, DATA_OBSERVABILITY_SERVICE_NAME);
  return map;
})();

export function getServiceNameForTab(tab: string): string {
  return SERVICE_NAME_BY_TAB.get(tab) ?? DATABASE_SERVICES;
}

/**
 * Lodash `startCase` for camelCase service names, as pin applies it to
 * `serviceName` for the gate's permissionValue (`ServicesPage.tsx:15`
 * import, `:207-209` use). The product has no lodash dependency, so —
 * like `capitalizeSegment` in `./breadcrumbs.ts` — the lodash behaviour
 * is reimplemented locally for identifier inputs: split on camelCase
 * boundaries and `_`/`-` separators, capitalise each word.
 */
export function startCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
