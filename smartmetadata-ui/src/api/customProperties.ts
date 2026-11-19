/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateCustomPropertyRequest,
  CustomPropertyConfig,
  CustomPropertyDef,
  MetadataType,
} from '@/types/collaboration';
import { ApiError, apiRequest } from './client';

/** TypeResource list filter for entity types that may carry customProperties. */
export const ENTITY_TYPE_CATEGORY = 'entity';
/** TypeResource category for property types (string, integer, …). */
export const FIELD_TYPE_CATEGORY = 'field';
/** Detail fetch fields (official getTypeByFQN: only `customProperties`). */
export const TYPE_FIELDS = 'customProperties';

export interface ListMetadataTypesQuery {
  category?: string;
  /** String or number; the official property-type list sends the string `'20'`. */
  limit?: number | string;
  after?: string;
  /**
   * Fields to request; defaults to TYPE_FIELDS. Pass `null` to omit the
   * fields parameter entirely (official getTypeListByCategory sends none).
   */
  fields?: string | null;
}

function mapCustomPropertyConfig(raw: unknown): CustomPropertyConfig | undefined {
  const rec = asRecord(raw);
  if (!rec || !('config' in rec)) {
    return undefined;
  }
  const config = rec.config;
  if (typeof config === 'string') {
    return { config };
  }
  if (Array.isArray(config)) {
    return { config: config.filter((item): item is string => typeof item === 'string') };
  }
  const configRec = asRecord(config);
  if (!configRec) {
    return undefined;
  }
  const values = Array.isArray(configRec.values)
    ? configRec.values.filter((item): item is string => typeof item === 'string')
    : undefined;
  const columns = Array.isArray(configRec.columns)
    ? configRec.columns.filter((item): item is string => typeof item === 'string')
    : undefined;
  const multiSelect = asBoolean(configRec.multiSelect);
  if (values === undefined && columns === undefined && multiSelect === undefined) {
    return undefined;
  }
  return { config: { values, columns, multiSelect } };
}

export function mapCustomProperty(raw: Record<string, unknown>): CustomPropertyDef | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const propertyType = asRecord(raw.propertyType);
  return {
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    propertyType: propertyType
      ? asString(propertyType.name) || asString(propertyType.fullyQualifiedName) || undefined
      : asString(raw.propertyType) || undefined,
    customPropertyConfig: mapCustomPropertyConfig(raw.customPropertyConfig),
  };
}

/**
 * Official getPropertyConfigSummary (CustomPropertyTable.utils.ts, pin
 * a3012259ca), label-free: the caller maps `kind` through i18n. String
 * config is a format, an array is entity types, `columns` is table columns,
 * `values` is an enum (multi- or single-select).
 */
export type CustomPropertyConfigKind = 'format' | 'entityTypes' | 'columns' | 'values';

export interface CustomPropertyConfigSummary {
  kind: CustomPropertyConfigKind;
  multiSelect: boolean;
  values: string[];
  testId: string;
}

export function getPropertyConfigSummary(
  property: CustomPropertyDef,
): CustomPropertyConfigSummary | undefined {
  const config = property.customPropertyConfig?.config;
  if (typeof config === 'string') {
    return config
      ? { kind: 'format', multiSelect: false, values: [config], testId: `${property.name}-config` }
      : undefined;
  }
  if (Array.isArray(config)) {
    return config.length > 0
      ? {
          kind: 'entityTypes',
          multiSelect: false,
          values: config.map((entityType) => startCase(entityType)),
          testId: `${property.name}-config`,
        }
      : undefined;
  }
  if (config?.columns) {
    return { kind: 'columns', multiSelect: false, values: config.columns, testId: 'table-config' };
  }
  if (config?.values) {
    return {
      kind: 'values',
      multiSelect: config.multiSelect === true,
      values: config.values,
      testId: 'enum-config',
    };
  }
  return undefined;
}

/**
 * Lodash `startCase` equivalent (official code uses lodash startCase for
 * tab breadcrumbs, config values, and type-select labels): split into
 * words on camelCase/separator boundaries and capitalize every word.
 * Discriminator: `foo_bar` → "Foo Bar" (not "Foo bar").
 */
export function startCase(value: string): string {
  const words = value.match(
    /[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g,
  );
  if (!words) {
    return '';
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Stage 3 write side (Wave 2 G-23): official customPropertyConfig forms,
 * ported from pin a3012259ca
 * (`components/discovery/personal-space/Profile/tabs/custom-properties/CustomPropertiesPanel.utils.ts`
 * + `CustomPropertyFormFields.tsx` + `constants/CustomProperty.constants.ts`
 * + `constants/regex.constants.ts`). ADR:2026-11-08-custom-properties-s3-config-write-side.
 */

/** Official CUSTOM_PROPERTY_NAME_REGEX (constants/regex.constants.ts). */
export const CUSTOM_PROPERTY_NAME_REGEX =
  /^[A-Za-z0-9][A-Za-z0-9 _\-.,;%#@!'(){}[\]|=+?`]*$/;
/** Official name maxLength (CustomPropertyFormFields.tsx nameField). */
export const CUSTOM_PROPERTY_NAME_MAX_LENGTH = 256;
/** Official PROPERTY_TYPES_WITH_FORMAT. */
export const PROPERTY_TYPES_WITH_FORMAT = ['date-cp', 'dateTime-cp', 'time-cp'];
/** Official PROPERTY_TYPES_WITH_ENTITY_REFERENCE. */
export const PROPERTY_TYPES_WITH_ENTITY_REFERENCE = ['entityReference', 'entityReferenceList'];
/** Official TABLE_TYPE_CUSTOM_PROPERTY. */
export const TABLE_TYPE_CUSTOM_PROPERTY = 'table-cp';
/** Official ENUM_CONFIG_MAX_VISIBLE_VALUES (edit form only). */
export const ENUM_CONFIG_MAX_VISIBLE_VALUES = 20;
/** Official RESERVED_TABLE_COLUMN_NAMES. */
export const RESERVED_TABLE_COLUMN_NAMES = ['__row_id__'];
/** Official MAX_COLUMNS for the table config (columnsField validate). */
export const MAX_TABLE_CONFIG_COLUMNS = 3;

/**
 * Official SUPPORTED_FORMAT_MAP (constants/CustomProperty.constants.ts).
 * Note the review's "dateTime-cp 9 种" is a miscount: the pin file lists
 * 8 dateTime formats; this map copies the pin file verbatim.
 */
export const SUPPORTED_FORMAT_MAP: Readonly<Record<string, readonly string[]>> = {
  'date-cp': [
    'yyyy-MM-dd',
    'dd MMM yyyy',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'yyyyDDD',
    'd MMMM yyyy',
  ],
  'dateTime-cp': [
    'MMM dd HH:mm:ss yyyy',
    'yyyy-MM-dd HH:mm:ss',
    'MM/dd/yyyy HH:mm:ss',
    'dd/MM/yyyy HH:mm:ss',
    'dd-MM-yyyy HH:mm:ss',
    'yyyy-MM-dd HH:mm:ss.SSS',
    'yyyy-MM-dd HH:mm:ss.SSSSSS',
    'dd MMMM yyyy HH:mm:ss',
  ],
  'time-cp': ['HH:mm:ss'],
};

/** Official ENTITY_REFERENCE_OPTIONS (16 items, pin order; tag included). */
export const ENTITY_REFERENCE_TYPES: readonly string[] = [
  'table',
  'storedProcedure',
  'databaseSchema',
  'database',
  'dashboard',
  'dashboardDataModel',
  'pipeline',
  'topic',
  'container',
  'searchIndex',
  'mlmodel',
  'glossaryTerm',
  'tag',
  'user',
  'team',
  'metric',
];

/** Official ENTITY_REFERENCE_OPTIONS labels (fallback when no i18n key exists). */
export const ENTITY_REFERENCE_LABELS: Readonly<Record<string, string>> = {
  table: 'Table',
  storedProcedure: 'Stored Procedure',
  databaseSchema: 'Database Schema',
  database: 'Database',
  dashboard: 'Dashboard',
  dashboardDataModel: 'Dashboard DataModel',
  pipeline: 'Pipeline',
  topic: 'Topic',
  container: 'Container',
  searchIndex: 'Search Index',
  mlmodel: 'MLmodel',
  glossaryTerm: 'Glossary Term',
  tag: 'Tag',
  user: 'User',
  team: 'Team',
  metric: 'Metric',
};

/** Official getEntityName (utils/EntityNameUtils.ts): displayName, else name. */
export function getEntityName(entity: { name?: string; displayName?: string }): string {
  return entity.displayName || entity.name || '';
}

/**
 * Official property-type badge metadata
 * (CustomPropertyCard.constants.ts CUSTOM_PROPERTY_BADGE_COLOR_MAP, pin
 * a3012259ca): one entry per mapped property type, keyed by type name.
 * `color` is the pin color role; the view expresses it with dev_ui tokens.
 * `labelKey` is the official i18n key for the badge label.
 */
export interface CustomPropertyTypeBadgeMeta {
  color: string;
  labelKey: string;
  isWide?: boolean;
}

export const CUSTOM_PROPERTY_TYPE_BADGE_META: Readonly<
  Record<string, CustomPropertyTypeBadgeMeta>
> = {
  string: { color: 'gray-blue', labelKey: 'label.string' },
  integer: { color: 'blue-light', labelKey: 'label.integer' },
  number: { color: 'blue-light', labelKey: 'label.number' },
  email: { color: 'pink', labelKey: 'label.email' },
  'date-cp': { color: 'orange', labelKey: 'label.date' },
  'dateTime-cp': { color: 'orange', labelKey: 'label.date-and-time' },
  'time-cp': { color: 'orange', labelKey: 'label.time' },
  timestamp: { color: 'warning', labelKey: 'label.timestamp' },
  duration: { color: 'warning', labelKey: 'label.duration' },
  enum: { color: 'purple', labelKey: 'label.enum' },
  'hyperlink-cp': { color: 'blue', labelKey: 'label.hyperlink' },
  entityReference: { color: 'indigo', labelKey: 'label.entity-ref' },
  entityReferenceList: { color: 'indigo', labelKey: 'label.entity-ref-list' },
  timeInterval: { color: 'brand', labelKey: 'label.time-interval', isWide: true },
  'table-cp': { color: 'error', labelKey: 'label.table', isWide: true },
  sqlQuery: { color: 'success', labelKey: 'label.sql-uppercase', isWide: true },
  markdown: { color: 'gray', labelKey: 'label.markdown', isWide: true },
};

/** Official DEFAULT_CUSTOM_PROPERTY_BADGE_META (fallback for unmapped types). */
export const DEFAULT_CUSTOM_PROPERTY_TYPE_BADGE_META: CustomPropertyTypeBadgeMeta = {
  color: 'gray',
  labelKey: 'label.value',
};

export interface CustomPropertyTypeBadge {
  color: string;
  /** Official label key when the type is mapped; absent for the fallback. */
  labelKey?: string;
  /** startCase fallback label for unmapped types (empty when mapped). */
  fallbackLabel: string;
  isWide: boolean;
}

/**
 * Official getPropertyTypeBadge (CustomPropertyTable.utils.ts): mapped
 * types use the badge table; unmapped types fall back to the default gray
 * color with a startCase label derived from the type name (`-cp` removed).
 * The caller resolves `labelKey` through i18n, else uses `fallbackLabel`.
 */
export function getPropertyTypeBadge(
  propertyTypeName: string | undefined,
): CustomPropertyTypeBadge {
  const meta = propertyTypeName ? CUSTOM_PROPERTY_TYPE_BADGE_META[propertyTypeName] : undefined;
  if (meta) {
    return { color: meta.color, labelKey: meta.labelKey, fallbackLabel: '', isWide: meta.isWide === true };
  }
  return {
    color: DEFAULT_CUSTOM_PROPERTY_TYPE_BADGE_META.color,
    fallbackLabel: startCase((propertyTypeName ?? '').replace(/-cp/g, '')),
    isWide: false,
  };
}

/**
 * Official custom-properties page headers
 * (utils/CustomProperty.utils.ts getCustomPropertyPageHeaderFromEntity +
 * constants/PageHeaders.constant.ts, pin a3012259ca), keyed by entity type
 * name (ENTITY_PATH value). `subHeaderEntityKey` is the label key passed as
 * the `entity` param of `message.define-custom-property-for-entity`;
 * absent only for the column header, whose subHeader takes no params.
 */
export interface CustomPropertyPageHeader {
  headerKey: string;
  subHeaderKey: string;
  subHeaderEntityKey?: string;
}

export const CUSTOM_PROPERTY_PAGE_HEADERS: Readonly<
  Record<string, CustomPropertyPageHeader>
> = {
  table: {
    headerKey: 'label.table-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.table-plural',
  },
  topic: {
    headerKey: 'label.topic-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.topic-plural',
  },
  dashboard: {
    headerKey: 'label.dashboard-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.dashboard-plural',
  },
  dashboardDataModel: {
    headerKey: 'label.dashboard-data-model-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.dashboard-data-model-plural',
  },
  dataProduct: {
    headerKey: 'label.data-product-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.data-product-plural',
  },
  pipeline: {
    headerKey: 'label.pipeline-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.pipeline-plural',
  },
  mlmodel: {
    headerKey: 'label.ml-model-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.ml-model-plural',
  },
  container: {
    headerKey: 'label.container-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.container-plural',
  },
  storedProcedure: {
    headerKey: 'label.stored-procedure-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.stored-procedure-plural',
  },
  domain: {
    headerKey: 'label.domain-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.domain-plural',
  },
  searchIndex: {
    headerKey: 'label.search-index-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.search-index-plural',
  },
  glossaryTerm: {
    headerKey: 'label.glossary-term',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.glossary-term',
  },
  database: {
    headerKey: 'label.database',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.database',
  },
  databaseSchema: {
    headerKey: 'label.database-schema',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.database-schema',
  },
  apiCollection: {
    headerKey: 'label.api-collection-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.api-collection-plural',
  },
  apiEndpoint: {
    headerKey: 'label.api-endpoint-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.api-endpoint-plural',
  },
  metric: {
    headerKey: 'label.metric-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.metric-plural',
  },
  chart: {
    headerKey: 'label.chart-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.chart-plural',
  },
  directory: {
    headerKey: 'label.directory-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.directory-plural',
  },
  file: {
    headerKey: 'label.file-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.file-plural',
  },
  spreadsheet: {
    headerKey: 'label.spreadsheet-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.spreadsheet-plural',
  },
  worksheet: {
    headerKey: 'label.worksheet-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.worksheet-plural',
  },
  team: {
    headerKey: 'label.team-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.team-plural',
  },
  page: {
    headerKey: 'label.article-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.article-plural',
  },
  tableColumn: {
    headerKey: 'label.column-plural',
    subHeaderKey: 'message.define-custom-property-for-column',
  },
  user: {
    headerKey: 'label.user-plural',
    subHeaderKey: 'message.define-custom-property-for-entity',
    subHeaderEntityKey: 'label.user-plural',
  },
};

/**
 * Official getCustomPropertyPageHeaderFromEntity: unmapped entity types
 * fall back to the Tables header.
 */
export function getCustomPropertyPageHeader(entityType: string): CustomPropertyPageHeader {
  return CUSTOM_PROPERTY_PAGE_HEADERS[entityType] ?? CUSTOM_PROPERTY_PAGE_HEADERS.table!;
}

/**
 * Reverse of the official ENTITY_PATH map (constants.ts): entity type name
 * → settings route segment. Used to derive the breadcrumb entity name
 * (`startCase(segment)`) while the detail route still carries the type
 * name; unmapped types fall back to the type name itself.
 */
export const CUSTOM_PROPERTY_ROUTE_SEGMENT_BY_TYPE: Readonly<Record<string, string>> = {
  table: 'tables',
  topic: 'topics',
  dashboard: 'dashboards',
  dashboardDataModel: 'dashboardDataModels',
  dataProduct: 'dataProducts',
  pipeline: 'pipelines',
  mlmodel: 'mlmodels',
  container: 'containers',
  storedProcedure: 'storedProcedures',
  domain: 'domains',
  searchIndex: 'searchIndexes',
  glossaryTerm: 'glossaryTerm',
  database: 'databases',
  databaseSchema: 'databaseSchemas',
  apiCollection: 'apiCollections',
  apiEndpoint: 'apiEndpoints',
  metric: 'metrics',
  chart: 'charts',
  directory: 'directories',
  file: 'files',
  spreadsheet: 'spreadsheets',
  worksheet: 'worksheets',
  team: 'teams',
  page: 'articles',
  tableColumn: 'column',
  user: 'users',
};

export function getCustomPropertyRouteSegment(entityType: string): string {
  return CUSTOM_PROPERTY_ROUTE_SEGMENT_BY_TYPE[entityType] ?? entityType;
}

/** Official ADD_CUSTOM_PROPERTIES_DOCS (docs.open-metadata.org default base URL). */
export const ADD_CUSTOM_PROPERTIES_DOCS =
  'https://docs.open-metadata.org/latest/how-to-guides/guide-for-data-users/custom';

export interface CustomPropertyTypeFlags {
  hasEnumConfig: boolean;
  hasFormatConfig: boolean;
  hasEntityReferenceConfig: boolean;
  hasTableTypeConfig: boolean;
  supportedFormats: readonly string[];
}

/**
 * Official getCustomPropertyTypeFlags, taking the type name directly: the
 * product resolves the name from the selected field-type option, so the
 * pin's Type[] lookup is unnecessary here.
 */
export function getCustomPropertyTypeFlags(propertyTypeName: string): CustomPropertyTypeFlags {
  return {
    hasEnumConfig: propertyTypeName === 'enum',
    hasFormatConfig: PROPERTY_TYPES_WITH_FORMAT.includes(propertyTypeName),
    hasEntityReferenceConfig: PROPERTY_TYPES_WITH_ENTITY_REFERENCE.includes(propertyTypeName),
    hasTableTypeConfig: propertyTypeName === TABLE_TYPE_CUSTOM_PROPERTY,
    supportedFormats: SUPPORTED_FORMAT_MAP[propertyTypeName] ?? [],
  };
}

/**
 * Official property-type dropdown label (CustomPropertyFormFields.tsx):
 * `startCase(displayName || name with '-cp' removed)`. There is no
 * sqlQuery special case on this surface; the badge table's "SQL" label
 * applies only to the table Type column and the type filter.
 */
export function propertyTypeLabel(name: string, displayName: string | undefined): string {
  return startCase(getEntityName({ name, displayName }).replaceAll('-cp', ''));
}

export interface CustomPropertyConfigFormValues {
  enumConfig?: string[];
  multiSelect?: boolean;
  formatConfig?: string;
  entityReferenceConfig?: string[];
  columns?: string[];
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Official buildCustomPropertyConfig (CustomPropertiesPanel.utils.ts:43-69).
 * The create path preserves order and duplicates: no deduplication on the
 * enum or columns branches (deduplication lives only on the edit path,
 * in getCustomPropertyChanges).
 */
export function buildCustomPropertyConfig(
  values: CustomPropertyConfigFormValues,
  flags: CustomPropertyTypeFlags,
): CustomPropertyConfig | undefined {
  if (flags.hasEnumConfig) {
    return {
      config: {
        multiSelect: Boolean(values.multiSelect),
        values: (values.enumConfig ?? []).map(toId),
      },
    };
  }
  if (flags.hasFormatConfig && values.formatConfig) {
    return { config: toId(values.formatConfig) };
  }
  if (flags.hasEntityReferenceConfig && values.entityReferenceConfig) {
    return { config: values.entityReferenceConfig.map(toId) };
  }
  if (flags.hasTableTypeConfig && values.columns) {
    return { config: { columns: values.columns.map(toId) } };
  }
  return undefined;
}

/**
 * Official toId (CustomPropertiesPanel.utils.ts:35-41): extracts the id
 * from a select option. Product form values are already id strings, so
 * the mapping passes them through unchanged, preserving order and
 * duplicates.
 */
function toId(value: string): string {
  return value;
}

/** Form values for one custom property (create and edit share the shape). */
export interface CustomPropertyFormValues extends CustomPropertyConfigFormValues {
  name: string;
  displayName: string;
  description: string;
  propertyTypeName: string;
  enumConfig: string[];
  multiSelect: boolean;
  formatConfig: string;
  entityReferenceConfig: string[];
  columns: string[];
}

/**
 * Official toCustomPropertyPayload (CustomPropertiesPanel.utils.ts:92-123):
 * condition fields stay out of the top level, `propertyType: { id, type:
 * 'type' }` (no `name`), `displayName || undefined`, undefined fields
 * omitted, no trimming. `CreateCustomPropertyRequest.propertyType.name`
 * is optional to match that payload shape.
 */
export function toCustomPropertyPayload(
  values: CustomPropertyFormValues,
  propertyType: { id: string; name: string },
): CreateCustomPropertyRequest {
  const flags = getCustomPropertyTypeFlags(propertyType.name);
  const customPropertyConfig = buildCustomPropertyConfig(values, flags);
  const payload = {
    name: values.name,
    description: values.description,
    propertyType: { id: propertyType.id, type: 'type' as const },
    ...(values.displayName ? { displayName: values.displayName } : {}),
    ...(customPropertyConfig ? { customPropertyConfig } : {}),
  };
  return payload;
}

export type CustomPropertyFormField =
  | 'name'
  | 'displayName'
  | 'description'
  | 'propertyType'
  | 'enumConfig'
  | 'multiSelect'
  | 'formatConfig'
  | 'entityReferenceConfig'
  | 'columns';

/** Translated field labels the validators interpolate into message params. */
export interface CustomPropertyFieldLabels {
  name: string;
  displayName: string;
  description: string;
  propertyType: string;
  enumConfig: string;
  formatConfig: string;
  entityReferenceConfig: string;
  columns: string;
}

export interface CustomPropertyFormIssue {
  field: CustomPropertyFormField;
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Create-form validation, mirroring official CustomPropertyFormFields
 * rules (required + 256 + name regex; enum / entity-reference / columns
 * required when their type is selected; format validated only when a
 * value is present). There is no uniqueness rule and no format-required
 * rule in the pin. Values are used as-is; the pin trims nothing.
 * Returns issues in field order; empty means valid.
 */
export function validateCustomPropertyForm(
  values: CustomPropertyFormValues,
  fieldLabels: CustomPropertyFieldLabels,
): CustomPropertyFormIssue[] {
  const issues: CustomPropertyFormIssue[] = [];
  if (!values.name) {
    issues.push({
      field: 'name',
      key: 'label.field-required',
      params: { field: fieldLabels.name },
    });
  } else {
    if (values.name.length > CUSTOM_PROPERTY_NAME_MAX_LENGTH) {
      issues.push({
        field: 'name',
        key: 'message.entity-size-in-between',
        params: { entity: fieldLabels.name, min: 1, max: CUSTOM_PROPERTY_NAME_MAX_LENGTH },
      });
    }
    if (!CUSTOM_PROPERTY_NAME_REGEX.test(values.name)) {
      issues.push({ field: 'name', key: 'message.custom-property-name-validation' });
    }
  }
  if (!values.description) {
    issues.push({
      field: 'description',
      key: 'label.field-required',
      params: { field: fieldLabels.description },
    });
  }
  if (!values.propertyTypeName) {
    issues.push({
      field: 'propertyType',
      key: 'label.field-required',
      params: { field: fieldLabels.propertyType },
    });
    return issues;
  }
  const flags = getCustomPropertyTypeFlags(values.propertyTypeName);
  if (flags.hasEnumConfig && values.enumConfig.length === 0) {
    issues.push({
      field: 'enumConfig',
      key: 'label.field-required',
      params: { field: fieldLabels.enumConfig },
    });
  }
  if (flags.hasFormatConfig && values.formatConfig && !flags.supportedFormats.includes(values.formatConfig)) {
    issues.push({
      field: 'formatConfig',
      key: 'label.field-invalid',
      params: { field: fieldLabels.formatConfig },
    });
  }
  if (flags.hasEntityReferenceConfig && values.entityReferenceConfig.length === 0) {
    issues.push({
      field: 'entityReferenceConfig',
      key: 'label.field-required',
      params: { field: fieldLabels.entityReferenceConfig },
    });
  }
  if (flags.hasTableTypeConfig) {
    if (values.columns.length === 0) {
      issues.push({
        field: 'columns',
        key: 'label.field-required',
        params: { field: fieldLabels.columns },
      });
    } else {
      if (values.columns.length > MAX_TABLE_CONFIG_COLUMNS) {
        issues.push({
          field: 'columns',
          key: 'message.maximum-count-allowed',
          params: { count: MAX_TABLE_CONFIG_COLUMNS, label: fieldLabels.columns },
        });
      }
      if (values.columns.some((column) => RESERVED_TABLE_COLUMN_NAMES.includes(column))) {
        issues.push({
          field: 'columns',
          key: 'message.reserved-column-name',
          params: { name: RESERVED_TABLE_COLUMN_NAMES.join(', ') },
        });
      }
    }
  }
  return issues;
}

export interface CustomPropertyEditFormValues {
  displayName: string;
  description: string;
  enumConfig: string[];
  multiSelect: boolean;
  entityReferenceConfig: string[];
}

/**
 * Official getEditFormValues (CustomPropertyEditForm.utils.ts): only the
 * enum and entity-reference configs are editable; format and table configs
 * have no edit controls and are left untouched by the edit path.
 */
export function getEditFormValues(property: CustomPropertyDef): CustomPropertyEditFormValues {
  const config = property.customPropertyConfig?.config;
  const isEnum = property.propertyType === 'enum';
  const isEntityRef = PROPERTY_TYPES_WITH_ENTITY_REFERENCE.includes(property.propertyType ?? '');
  const enumConfig =
    isEnum && config && typeof config === 'object' && !Array.isArray(config)
      ? config
      : undefined;
  return {
    displayName: property.displayName ?? '',
    description: property.description ?? '',
    enumConfig: [...(enumConfig?.values ?? [])],
    multiSelect: enumConfig?.multiSelect === true,
    entityReferenceConfig: isEntityRef && Array.isArray(config) ? [...config] : [],
  };
}

/** Official CustomPropertyChanges (metadataTypeAPI.ts): the editable fields. */
export interface CustomPropertyChanges {
  displayName?: string;
  description: string;
  customPropertyConfig?: CustomPropertyConfig;
}

/**
 * Official getCustomPropertyChanges (CustomPropertyEditForm.utils.ts):
 * only the enum and entity-reference configs are edited here; leaving the
 * config unset for other types keeps a concurrent config change intact.
 * Entity-reference types are additive: a saved type stays even if dropped
 * from the selection. An unchanged displayName is undefined, never an
 * empty-string add op.
 */
export function getCustomPropertyChanges(
  property: CustomPropertyDef,
  values: CustomPropertyEditFormValues,
): CustomPropertyChanges {
  let customPropertyConfig: CustomPropertyConfig | undefined;
  const isEnum = property.propertyType === 'enum';
  const isEntityRef = PROPERTY_TYPES_WITH_ENTITY_REFERENCE.includes(property.propertyType ?? '');
  if (isEnum) {
    customPropertyConfig = {
      config: {
        multiSelect: Boolean(values.multiSelect),
        values: uniq(values.enumConfig),
      },
    };
  } else if (isEntityRef) {
    const saved = getEditFormValues(property).entityReferenceConfig;
    customPropertyConfig = { config: uniq([...saved, ...values.entityReferenceConfig]) };
  }
  return {
    displayName:
      values.displayName === (property.displayName ?? '')
        ? undefined
        : values.displayName,
    description: values.description,
    ...(customPropertyConfig ? { customPropertyConfig } : {}),
  };
}

/**
 * Edit-form validation, mirroring official CustomPropertyEditForm rules:
 * description is required; enum values are required for enum properties;
 * entity-reference types are required for entity-reference properties.
 * Display name is optional; format and table configs have no edit
 * controls. Returns issues in field order; empty means valid.
 */
export function validateCustomPropertyEditForm(
  values: CustomPropertyEditFormValues,
  property: CustomPropertyDef,
  fieldLabels: CustomPropertyFieldLabels,
): CustomPropertyFormIssue[] {
  const issues: CustomPropertyFormIssue[] = [];
  const isEnum = property.propertyType === 'enum';
  const isEntityRef = PROPERTY_TYPES_WITH_ENTITY_REFERENCE.includes(property.propertyType ?? '');
  if (isEnum && values.enumConfig.length === 0) {
    issues.push({
      field: 'enumConfig',
      key: 'label.field-required',
      params: { field: fieldLabels.enumConfig },
    });
  }
  if (isEntityRef && values.entityReferenceConfig.length === 0) {
    issues.push({
      field: 'entityReferenceConfig',
      key: 'label.field-required',
      params: { field: fieldLabels.entityReferenceConfig },
    });
  }
  if (!values.description) {
    issues.push({
      field: 'description',
      key: 'label.field-required',
      params: { field: fieldLabels.description },
    });
  }
  return issues;
}

/** Key-order-insensitive deep equality for JSON values (undefined keys count as absent). */
function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => jsonEquals(item, b[index]))
    );
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord).filter((key) => aRecord[key] !== undefined);
    const bKeys = Object.keys(bRecord).filter((key) => bRecord[key] !== undefined);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => jsonEquals(aRecord[key], bRecord[key]))
    );
  }
  return false;
}

/**
 * Hand-written equivalent of fast-json-patch `compare` for the three
 * editable fields: an unchanged field emits no op; a field absent from the
 * server copy emits `add`, otherwise `replace`.
 */
function diffCustomPropertyChanges(
  property: CustomPropertyDef,
  changes: CustomPropertyChanges,
  path: string,
): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  (['displayName', 'description', 'customPropertyConfig'] as const).forEach((field) => {
    const next = changes[field];
    if (next === undefined) {
      return;
    }
    const current = property[field];
    if (jsonEquals(current ?? null, next)) {
      return;
    }
    ops.push({
      op: current === undefined ? 'add' : 'replace',
      path: `${path}/${field}`,
      value: next,
    });
  });
  return ops;
}

/**
 * Official matchesSearch (CustomPropertyTable.utils.ts): name and display
 * name match; description does not participate.
 */
export function filterCustomProperties(
  properties: CustomPropertyDef[],
  searchText: string,
  propertyTypeNames: string[] = [],
): CustomPropertyDef[] {
  const query = searchText.trim().toLowerCase();
  return properties.filter((property) => {
    if (propertyTypeNames.length > 0 && !propertyTypeNames.includes(property.propertyType ?? '')) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      property.name.toLowerCase().includes(query) ||
      (property.displayName ?? '').toLowerCase().includes(query)
    );
  });
}

/**
 * Official columnSorter (utils/EntitySortUtils.ts): compare by entity
 * name (displayName, else name).
 */
export function customPropertySorter(a: CustomPropertyDef, b: CustomPropertyDef): number {
  return getEntityName(a).localeCompare(getEntityName(b));
}

export interface CustomPropertyTypeOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Official getPropertyTypeOptions: one option per property type present
 * in the current definitions, sorted by resolved label, with a count.
 * Types whose last property was removed drop out of the active filter
 * (callers intersect the selection with these values). Labels come from
 * the badge evaluator via `resolveBadgeLabel` (the caller resolves the
 * badge label key through i18n, else the fallback label).
 */
export function getPropertyTypeOptions(
  properties: CustomPropertyDef[],
  resolveBadgeLabel: (badge: CustomPropertyTypeBadge) => string,
): CustomPropertyTypeOption[] {
  const options = new Map<string, CustomPropertyTypeOption>();
  for (const property of properties) {
    if (!property.propertyType) {
      continue;
    }
    const option = options.get(property.propertyType);
    if (option) {
      option.count += 1;
    } else {
      options.set(property.propertyType, {
        value: property.propertyType,
        label: resolveBadgeLabel(getPropertyTypeBadge(property.propertyType)),
        count: 1,
      });
    }
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function mapMetadataType(raw: Record<string, unknown>): MetadataType | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const rows = Array.isArray(raw.customProperties) ? raw.customProperties : [];
  return {
    id: asString(raw.id) || undefined,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    category: asString(raw.category) || undefined,
    nameSpace: asString(raw.nameSpace) || undefined,
    schema: asString(raw.schema) || undefined,
    customProperties: rows.flatMap((item) => {
      const rec = asRecord(item);
      const mapped = rec ? mapCustomProperty(rec) : null;
      return mapped ? [mapped] : [];
    }),
  };
}

export function listMetadataTypes(query: ListMetadataTypesQuery = {}): Promise<Paged<MetadataType>> {
  return apiRequest<unknown>('/v1/metadata/types', {
    query: {
      category: query.category ?? ENTITY_TYPE_CATEGORY,
      fields: query.fields === null ? undefined : (query.fields ?? TYPE_FIELDS),
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapMetadataType));
}

export async function listCustomProperties(entityType: string): Promise<CustomPropertyDef[]> {
  const payload = await apiRequest<unknown>(
    `/v1/metadata/types/name/${encodeURIComponent(entityType)}/customProperties`,
  );
  const rows = Array.isArray(payload) ? payload : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const mapped = rec ? mapCustomProperty(rec) : null;
    return mapped ? [mapped] : [];
  });
}

export async function getMetadataTypeByName(name: string): Promise<MetadataType> {
  const raw = await apiRequest<unknown>(`/v1/metadata/types/name/${encodeURIComponent(name)}`, {
    query: { fields: TYPE_FIELDS },
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapMetadataType(rec) : null;
  if (!mapped) {
    throw new Error('Type response was missing name');
  }
  return mapped;
}

/**
 * Property types usable as CustomProperty.propertyType (category=field).
 * Official getTypeListByCategory sends `limit: '20'` and no fields.
 */
export function listPropertyTypes(limit: number | string = '20'): Promise<Paged<MetadataType>> {
  return listMetadataTypes({ category: FIELD_TYPE_CATEGORY, limit, fields: null });
}

/**
 * Apache TypeResource.addOrUpdateProperty —
 * PUT /v1/metadata/types/{id} with CustomProperty body. The response is
 * ignored by the caller (official addPropertyToEntity: the page shows the
 * success toast and refetches); a missing or unusable response body is
 * not an error.
 */
export async function addOrUpdateCustomProperty(
  typeId: string,
  body: CreateCustomPropertyRequest,
): Promise<void> {
  await apiRequest<unknown>(`/v1/metadata/types/${encodeURIComponent(typeId)}`, {
    method: 'PUT',
    json: body,
  });
}

/** Official MAX_CUSTOM_PROPERTY_PATCH_ATTEMPTS (metadataTypeAPI.ts:126). */
export const MAX_CUSTOM_PROPERTY_PATCH_ATTEMPTS = 3;

interface JsonPatchOperation {
  op: string;
  path: string;
  value?: unknown;
}

/**
 * Official patchCustomPropertyByName (metadataTypeAPI.ts:126-187), ported
 * verbatim in semantics. JSON Patch (RFC 6902) cannot address an array
 * element by name, so the patch is built from a fresh copy and addressed by
 * index, guarded by a `test` op on the name: if the list shifted between
 * the GET and the PATCH, the server rejects it with 400 and the patch is
 * rebuilt from a newer copy — at most 3 attempts, only on 400. Any other
 * error is thrown as-is. Resolves to `undefined` when the property is
 * already gone (treated as deleted, not a failure). A PATCH response
 * without a usable type body is followed by a re-GET.
 * ADR:2026-11-07-custom-properties-s12-hub-allowlist-delete-patch.
 */
async function patchCustomPropertyByName(
  entityType: string,
  propertyName: string,
  buildOperations: (
    property: CustomPropertyDef,
    path: string,
  ) => JsonPatchOperation[],
): Promise<MetadataType | undefined> {
  for (let attempt = 1; ; attempt++) {
    const type = await getMetadataTypeByName(entityType);
    const properties = type.customProperties ?? [];
    const index = properties.findIndex((property) => property.name === propertyName);
    if (index === -1) {
      return undefined;
    }
    if (!type.id) {
      throw new Error('Entity type id is missing; cannot patch the custom property.');
    }
    const path = `/customProperties/${index}`;
    const operations: JsonPatchOperation[] = [
      { op: 'test', path: `${path}/name`, value: propertyName },
      ...buildOperations(properties[index]!, path),
    ];
    try {
      const raw = await apiRequest<unknown>(
        `/v1/metadata/types/${encodeURIComponent(type.id ?? '')}`,
        {
          method: 'PATCH',
          json: operations,
          contentType: 'application/json-patch+json',
        },
      );
      const rec = asRecord(raw);
      const mapped = rec ? mapMetadataType(rec) : null;
      return mapped ?? (await getMetadataTypeByName(entityType));
    } catch (error) {
      const isStaleIndex = error instanceof ApiError && error.status === 400;
      if (!isStaleIndex || attempt >= MAX_CUSTOM_PROPERTY_PATCH_ATTEMPTS) {
        throw error;
      }
    }
  }
}

/**
 * Official deleteCustomPropertyByName (metadataTypeAPI.ts:126-187).
 * ADR:2026-11-07-custom-properties-s12-hub-allowlist-delete-patch.
 */
export async function deleteCustomPropertyByName(
  entityType: string,
  propertyName: string,
): Promise<MetadataType | undefined> {
  return patchCustomPropertyByName(entityType, propertyName, (_property, path) => [
    { op: 'remove', path },
  ]);
}

/**
 * Official updateCustomPropertyByName (metadataTypeAPI.ts:189-…): applies
 * `changes` to the current server copy, so a concurrent edit to the
 * property's other fields is kept. An `undefined` change is left out (the
 * hand-written diff emits no op for it). Resolves to `undefined` when the
 * property no longer exists.
 * ADR:2026-11-08-custom-properties-s3-config-write-side.
 */
export async function updateCustomPropertyByName(
  entityType: string,
  propertyName: string,
  changes: CustomPropertyChanges,
): Promise<MetadataType | undefined> {
  return patchCustomPropertyByName(entityType, propertyName, (property, path) =>
    diffCustomPropertyChanges(property, changes, path),
  );
}
