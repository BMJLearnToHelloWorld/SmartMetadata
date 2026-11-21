/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ServiceSearchIndexValue } from '@/api/serviceSearch';
import type { ServiceKind } from '@/types/ingestion';

/**
 * The single fact source for the 11 official service categories
 * (01-services.md §2.1). Every partition page reads its category data
 * from this table; no page may invent its own.
 *
 * Sources, all pin a3012259ca (392b3efd object tree):
 * - mapping-key segment -> enum value: constants/ServiceType.constant.ts
 *   SERVICE_CATEGORY (:54-66);
 * - enum values: enums/service.enum.ts ServiceCategory (:26-38);
 * - title keys and wizard order: SERVICE_CATEGORY_TITLE_KEYS (:71-83);
 * - resource entity: utils/ServicePureUtils.ts
 *   RESOURCE_ENTITY_BY_CATEGORY_MAP + getResourceEntityFromServiceCategory
 *   (:135-174) — evaluated with the ORIGINAL segment for the list view
 *   gate, with the ENUM VALUE for the create gate; unknown falls back to
 *   DATABASE_SERVICE (official verbatim, including the five missing
 *   segment keys storages/search/security/drives/mlmodels);
 * - entity type: ENTITY_TYPE_BY_SERVICE_CATEGORY_MAP (:240-258), unknown
 *   falls back to DATABASE_SERVICE;
 * - search index: getSearchIndexFromService (:317-332) — 10 entries, NO
 *   SECURITY_SERVICES entry, fallback DATABASE_SERVICE (official quirk,
 *   copied verbatim, never "fixed");
 * - count label: getCountLabel (:188-210) — metadata/security take the
 *   default database-plural;
 * - page headers: constants/PageHeaders.constant.ts (:63-106), 11 pairs
 *   plus the DATABASES fallback used by Services.tsx getServicePageHeader
 *   (:259-283);
 * - empty states: constants/ServiceEmptyState.constant.ts (:55-120), 11
 *   categories plus the DATABASE fallback.
 *
 * The product kind strings (database/dashboard/messaging/pipeline/storage/
 * api/mlmodel/metadata/search/drive/security) key this table; llm/mcp are
 * NOT members (C-2). The pre-existing 13-row SERVICE_CATEGORIES table in
 * catalog/ingestionTabs.ts must not be used as this partition's fact
 * source.
 *
 * i18n keys follow 01-services.md §2.6: new keys under
 * `settings.services.*`; values are the pin en-us strings with faithful
 * zh-CN translations (see the implementation report's key list — locale
 * files are written by the integration line, not here).
 */

export type ServiceCategoryKind = Exclude<ServiceKind, 'llm' | 'mcp'>;

export interface ServiceCategoryRow {
  /** Product kind string. */
  kind: ServiceCategoryKind;
  /** SERVICE_CATEGORY mapping-key segment (URL segment form). */
  segment: string;
  /** ServiceCategory enum value. */
  enumValue: string;
  /** Wizard category-select title key (SERVICE_CATEGORY_TITLE_KEYS). */
  titleKey: string;
  /** List page header key (PageHeaders.constant.ts). */
  headerKey: string;
  /** List page sub-header key (PageHeaders.constant.ts). */
  subHeaderKey: string;
  /** First-run empty-state title key (ServiceEmptyState.constant.ts). */
  emptyTitleKey: string;
  /** First-run empty-state description key. */
  emptyDescriptionKey: string;
  /** Resource entity string for permission evaluation. */
  resourceEntity: string;
  /** EntityType string for the service entity. */
  entityType: string;
  /** Search index for the services search path. */
  searchIndex: ServiceSearchIndexValue;
  /** Child entity type for the main tab / version child table, if any. */
  childEntityType?: string;
}

/** The 11 rows, in SERVICE_CATEGORY_TITLE_KEYS (wizard) order. */
export const SERVICE_CATEGORY_ROWS: readonly ServiceCategoryRow[] = [
  {
    kind: 'database',
    segment: 'databases',
    enumValue: 'databaseServices',
    titleKey: 'settings.services.categoryTitle.database',
    headerKey: 'settings.services.header.database',
    subHeaderKey: 'settings.services.subheader.database',
    emptyTitleKey: 'settings.services.empty.database.title',
    emptyDescriptionKey: 'settings.services.empty.database.description',
    resourceEntity: 'databaseService',
    entityType: 'databaseService',
    searchIndex: 'databaseService',
    childEntityType: 'database',
  },
  {
    kind: 'dashboard',
    segment: 'dashboards',
    enumValue: 'dashboardServices',
    titleKey: 'settings.services.categoryTitle.dashboard',
    headerKey: 'settings.services.header.dashboard',
    subHeaderKey: 'settings.services.subheader.dashboard',
    emptyTitleKey: 'settings.services.empty.dashboard.title',
    emptyDescriptionKey: 'settings.services.empty.dashboard.description',
    resourceEntity: 'dashboardService',
    entityType: 'dashboardService',
    searchIndex: 'dashboardService',
    childEntityType: 'dashboard',
  },
  {
    kind: 'messaging',
    segment: 'messaging',
    enumValue: 'messagingServices',
    titleKey: 'settings.services.categoryTitle.messaging',
    headerKey: 'settings.services.header.messaging',
    subHeaderKey: 'settings.services.subheader.messaging',
    emptyTitleKey: 'settings.services.empty.messaging.title',
    emptyDescriptionKey: 'settings.services.empty.messaging.description',
    resourceEntity: 'messagingService',
    entityType: 'messagingService',
    searchIndex: 'messagingService',
    childEntityType: 'topic',
  },
  {
    kind: 'pipeline',
    segment: 'pipelines',
    enumValue: 'pipelineServices',
    titleKey: 'settings.services.categoryTitle.pipeline',
    headerKey: 'settings.services.header.pipeline',
    subHeaderKey: 'settings.services.subheader.pipeline',
    emptyTitleKey: 'settings.services.empty.pipeline.title',
    emptyDescriptionKey: 'settings.services.empty.pipeline.description',
    resourceEntity: 'pipelineService',
    entityType: 'pipelineService',
    searchIndex: 'pipelineService',
    childEntityType: 'pipeline',
  },
  {
    kind: 'storage',
    segment: 'storages',
    enumValue: 'storageServices',
    titleKey: 'settings.services.categoryTitle.storage',
    headerKey: 'settings.services.header.storage',
    subHeaderKey: 'settings.services.subheader.storage',
    emptyTitleKey: 'settings.services.empty.storage.title',
    emptyDescriptionKey: 'settings.services.empty.storage.description',
    resourceEntity: 'storageService',
    entityType: 'storageService',
    searchIndex: 'storageService',
    childEntityType: 'container',
  },
  {
    kind: 'api',
    segment: 'apiServices',
    enumValue: 'apiServices',
    titleKey: 'settings.services.categoryTitle.api',
    headerKey: 'settings.services.header.api',
    subHeaderKey: 'settings.services.subheader.api',
    emptyTitleKey: 'settings.services.empty.api.title',
    emptyDescriptionKey: 'settings.services.empty.api.description',
    resourceEntity: 'apiService',
    entityType: 'apiService',
    searchIndex: 'apiService',
    childEntityType: 'apiCollection',
  },
  {
    kind: 'mlmodel',
    segment: 'mlmodels',
    enumValue: 'mlmodelServices',
    titleKey: 'settings.services.categoryTitle.mlmodel',
    headerKey: 'settings.services.header.mlmodel',
    subHeaderKey: 'settings.services.subheader.mlmodel',
    emptyTitleKey: 'settings.services.empty.mlmodel.title',
    emptyDescriptionKey: 'settings.services.empty.mlmodel.description',
    resourceEntity: 'mlmodelService',
    entityType: 'mlmodelService',
    searchIndex: 'mlModelService',
    childEntityType: 'mlmodel',
  },
  {
    kind: 'metadata',
    segment: 'metadata',
    enumValue: 'metadataServices',
    titleKey: 'settings.services.categoryTitle.metadata',
    headerKey: 'settings.services.header.metadata',
    subHeaderKey: 'settings.services.subheader.metadata',
    emptyTitleKey: 'settings.services.empty.metadata.title',
    emptyDescriptionKey: 'settings.services.empty.metadata.description',
    resourceEntity: 'metadataService',
    entityType: 'metadataService',
    searchIndex: 'metadataService',
  },
  {
    kind: 'search',
    segment: 'search',
    enumValue: 'searchServices',
    titleKey: 'settings.services.categoryTitle.search',
    headerKey: 'settings.services.header.search',
    subHeaderKey: 'settings.services.subheader.search',
    emptyTitleKey: 'settings.services.empty.search.title',
    emptyDescriptionKey: 'settings.services.empty.search.description',
    resourceEntity: 'searchService',
    entityType: 'searchService',
    searchIndex: 'searchService',
    childEntityType: 'searchIndex',
  },
  {
    kind: 'drive',
    segment: 'drives',
    enumValue: 'driveServices',
    titleKey: 'settings.services.categoryTitle.drive',
    headerKey: 'settings.services.header.drive',
    subHeaderKey: 'settings.services.subheader.drive',
    emptyTitleKey: 'settings.services.empty.drive.title',
    emptyDescriptionKey: 'settings.services.empty.drive.description',
    resourceEntity: 'driveService',
    entityType: 'driveService',
    searchIndex: 'driveService',
    childEntityType: 'directory',
  },
  {
    kind: 'security',
    segment: 'security',
    enumValue: 'securityServices',
    titleKey: 'settings.services.categoryTitle.security',
    headerKey: 'settings.services.header.security',
    subHeaderKey: 'settings.services.subheader.security',
    emptyTitleKey: 'settings.services.empty.security.title',
    emptyDescriptionKey: 'settings.services.empty.security.description',
    resourceEntity: 'securityService',
    entityType: 'securityService',
    // Official getSearchIndexFromService has NO security entry: the
    // fallback DATABASE_SERVICE index applies (quirk, copied verbatim).
    searchIndex: 'databaseService',
  },
];

const BY_KIND = new Map(SERVICE_CATEGORY_ROWS.map((row) => [row.kind, row]));
const BY_SEGMENT = new Map(SERVICE_CATEGORY_ROWS.map((row) => [row.segment, row]));
const BY_ENUM_VALUE = new Map(SERVICE_CATEGORY_ROWS.map((row) => [row.enumValue, row]));

export const DATABASE_CATEGORY_ROW = BY_KIND.get('database') as ServiceCategoryRow;

/** Sentinel for "no specific category chosen" (ALL_SERVICES_CATEGORY). */
export const ALL_SERVICES_CATEGORY = 'all' as const;

export function serviceCategoryByKind(kind: string): ServiceCategoryRow | undefined {
  return BY_KIND.get(kind as ServiceCategoryKind);
}

export function serviceCategoryBySegment(segment: string): ServiceCategoryRow | undefined {
  return BY_SEGMENT.get(segment);
}

export function serviceCategoryByEnumValue(enumValue: string): ServiceCategoryRow | undefined {
  return BY_ENUM_VALUE.get(enumValue);
}

/**
 * Resolve a wizard/list route parameter: a mapping-key segment, an enum
 * value, or the 'all' sentinel. Anything else (including llm/mcp
 * segments) resolves to undefined so the caller can NOT_FOUND.
 */
export function resolveServiceCategoryParam(
  param: string | undefined,
): ServiceCategoryRow | typeof ALL_SERVICES_CATEGORY | undefined {
  if (param === undefined) {
    return undefined;
  }
  if (param === ALL_SERVICES_CATEGORY) {
    return ALL_SERVICES_CATEGORY;
  }
  return BY_SEGMENT.get(param) ?? BY_ENUM_VALUE.get(param);
}

/**
 * Pin getResourceEntityFromServiceCategory (ServicePureUtils.ts:171-174),
 * with the map at :135-168 copied key for key — including the segment
 * keys that are MISSING (storages/search/security/drives/mlmodels) and
 * the drive alias segment keys (directories/files/spreadsheets/
 * worksheets) and the searchIndex segment key. The list view gate
 * evaluates with the raw segment; the create gate with the enum value.
 * Unknown input falls back to DATABASE_SERVICE.
 */
const RESOURCE_ENTITY_BY_CATEGORY_MAP: Readonly<Record<string, string>> = {
  dashboards: 'dashboardService',
  dashboardServices: 'dashboardService',
  databases: 'databaseService',
  databaseServices: 'databaseService',
  mlModels: 'mlmodelService',
  mlmodelServices: 'mlmodelService',
  messaging: 'messagingService',
  messagingServices: 'messagingService',
  pipelines: 'pipelineService',
  pipelineServices: 'pipelineService',
  metadata: 'metadataService',
  metadataServices: 'metadataService',
  storageServices: 'storageService',
  searchIndex: 'searchService',
  searchServices: 'searchService',
  apiServices: 'apiService',
  directories: 'driveService',
  files: 'driveService',
  spreadsheets: 'driveService',
  worksheets: 'driveService',
  driveServices: 'driveService',
  securityServices: 'securityService',
};

export function getResourceEntityFromServiceCategory(category: string): string {
  return RESOURCE_ENTITY_BY_CATEGORY_MAP[category] ?? 'databaseService';
}

/**
 * Pin getEntityTypeFromServiceCategory (ServicePureUtils.ts:255-258):
 * all 11 enum values present, unknown falls back to DATABASE_SERVICE.
 */
export function getEntityTypeFromServiceCategory(serviceCategory: string): string {
  return BY_ENUM_VALUE.get(serviceCategory)?.entityType ?? 'databaseService';
}

/**
 * Pin getSearchIndexFromService (ServicePureUtils.ts:317-332): 10 enum
 * entries, no SECURITY_SERVICES, fallback DATABASE_SERVICE. Keyed by
 * enum value only — a raw segment does not hit the map (same as pin,
 * where Services.tsx passes the enum-valued serviceName).
 */
export function getSearchIndexFromService(serviceName: string): string {
  const row = BY_ENUM_VALUE.get(serviceName);
  return row ? row.searchIndex : 'databaseService';
}

/** Pin getServicePageHeader fallback: unknown categories render DATABASES. */
export function getServicePageHeaderKeys(
  serviceName: string,
): { headerKey: string; subHeaderKey: string } {
  const row = BY_ENUM_VALUE.get(serviceName) ?? BY_SEGMENT.get(serviceName);
  const resolved = row ?? DATABASE_CATEGORY_ROW;
  return { headerKey: resolved.headerKey, subHeaderKey: resolved.subHeaderKey };
}

/** Pin getServiceEmptyStateConfig fallback: unknown categories render DATABASE. */
export function getServiceEmptyStateKeys(serviceName: string): {
  titleKey: string;
  descriptionKey: string;
} {
  const row = BY_ENUM_VALUE.get(serviceName) ?? BY_SEGMENT.get(serviceName);
  const resolved = row ?? DATABASE_CATEGORY_ROW;
  return { titleKey: resolved.emptyTitleKey, descriptionKey: resolved.emptyDescriptionKey };
}

/** Wizard category-select order (SERVICE_CATEGORY_TITLE_KEYS entry order). */
export const WIZARD_CATEGORY_ORDER: readonly ServiceCategoryRow[] = SERVICE_CATEGORY_ROWS;
