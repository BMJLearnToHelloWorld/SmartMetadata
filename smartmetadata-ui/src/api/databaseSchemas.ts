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
import { asNumber, asRecord, asString } from '@/api/json';
import { buildSchemaQueryFilter } from '@/api/serviceSearch';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { TagRef } from '@/types/api';
import { mapTags } from './entities';

/**
 * D-2 batch 3 DatabaseSchema rows (official
 * `components/Database/DatabaseSchema/DatabaseSchemaTable/DatabaseSchemaTable.tsx`):
 * the Database face is a self-fetching table, not a detail-payload list.
 * List: `rest/databaseAPI.ts:122-147 getDatabaseSchemas`
 * (`GET /databaseSchemas?database={fqn}`); search:
 * `rest/searchAPI.ts searchQuery` with index `database_schema` and
 * `buildSchemaQueryFilter('database.fullyQualifiedName', dbFqn, term)`;
 * display-name write: `rest/databaseAPI.ts:81-91 patchDatabaseSchemaDetails`
 * (`PATCH /databaseSchemas/{id}` with JSON Patch ops).
 */
export interface DatabaseSchemaRow {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  owners?: { id?: string; name: string; displayName?: string; type?: string }[];
  domains?: { id?: string; name: string; displayName?: string }[];
  tags?: TagRef[];
  usagePercentile?: number;
  deleted?: boolean;
}

export interface DatabaseSchemaPage {
  data: DatabaseSchemaRow[];
  paging: { total?: number; after?: string; before?: string };
}

export function mapDatabaseSchema(value: unknown): DatabaseSchemaRow | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const name = asString(rec.name);
  if (!name) {
    return null;
  }
  const usage = asRecord(rec.usageSummary);
  const weekly = asRecord(usage?.weeklyStats);
  const percentile = asNumber(weekly?.percentileRank);
  const owners = Array.isArray(rec.owners)
    ? rec.owners.flatMap((item) => {
        const owner = asRecord(item);
        const ownerName = owner ? asString(owner.name) : '';
        return owner && ownerName
          ? [
              {
                id: asString(owner.id) || undefined,
                name: ownerName,
                displayName: asString(owner.displayName) || undefined,
                type: asString(owner.type) || undefined,
              },
            ]
          : [];
      })
    : undefined;
  const domains = Array.isArray(rec.domains)
    ? rec.domains.flatMap((item) => {
        const domain = asRecord(item);
        const domainName = domain ? asString(domain.name) : '';
        return domain && domainName
          ? [
              {
                id: asString(domain.id) || undefined,
                name: domainName,
                displayName: asString(domain.displayName) || undefined,
              },
            ]
          : [];
      })
    : undefined;
  const tags = mapTags(rec.tags);
  return {
    id: asString(rec.id) || undefined,
    name,
    displayName: asString(rec.displayName) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    description: asString(rec.description) || undefined,
    owners,
    domains,
    tags: tags.length ? tags : undefined,
    usagePercentile: percentile ?? undefined,
    deleted: rec.deleted === true,
  };
}

export interface ListDatabaseSchemasParams {
  databaseName: string;
  limit?: number;
  after?: string;
  before?: string;
  /** `all` | `deleted` | `non-deleted` (pin `Include`); default non-deleted. */
  include?: string;
  fields?: string[];
}

export async function listDatabaseSchemas(
  params: ListDatabaseSchemasParams,
): Promise<DatabaseSchemaPage> {
  const payload = await apiRequest<Record<string, unknown>>('/v1/databaseSchemas', {
    query: {
      database: params.databaseName,
      limit: params.limit,
      after: params.after,
      before: params.before,
      include: params.include ?? 'non-deleted',
      fields: params.fields?.join(','),
    },
  });
  const paging = asRecord(payload.paging) ?? {};
  return {
    data: Array.isArray(payload.data)
      ? payload.data.flatMap((item) => {
          const mapped = mapDatabaseSchema(item);
          return mapped ? [mapped] : [];
        })
      : [],
    paging: {
      total: asNumber(paging.total),
      after: asString(paging.after) || undefined,
      before: asString(paging.before) || undefined,
    },
  };
}

export interface SearchDatabaseSchemasParams {
  databaseFqn: string;
  searchValue?: string;
  pageNumber?: number;
  pageSize?: number;
  includeDeleted?: boolean;
}

export async function searchDatabaseSchemas(
  params: SearchDatabaseSchemasParams,
): Promise<DatabaseSchemaPage> {
  const payload = await apiRequest<Record<string, unknown>>('/v1/search/query', {
    query: {
      q: '',
      index: 'database_schema',
      from: ((params.pageNumber ?? 1) - 1) * (params.pageSize ?? 10),
      size: params.pageSize ?? 10,
      include_aggregations: false,
      deleted: params.includeDeleted === true ? true : undefined,
      track_total_hits: true,
      query_filter: JSON.stringify(
        buildSchemaQueryFilter(
          'database.fullyQualifiedName',
          params.databaseFqn,
          params.searchValue,
        ),
      ),
    },
  });
  const hits = asRecord(payload.hits) ?? {};
  const total = asRecord(hits.total);
  return {
    data: Array.isArray(hits.hits)
      ? hits.hits.flatMap((hit) => {
          const source = asRecord(hit)?._source;
          const mapped = mapDatabaseSchema(source);
          return mapped ? [mapped] : [];
        })
      : [],
    paging: { total: asNumber(total?.value) },
  };
}

export async function patchDatabaseSchema(
  id: string,
  ops: JsonPatchOp[],
): Promise<DatabaseSchemaRow | null> {
  const payload = await apiRequest<unknown>(`/v1/databaseSchemas/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: ops,
    contentType: 'application/json-patch+json',
  });
  return mapDatabaseSchema(payload);
}
