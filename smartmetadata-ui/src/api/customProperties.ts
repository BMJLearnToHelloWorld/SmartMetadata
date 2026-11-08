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
  value?: string;
}

/**
 * Official deleteCustomPropertyByName (metadataTypeAPI.ts:126-187), ported
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
export async function deleteCustomPropertyByName(
  entityType: string,
  propertyName: string,
): Promise<MetadataType | undefined> {
  for (let attempt = 1; ; attempt++) {
    const type = await getMetadataTypeByName(entityType);
    const properties = type.customProperties ?? [];
    const index = properties.findIndex((property) => property.name === propertyName);
    if (index === -1) {
      return undefined;
    }
    if (!type.id) {
      throw new Error('Entity type id is missing; cannot delete the custom property.');
    }
    const path = `/customProperties/${index}`;
    const operations: JsonPatchOperation[] = [
      { op: 'test', path: `${path}/name`, value: propertyName },
      { op: 'remove', path },
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
