/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CreateCustomPropertyRequest,
  CustomPropertyDef,
  MetadataType,
} from '@/types/collaboration';
import { apiRequest } from './client';

/** TypeResource list filter for entity types that may carry customProperties. */
export const ENTITY_TYPE_CATEGORY = 'entity';
/** TypeResource category for property types (string, integer, …). */
export const FIELD_TYPE_CATEGORY = 'field';
export const TYPE_FIELDS = 'customProperties';

export interface ListMetadataTypesQuery {
  category?: string;
  limit?: number;
  after?: string;
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
  };
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
