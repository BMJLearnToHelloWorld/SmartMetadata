/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord } from '@/api/json';
import type { EntityVersion } from '@/api/entities';
import { mapChangeDescription } from '@/api/entities';
import { SERVICE_MAP_API } from '@/ingestion/serviceApis';
import type { CatalogService, ServiceKind } from '@/types/ingestion';
import { apiRequest } from './client';

/**
 * Service version history (R-10). Every service resource serves the
 * generic EntityResource shape: GET
 * /v1/services/{collection}/{id}/versions (EntityHistory.versions) and
 * GET .../versions/{version} (the full service entity at that version).
 * The kind → collection table is the single source; the snapshot is
 * mapped with the same per-kind mapper as the live record.
 */
export const SERVICE_COLLECTION_BY_KIND: Record<ServiceKind, string> = {
  database: 'databaseServices',
  messaging: 'messagingServices',
  dashboard: 'dashboardServices',
  storage: 'storageServices',
  pipeline: 'pipelineServices',
  api: 'apiServices',
  mlmodel: 'mlmodelServices',
  metadata: 'metadataServices',
  drive: 'driveServices',
  search: 'searchServices',
  llm: 'llmServices',
  mcp: 'mcpServices',
  security: 'securityServices',
};

export async function listServiceVersions(kind: ServiceKind, id: string): Promise<EntityVersion[]> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  const body = await apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${encodeURIComponent(id)}/versions`,
  );
  const versions = body.versions;
  if (!Array.isArray(versions)) {
    return [];
  }
  return versions.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const version = rec.version;
    return [
      {
        version: typeof version === 'number' || typeof version === 'string' ? version : undefined,
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : undefined,
        updatedBy: typeof rec.updatedBy === 'string' ? rec.updatedBy : undefined,
        changeDescription: mapChangeDescription(rec.changeDescription),
      },
    ];
  });
}

export async function getServiceVersion(
  kind: ServiceKind,
  id: string,
  version: string | number,
): Promise<CatalogService> {
  const collection = SERVICE_COLLECTION_BY_KIND[kind];
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/${collection}/${encodeURIComponent(id)}/versions/${encodeURIComponent(String(version))}`,
  );
  const mapped = SERVICE_MAP_API[kind](raw);
  if (!mapped) {
    throw new Error('Service version response was missing id and name');
  }
  return mapped;
}
