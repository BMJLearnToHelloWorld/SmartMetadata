/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

export interface ApiEndpointRef {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  endpointURL?: string;
  requestMethod?: string;
  description?: string;
}

function mapApiEndpoint(raw: Record<string, unknown>): ApiEndpointRef | null {
  const name = asString(raw.name) || asString(raw.fullyQualifiedName);
  if (!name) {
    return null;
  }
  return {
    id: asString(raw.id) || undefined,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    endpointURL: asString(raw.endpointURL) || undefined,
    requestMethod: asString(raw.requestMethod) || undefined,
    description: asString(raw.description) || undefined,
  };
}

/**
 * Official APIEndpointsTab query: GET /v1/apiEndpoints filtered by the
 * owning collection FQN (APIEndpointResource list apiCollection param).
 */
export function listApiEndpoints(query: {
  apiCollection?: string;
  service?: string;
  limit?: number;
  include?: 'non-deleted' | 'deleted' | 'all';
  after?: string;
  before?: string;
} = {}): Promise<Paged<ApiEndpointRef>> {
  return apiRequest<unknown>('/v1/apiEndpoints', {
    query: {
      fields: 'owners',
      apiCollection: query.apiCollection,
      service: query.service,
      limit: query.limit ?? 50,
      include: query.include ?? 'non-deleted',
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapApiEndpoint));
}

export function apiEndpointLocation(endpoint: ApiEndpointRef): { name: string; params: { entityType: string; fqn: string } } {
  return {
    name: 'asset',
    params: { entityType: 'apiEndpoint', fqn: endpoint.fullyQualifiedName ?? endpoint.name },
  };
}
