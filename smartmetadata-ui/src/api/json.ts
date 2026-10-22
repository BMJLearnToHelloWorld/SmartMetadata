/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from '@/types/api';
import type { Paged } from '@/types/admin';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapEntityRefs(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
      },
    ];
  });
}

export function parsePaged<T>(
  payload: unknown,
  mapItem: (raw: Record<string, unknown>) => T | null,
): Paged<T> {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data) ? root.data : [];
  const paging = asRecord(root?.paging);
  const data = rows.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const mapped = mapItem(rec);
    return mapped ? [mapped] : [];
  });
  return {
    data,
    after: asString(paging?.after) || undefined,
    before: asString(paging?.before) || undefined,
    total: asNumber(paging?.total),
  };
}
