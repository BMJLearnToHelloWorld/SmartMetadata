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
/** Detail fetch carries the JSON Schema as well as the definitions (stage 2). */
export const TYPE_FIELDS = 'customProperties,schema';

export interface ListMetadataTypesQuery {
  category?: string;
  limit?: number;
  after?: string;
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

function startCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}

export { startCase };

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
 * `sqlQuery` → the SQL query label; otherwise
 * `startCase(displayName || name with '-cp' removed)`.
 */
export function propertyTypeLabel(
  name: string,
  displayName: string | undefined,
  sqlQueryLabel: string,
): string {
  if (name === 'sqlQuery') {
    return sqlQueryLabel;
  }
  return startCase((displayName || name).replaceAll('-cp', ''));
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
 * Official buildCustomPropertyConfig (CustomPropertiesPanel.utils.ts:61-90).
 * Enum values and columns are deduplicated (official `uniq` semantics).
 */
export function buildCustomPropertyConfig(
  values: CustomPropertyConfigFormValues,
  flags: CustomPropertyTypeFlags,
): CustomPropertyConfig | undefined {
  if (flags.hasEnumConfig) {
    return {
      config: {
        multiSelect: Boolean(values.multiSelect),
        values: uniq(values.enumConfig ?? []),
      },
    };
  }
  if (flags.hasFormatConfig && values.formatConfig) {
    return { config: values.formatConfig };
  }
  if (flags.hasEntityReferenceConfig && values.entityReferenceConfig) {
    return { config: [...values.entityReferenceConfig] };
  }
  if (flags.hasTableTypeConfig && values.columns) {
    return { config: { columns: uniq(values.columns) } };
  }
  return undefined;
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
 * 'type' }`, `displayName || undefined`, undefined fields omitted. The
 * product keeps the `name` in propertyType (its existing request shape,
 * accepted by the server); only the config assembly is new.
 */
export function toCustomPropertyPayload(
  values: CustomPropertyFormValues,
  propertyType: { id: string; name: string },
): CreateCustomPropertyRequest {
  const flags = getCustomPropertyTypeFlags(propertyType.name);
  const customPropertyConfig = buildCustomPropertyConfig(values, flags);
  return {
    name: values.name,
    description: values.description,
    propertyType: { id: propertyType.id, type: 'type', name: propertyType.name },
    ...(values.displayName ? { displayName: values.displayName } : {}),
    ...(customPropertyConfig ? { customPropertyConfig } : {}),
  };
}

export interface CustomPropertyFormIssue {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Submit-time validation for the create/edit form, mirroring official
 * CustomPropertyFormFields rules (required + 256 + name regex +
 * case-insensitive uniqueness against the type's existing names; enum /
 * format / entity-reference / columns required when their type is
 * selected). Values are expected trimmed (the view trims before calling).
 * Uniqueness is UI-side only: the server still compares case-sensitively
 * (see the ADR residual). Returns issues in field order; empty means valid.
 */
export function validateCustomPropertyForm(
  values: CustomPropertyFormValues,
  options: { existingNames: string[]; isEdit: boolean },
): CustomPropertyFormIssue[] {
  const issues: CustomPropertyFormIssue[] = [];
  if (!values.name) {
    issues.push({ key: 'settings.customProperties.nameRequired' });
  } else {
    if (values.name.length > CUSTOM_PROPERTY_NAME_MAX_LENGTH) {
      issues.push({
        key: 'settings.customProperties.nameLength',
        params: { min: 1, max: CUSTOM_PROPERTY_NAME_MAX_LENGTH },
      });
    }
    if (!CUSTOM_PROPERTY_NAME_REGEX.test(values.name)) {
      issues.push({ key: 'settings.customProperties.nameInvalid' });
    }
    if (
      !options.isEdit &&
      options.existingNames.some(
        (existing) => existing.toLowerCase() === values.name.toLowerCase(),
      )
    ) {
      issues.push({ key: 'settings.customProperties.nameExists' });
    }
  }
  if (!values.description) {
    issues.push({ key: 'settings.customProperties.descriptionRequired' });
  }
  if (!values.propertyTypeName) {
    issues.push({ key: 'settings.customProperties.propertyTypeRequired' });
    return issues;
  }
  const flags = getCustomPropertyTypeFlags(values.propertyTypeName);
  if (flags.hasEnumConfig && values.enumConfig.length === 0) {
    issues.push({ key: 'settings.customProperties.enumValuesRequired' });
  }
  if (flags.hasFormatConfig) {
    if (!values.formatConfig) {
      issues.push({ key: 'settings.customProperties.formatRequired' });
    } else if (!flags.supportedFormats.includes(values.formatConfig)) {
      issues.push({ key: 'settings.customProperties.formatInvalid' });
    }
  }
  if (flags.hasEntityReferenceConfig && values.entityReferenceConfig.length === 0) {
    issues.push({ key: 'settings.customProperties.entityReferenceRequired' });
  }
  if (flags.hasTableTypeConfig) {
    if (values.columns.length === 0) {
      issues.push({ key: 'settings.customProperties.columnsRequired' });
    } else {
      if (values.columns.length > MAX_TABLE_CONFIG_COLUMNS) {
        issues.push({
          key: 'settings.customProperties.columnsTooMany',
          params: { max: MAX_TABLE_CONFIG_COLUMNS },
        });
      }
      const reserved = values.columns.find((column) =>
        RESERVED_TABLE_COLUMN_NAMES.includes(column),
      );
      if (reserved !== undefined) {
        issues.push({
          key: 'settings.customProperties.columnReserved',
          params: { name: reserved },
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
 * editable fields (the product has no fast-json-patch dependency and must
 * not add it): an unchanged field emits no op; a field absent from the
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

export interface CustomPropertyTypeOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Official getPropertyTypeOptions: one option per property type present in
 * the current definitions, sorted by label, with a count. Types whose last
 * property was removed drop out of the active filter (callers intersect the
 * selection with these values).
 */
export function getPropertyTypeOptions(
  properties: CustomPropertyDef[],
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
        label: property.propertyType,
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
      fields: TYPE_FIELDS,
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

/** Property types usable as CustomProperty.propertyType (category=field). */
export function listPropertyTypes(limit = 100): Promise<Paged<MetadataType>> {
  return listMetadataTypes({ category: FIELD_TYPE_CATEGORY, limit });
}

/**
 * Apache TypeResource.addOrUpdateProperty —
 * PUT /v1/metadata/types/{id} with CustomProperty body.
 */
export async function addOrUpdateCustomProperty(
  typeId: string,
  body: CreateCustomPropertyRequest,
): Promise<MetadataType> {
  const raw = await apiRequest<unknown>(`/v1/metadata/types/${encodeURIComponent(typeId)}`, {
    method: 'PUT',
    json: body,
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapMetadataType(rec) : null;
  if (!mapped) {
    throw new Error('Add/update custom property succeeded but the response had no type');
  }
  return mapped;
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
