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
 * Phase 1 only wires Table and Topic. Other search hits stay navigable to a
 * generic page that shows fields already in the search document.
 */
const DETAIL_ENDPOINTS: Record<string, { collection: string; fields: string }> = {
  table: { collection: 'tables', fields: 'owners,tags,columns,domains' },
  topic: { collection: 'topics', fields: 'owners,tags,domains' },
};

export function assetLocation(entityType: string, fqn: string): { name: string; params: { entityType: string; fqn: string } } {
  return {
    name: 'asset',
    params: { entityType, fqn },
  };
}

export function lineageLocation(entityType: string, fqn: string): { name: string; params: { entityType: string; fqn: string } } {
  return {
    name: 'lineage',
    params: { entityType, fqn },
  };
}

export function encodeFqnForApi(fqn: string): string {
  return encodeURIComponent(fqn);
}

export function resolveDetailEndpoint(
  entityType: string,
  fqn: string,
): { path: string; fields: string } | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !fqn) {
    return null;
  }
  return {
    path: `/v1/${spec.collection}/name/${encodeFqnForApi(fqn)}`,
    fields: spec.fields,
  };
}

export function isDetailWired(entityType: string): boolean {
  return entityType in DETAIL_ENDPOINTS;
}

export function resolvePatchPath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}`;
}
