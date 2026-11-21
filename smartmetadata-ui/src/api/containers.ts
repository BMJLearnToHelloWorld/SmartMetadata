/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from '@/api/client';
import { asString, parsePaged } from '@/api/json';
import type { IncludeFilter, Paged } from '@/types/admin';

/**
 * Row shape rendered by the container-children table: the /children
 * endpoint returns slim Container summaries (id, name, displayName,
 * fullyQualifiedName, description, service) — pin rest/storageAPI.ts
 * getContainerChildrenByName.
 */
export interface ContainerChildRow {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
}

function mapContainerChild(raw: Record<string, unknown>): ContainerChildRow | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  return {
    id: asString(raw.id) || name,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
  };
}

export interface ListContainerChildrenQuery {
  limit?: number;
  offset?: number;
  include?: IncludeFilter;
  /** Case-insensitive substring filter on the child container name. */
  q?: string;
}

/**
 * Official getContainerChildrenByName (rest/storageAPI.ts:66):
 * GET /v1/containers/name/{fqn}/children, offset-paged (number-based).
 * `include` toggles non-deleted / deleted / all.
 */
export function listContainerChildren(
  fqn: string,
  query: ListContainerChildrenQuery = {},
): Promise<Paged<ContainerChildRow>> {
  return apiRequest<unknown>(`/v1/containers/name/${encodeURIComponent(fqn)}/children`, {
    query: {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      include: query.include ?? 'non-deleted',
      q: query.q?.trim() ? query.q.trim() : undefined,
    },
  }).then((payload) => parsePaged(payload, mapContainerChild));
}
