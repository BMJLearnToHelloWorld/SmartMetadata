/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ResourceEntity } from '@/composables/useEntityPermissions';

/** Official EntityTabs values used by entity version pages. */
export const EntityTabs = {
  SCHEMA: 'schema',
  CUSTOM_PROPERTIES: 'custom_properties',
  DETAILS: 'details',
  TASKS: 'tasks',
  FEATURES: 'features',
  FIELDS: 'fields',
  MODEL: 'model',
  CODE: 'code',
  OVERVIEW: 'overview',
  TABLE: 'table',
  API_ENDPOINT: 'apiEndpoint',
} as const;

export type EntityTabKey = (typeof EntityTabs)[keyof typeof EntityTabs];

/** Types whose versions the official EntityVersionPage parent fetches. */
export const ENTITY_VERSION_PARENT_FETCH_TYPES = [
  'table',
  'topic',
  'dashboard',
  'pipeline',
  'mlmodel',
  'container',
  'searchIndex',
  'dashboardDataModel',
  'storedProcedure',
  'apiEndpoint',
  'metric',
  'chart',
  'directory',
  'file',
  'spreadsheet',
  'worksheet',
] as const;

/** Official self-contained version pages mounted with no parent-fetched props. */
export const ENTITY_VERSION_SELF_CONTAINED_TYPES = [
  'database',
  'databaseSchema',
  'apiCollection',
] as const;

/** Official maps dataProduct to the regular data-product page, not a version UI. */
export const ENTITY_VERSION_REGULAR_DETAIL_TYPES = ['dataProduct'] as const;

export const PARENT_FETCH_TYPE_SET = new Set<string>(ENTITY_VERSION_PARENT_FETCH_TYPES);
export const SELF_CONTAINED_TYPE_SET = new Set<string>(ENTITY_VERSION_SELF_CONTAINED_TYPES);
export const REGULAR_DETAIL_TYPE_SET = new Set<string>(ENTITY_VERSION_REGULAR_DETAIL_TYPES);

export interface EntityVersionMainTab {
  key: string;
  labelKey: string;
}

/** Official main-tab key and i18n label for each type page. */
export const ENTITY_VERSION_MAIN_TAB: Record<string, EntityVersionMainTab> = {
  table: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  topic: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  dashboard: { key: EntityTabs.DETAILS, labelKey: 'label.detail-plural' },
  pipeline: { key: EntityTabs.TASKS, labelKey: 'label.task-plural' },
  mlmodel: { key: EntityTabs.FEATURES, labelKey: 'label.feature-plural' },
  container: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  searchIndex: { key: EntityTabs.FIELDS, labelKey: 'label.fields' },
  dashboardDataModel: { key: EntityTabs.MODEL, labelKey: 'label.model' },
  storedProcedure: { key: EntityTabs.CODE, labelKey: 'label.code' },
  apiEndpoint: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  metric: { key: EntityTabs.OVERVIEW, labelKey: 'label.overview' },
  chart: { key: EntityTabs.DETAILS, labelKey: 'label.detail-plural' },
  directory: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  file: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  spreadsheet: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  worksheet: { key: EntityTabs.SCHEMA, labelKey: 'label.schema' },
  database: { key: EntityTabs.SCHEMA, labelKey: 'label.schema-plural' },
  databaseSchema: { key: EntityTabs.TABLE, labelKey: 'label.table-plural' },
  apiCollection: { key: EntityTabs.API_ENDPOINT, labelKey: 'label.endpoint-plural' },
};

export const ENTITY_VERSION_CONTENT: Record<string, string> = {
  table: 'columns',
  topic: 'topic-schema',
  dashboard: 'charts',
  pipeline: 'tasks',
  mlmodel: 'features',
  container: 'columns',
  searchIndex: 'columns',
  dashboardDataModel: 'columns',
  storedProcedure: 'code',
  apiEndpoint: 'api-schema',
  metric: 'metric-overview',
  chart: 'charts',
  directory: 'children',
  file: 'children',
  spreadsheet: 'children',
  worksheet: 'columns',
  database: 'schemas',
  databaseSchema: 'tables',
  apiCollection: 'endpoints',
};

/**
 * Official entityUtilClassBase.getResourceEntityFromEntityType: these
 * EntityType values are already the ResourceEntity token the permissions
 * API evaluates.
 */
export function getResourceEntityFromEntityType(entityType: string): ResourceEntity {
  return entityType as ResourceEntity;
}

export function isParentFetchedVersionType(entityType: string): boolean {
  return PARENT_FETCH_TYPE_SET.has(entityType);
}

export function isSelfContainedVersionType(entityType: string): boolean {
  return SELF_CONTAINED_TYPE_SET.has(entityType);
}

export function isRegularDetailVersionType(entityType: string): boolean {
  return REGULAR_DETAIL_TYPE_SET.has(entityType);
}
