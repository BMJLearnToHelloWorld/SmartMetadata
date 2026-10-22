/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString } from '@/api/json';
import type { CustomPropertyDef } from '@/types/collaboration';
import { apiRequest } from './client';

function mapCustomProperty(raw: Record<string, unknown>): CustomPropertyDef | null {
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
