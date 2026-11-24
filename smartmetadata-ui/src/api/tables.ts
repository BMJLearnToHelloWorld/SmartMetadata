/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import type { IncludeFilter, Paged } from '@/types/admin';
import type { EntityRef, TagRef } from '@/types/api';
import { mapTags } from './entities';
import { apiRequest } from './client';

export interface TableColumnRef {
  name: string;
  dataType?: string;
}

export interface TableColumns {
  fullyQualifiedName: string;
  name: string;
  columns: TableColumnRef[];
}

/**
 * Official GET /v1/tables/name/{fqn} (TableResource.getByName): the only
 * read the tableDiff form needs — a table's columns, by FQN. Used for both
 * sides: table1 (the case's own entity) and table2 (the selected table).
 * ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
 */
export async function getTableByName(fqn: string): Promise<TableColumns> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/tables/name/${encodeFqnForApi(fqn)}`,
    { query: { fields: 'columns' } },
  );
  const columns = Array.isArray(raw.columns)
    ? raw.columns.flatMap((item) => {
        const rec = asRecord(item);
        if (!rec) {
          return [];
        }
        const name = asString(rec.name);
        if (!name) {
          return [];
        }
        return [{ name, dataType: asString(rec.dataType) || undefined }];
      })
    : [];
  return {
    fullyQualifiedName: asString(raw.fullyQualifiedName) || fqn,
    name: asString(raw.name) || fqn,
    columns,
  };
}

export interface TableSharding {
  id: string;
  fullyQualifiedName: string;
  tableType?: string;
  tableSharding?: { prefix?: string };
  deleted?: boolean;
}

/**
 * Official `TableShardingUtils.findShardedFamilies` verification read:
 * GET /v1/tables/name/{fqn} with only the sharding fields, so the
 * Explore sharded-family lookup can check a candidate table's prefix
 * without fetching its columns. A missing table rejects (404), as with
 * `getTableByName`; callers treat that as "not a family member".
 */
export async function getTableShardingByName(fqn: string): Promise<TableSharding> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/tables/name/${encodeFqnForApi(fqn)}`,
    { query: { fields: 'tableSharding,tableType' } },
  );
  const sharding = asRecord(raw.tableSharding);
  return {
    id: asString(raw.id),
    fullyQualifiedName: asString(raw.fullyQualifiedName) || fqn,
    tableType: asString(raw.tableType) || undefined,
    tableSharding: sharding ? { prefix: asString(sharding.prefix) || undefined } : undefined,
    deleted: typeof raw.deleted === 'boolean' ? raw.deleted : undefined,
  };
}

/**
 * Official SchemaTablesTab list fields (rest/tableAPI.ts getTableList
 * callers pass `commonTableFields`, utils/DatasetDetailsUtils.ts:24):
 * tags, owners, domains, dataProducts, certification.
 */
export const TABLE_LIST_FIELDS = 'tags,owners,domains,dataProducts,certification';

export interface SchemaTableRow {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  description?: string;
  owners: EntityRef[];
  domains: EntityRef[];
  dataProducts: EntityRef[];
  tags: TagRef[];
  /** Pin Table.certification (AssetCertification): the tag label, if any. */
  certification?: { tagLabel?: TagRef };
  deleted?: boolean;
}

function mapSchemaTableRow(raw: Record<string, unknown>): SchemaTableRow | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const certification = asRecord(raw.certification);
  const tagLabel = certification ? mapTags([certification.tagLabel])[0] : undefined;
  return {
    id: asString(raw.id) || name,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    description: asString(raw.description) || undefined,
    owners: mapEntityRefs(raw.owners),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    tags: mapTags(raw.tags),
    certification: tagLabel ? { tagLabel } : undefined,
    deleted: raw.deleted === true ? true : undefined,
  };
}

export interface ListTablesQuery {
  databaseSchema: string;
  limit?: number;
  include?: IncludeFilter;
  after?: string;
  before?: string;
}

/**
 * Official getTableList (rest/tableAPI.ts:225): GET /v1/tables with the
 * owning schema FQN. Cursor-paged (before/after); `include` toggles
 * non-deleted / deleted / all, mirroring pin Include.
 */
export function listTables(query: ListTablesQuery): Promise<Paged<SchemaTableRow>> {
  return apiRequest<unknown>('/v1/tables', {
    query: {
      fields: TABLE_LIST_FIELDS,
      databaseSchema: query.databaseSchema,
      limit: query.limit ?? 50,
      include: query.include ?? 'non-deleted',
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapSchemaTableRow));
}

/**
 * Official patchTableDetails (rest/tableAPI.ts:84): PATCH /v1/tables/{id}
 * with a JSON Patch document; returns the updated table.
 */
export async function patchTableDetails(id: string, patch: unknown[]): Promise<SchemaTableRow> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tables/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapSchemaTableRow(raw);
  if (!mapped) {
    throw new Error('Update table succeeded but the response had no table');
  }
  return mapped;
}
