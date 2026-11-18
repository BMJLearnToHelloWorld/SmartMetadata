/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Service list-segment validation (DESIGN §4.3 / D-18, C-2 A-1).
 * The official ServicesPage accepts exactly three shapes for its
 * tab segment (openmetadata-ui pages/ServicesPage/ServicesPage.tsx
 * isValidServiceTab): a SERVICE_CATEGORY mapping key
 * (ServiceType.constant.ts), a ServiceCategory enum value
 * (enums/service.enum.ts), or `dataObservability`; anything else
 * renders NOT_FOUND. The eleven mapping keys and the eleven enum
 * values overlap on `apiServices` (the key of the API category and
 * the enum value of the same category) — both resolve to the api
 * kind. `llm`, `mcp`, `llmServices` and `mcpServices` are rejected:
 * llm/mcp services have no list tab and no wizard creation (C-2),
 * while generic detail direct access is untouched — this table
 * validates list segments only and must never be used as a global
 * detail-route restriction.
 */
import type { ServiceKind } from '@/types/ingestion';

/** The eleven listable service kinds (llm/mcp have no list tab). */
export type ListableServiceKind = Exclude<ServiceKind, 'llm' | 'mcp'>;

/** SERVICE_CATEGORY mapping key per listable kind (pin-exact). */
export const SERVICE_KIND_SEGMENTS: Record<ListableServiceKind, string> = {
  database: 'databases',
  messaging: 'messaging',
  dashboard: 'dashboards',
  pipeline: 'pipelines',
  mlmodel: 'mlmodels',
  metadata: 'metadata',
  storage: 'storages',
  search: 'search',
  api: 'apiServices',
  security: 'security',
  drive: 'drives',
};

/** ServiceCategory enum value → kind (pin-exact). */
export const SERVICE_ENUM_SEGMENTS: Record<string, ListableServiceKind> = {
  databaseServices: 'database',
  messagingServices: 'messaging',
  dashboardServices: 'dashboard',
  pipelineServices: 'pipeline',
  mlmodelServices: 'mlmodel',
  metadataServices: 'metadata',
  storageServices: 'storage',
  searchServices: 'search',
  apiServices: 'api',
  securityServices: 'security',
  driveServices: 'drive',
};

export const DATA_OBSERVABILITY_SEGMENT = 'dataObservability';

/** Every accepted list segment → kind, or null for dataObservability. */
const SEGMENT_TO_KIND: ReadonlyMap<string, ListableServiceKind | null> = (() => {
  const map = new Map<string, ListableServiceKind | null>();
  for (const [kind, segment] of Object.entries(SERVICE_KIND_SEGMENTS)) {
    map.set(segment, kind as ListableServiceKind);
  }
  for (const [segment, kind] of Object.entries(SERVICE_ENUM_SEGMENTS)) {
    map.set(segment, kind);
  }
  map.set(DATA_OBSERVABILITY_SEGMENT, null);
  return map;
})();

export type ServiceTabResolution =
  | { kind: ListableServiceKind }
  | { dataObservability: true }
  | null;

/** Resolves a list segment; null means invalid (official NOT_FOUND). */
export function resolveServiceTab(segment: string): ServiceTabResolution {
  const kind = SEGMENT_TO_KIND.get(segment);
  if (kind === undefined) {
    return null;
  }
  return kind === null ? { dataObservability: true } : { kind };
}

/** Whether the segment is an accepted list segment. */
export function isValidServiceTab(segment: string): boolean {
  return SEGMENT_TO_KIND.has(segment);
}

/** The mapping-key segment for a kind, or undefined for llm/mcp. */
export function kindToSegment(kind: string): string | undefined {
  return (SERVICE_KIND_SEGMENTS as Record<string, string>)[kind];
}

/** Whether the kind has a list segment (and hence a list tab). */
export function isServiceListKind(kind: string): boolean {
  return kindToSegment(kind) !== undefined;
}
