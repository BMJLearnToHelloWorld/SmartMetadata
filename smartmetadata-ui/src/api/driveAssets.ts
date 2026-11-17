/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { parsePaged } from '@/api/json';
import type { IncludeFilter, Paged } from '@/types/admin';
import { apiRequest } from './client';
import { mapServicePageData, type ServicePageData } from './servicePageData';

/**
 * Pin DriveAssetEntityTypes (rest/driveAPI.interface.ts): the four
 * entity types served under /v1/drives.
 */
export type DriveAssetEntityType = 'file' | 'directory' | 'spreadsheet' | 'worksheet';

/** Pin APIByEntityType (rest/driveAPI.ts): path segment per entity type. */
const DRIVE_API_BY_ENTITY_TYPE: Record<DriveAssetEntityType, string> = {
  file: 'files',
  directory: 'directories',
  spreadsheet: 'spreadsheets',
  worksheet: 'worksheets',
};

export interface ListDriveAssetsQuery {
  service?: string;
  fields?: string;
  paging?: { limit?: number; after?: string; before?: string };
  include?: IncludeFilter;
  /** Root assets only; the drive main tab always passes true. */
  root?: boolean;
}

/**
 * Pin getDriveAssets (rest/driveAPI.ts): GET /v1/drives/{segment}
 * with the rest params spread first, then the paging params.
 */
export async function listDriveAssets(
  entityType: DriveAssetEntityType,
  query: ListDriveAssetsQuery,
): Promise<Paged<ServicePageData>> {
  const payload = await apiRequest<unknown>(
    `/v1/drives/${DRIVE_API_BY_ENTITY_TYPE[entityType]}`,
    {
      query: {
        service: query.service,
        fields: query.fields,
        include: query.include,
        root: query.root,
        limit: query.paging?.limit,
        after: query.paging?.after,
        before: query.paging?.before,
      },
    },
  );
  return parsePaged(payload, mapServicePageData);
}

/**
 * Pin count pattern for the drive secondary tabs: root assets only,
 * limit 0, no fields — only the paging total is read.
 */
export async function countDriveAssets(
  entityType: 'file' | 'spreadsheet',
  service: string,
  include: IncludeFilter,
): Promise<number> {
  const page = await listDriveAssets(entityType, {
    service,
    include,
    root: true,
    paging: { limit: 0 },
  });
  return page.total ?? 0;
}

/**
 * Pin patchDriveAssetDetails (rest/driveAPI.ts:91-105): PATCH
 * /v1/drives/{segment}/{id} with a JSON Patch body, returning the
 * updated asset mapped onto the shared page shape.
 */
export async function patchDriveAsset(
  entityType: DriveAssetEntityType,
  id: string,
  ops: JsonPatchOp[],
): Promise<ServicePageData> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/drives/${DRIVE_API_BY_ENTITY_TYPE[entityType]}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: ops,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = mapServicePageData(raw);
  if (!mapped) {
    throw new Error('Drive asset patch response was missing id and name');
  }
  return mapped;
}
