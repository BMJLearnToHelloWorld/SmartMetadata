/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';

/**
 * Official delete line (03 §2.2, U7): `deleteEntity` /
 * `hardDeleteEntity` (rest/miscAPI.ts:169-183,
 * utils/DeleteWidget/DeleteWidgetUtils.ts:35-74) with the
 * `prepareEntityType` path mapping
 * (utils/DeleteWidget/DeleteWidgetClassBase.ts:18-29,62-76).
 *
 * The server ignores the `recursive` query parameter (recursion is
 * hard-coded per resource), but the wire shape is sent verbatim — the
 * line is 1:1, not "optimized". This layer never toasts: the product
 * API layer owns no i18n, so callers pass `onSuccess`/`onError`
 * callbacks that toast with their own translated texts.
 */

/** Pin ENTITY_TYPE_PATH_MAP (DeleteWidgetClassBase.ts:18-29), Access subset. */
export const ENTITY_TYPE_PATH_MAP: Record<string, string> = {
  policy: 'policies',
};

/**
 * Pin `prepareEntityType` (DeleteWidgetClassBase.ts:62-76): the map wins,
 * otherwise the default plural fallback (`${entityType}s`, so ROLE falls
 * through to `roles`). The grouping branch of the pin function covers
 * entity groups this partition never deletes and is not ported.
 */
export function prepareEntityType(entityType: string): string {
  return ENTITY_TYPE_PATH_MAP[entityType] ?? `${entityType}s`;
}

/**
 * Pin `deleteEntity` (miscAPI.ts:169-183): DELETE
 * `/{entityType}/{entityId}?hardDelete&recursive`, defaulting to a hard
 * delete. `apiRequest` throws on non-2xx, so the pin "non-200" branch
 * (an error toast on an unexpected response) is unreachable here and
 * surfaces through the catch in `hardDeleteEntity` instead.
 */
export function deleteEntity(
  entityType: string,
  entityId: string,
  isRecursive: boolean,
  isHardDelete = true,
): Promise<unknown> {
  return apiRequest(`/v1/${prepareEntityType(entityType)}/${encodeURIComponent(entityId)}`, {
    method: 'DELETE',
    query: { hardDelete: isHardDelete, recursive: isRecursive },
  });
}

export interface HardDeleteEntityOptions {
  /** Pin `isRecursiveDelete`, default false (list deletes). Detail deletes pass true. */
  isRecursiveDelete?: boolean;
  /** Runs after a successful delete; the caller toasts here. */
  onSuccess: () => void;
  /** Runs with the thrown error; the caller toasts here. */
  onError: (error: unknown) => void;
}

/**
 * Pin `hardDeleteEntity` (DeleteWidgetUtils.ts:35-74): boolean contract —
 * true when the delete landed, false when it threw. The pin
 * `successMessage` option is not ported: no Access caller passes one
 * (all four use the default `server.entity-deleted-successfully`
 * text, computed by the caller).
 */
export async function hardDeleteEntity(
  entityId: string,
  entityType: string,
  options: HardDeleteEntityOptions,
): Promise<boolean> {
  try {
    await deleteEntity(entityType, entityId, options.isRecursiveDelete ?? false);
    options.onSuccess();
    return true;
  } catch (error) {
    options.onError(error);
    return false;
  }
}
