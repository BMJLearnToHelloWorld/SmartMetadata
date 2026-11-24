/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString } from '@/api/json';
import { mapCsvImportResult, type CsvImportResult } from '@/api/csvImport';
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import type { TagRef } from '@/types/api';
import type { TagLabelValue } from '@/governance/assetPatch';
import { mapTags } from './entities';
import { apiRequest } from './client';

/**
 * Official column-grid surface (openmetadata-ui/.../rest/columnAPI.ts):
 * GET /v1/columns/grid, POST /v1/columns/bulk-update-preview,
 * POST /v1/columns/bulk-update-async. Server ColumnResource @Path
 * /v1/columns. The shared apiRequest query helper only sets single
 * values, so list params are appended as repeated query params here
 * (the official client does the same via appendListParam).
 */
export interface ColumnGridOccurrence {
  columnFQN: string;
  databaseName?: string;
  schemaName?: string;
  serviceName?: string;
  entityFQN: string;
  entityType: string;
  entityDisplayName?: string;
}

export interface ColumnGridTag {
  tagFQN: string;
  source: string;
}

export interface ColumnGridGroup {
  groupId: string;
  displayName?: string;
  description?: string;
  dataType?: string;
  metadataStatus?: string;
  occurrenceCount: number;
  occurrences: ColumnGridOccurrence[];
  tags: ColumnGridTag[];
}

export interface ColumnGridItem {
  columnName: string;
  hasVariations: boolean;
  metadataStatus?: string;
  groups: ColumnGridGroup[];
}

export interface ColumnGridPage {
  columns: ColumnGridItem[];
  cursor?: string;
  totalOccurrences: number;
  totalUniqueColumns: number;
}

export interface ColumnGridQuery {
  columnNamePattern?: string;
  serviceName?: string;
  databaseName?: string;
  schemaName?: string;
  entityTypes?: string[];
  metadataStatus?: string;
  domainId?: string;
  tags?: string[];
  glossaryTerms?: string[];
  size?: number;
  cursor?: string;
}

export interface ColumnUpdateInput {
  columnFQN: string;
  entityType: string;
  displayName?: string;
  description?: string;
  /** Classification tag FQNs (TagLabel source Tag). */
  tags?: string[];
  /** Glossary term FQNs (TagLabel source Glossary). */
  glossaryTerms?: string[];
}

export interface BulkColumnUpdatePreview {
  columnPreviews: Array<{
    columnFQN: string;
    entityFQN: string;
    hasChanges: boolean;
    currentDisplayName?: string;
    currentDescription?: string;
    newDisplayName?: string;
    newDescription?: string;
  }>;
  totalColumns: number;
}

function asGridTags(value: unknown): ColumnGridTag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    const tagFQN = asString(rec?.tagFQN);
    return tagFQN ? [{ tagFQN, source: asString(rec?.source) || 'Tag' }] : [];
  });
}

function mapOccurrence(raw: Record<string, unknown>): ColumnGridOccurrence {
  return {
    columnFQN: asString(raw.columnFQN),
    databaseName: asString(raw.databaseName) || undefined,
    schemaName: asString(raw.schemaName) || undefined,
    serviceName: asString(raw.serviceName) || undefined,
    entityFQN: asString(raw.entityFQN),
    entityType: asString(raw.entityType),
    entityDisplayName: asString(raw.entityDisplayName) || undefined,
  };
}

function mapGroup(raw: Record<string, unknown>): ColumnGridGroup {
  const occurrences = Array.isArray(raw.occurrences)
    ? raw.occurrences.flatMap((item) => {
        const rec = asRecord(item);
        return rec ? [mapOccurrence(rec)] : [];
      })
    : [];
  return {
    groupId: asString(raw.groupId),
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    dataType: asString(raw.dataType) || undefined,
    metadataStatus: asString(raw.metadataStatus) || undefined,
    occurrenceCount:
      typeof raw.occurrenceCount === 'number' ? raw.occurrenceCount : occurrences.length,
    occurrences,
    tags: asGridTags(raw.tags),
  };
}

function toTagLabels(input: ColumnUpdateInput): Array<Record<string, unknown>> {
  const labels: Array<Record<string, unknown>> = [];
  for (const tagFQN of input.tags ?? []) {
    labels.push({ tagFQN, source: 'Tag', labelType: 'Manual', state: 'Confirmed' });
  }
  for (const tagFQN of input.glossaryTerms ?? []) {
    labels.push({ tagFQN, source: 'Glossary', labelType: 'Manual', state: 'Confirmed' });
  }
  return labels;
}

function toRequestUpdates(inputs: ColumnUpdateInput[]): Array<Record<string, unknown>> {
  return inputs.map((input) => ({
    columnFQN: input.columnFQN,
    entityType: input.entityType,
    displayName: input.displayName,
    description: input.description,
    tags: toTagLabels(input),
  }));
}

function mapGridItem(raw: Record<string, unknown>): ColumnGridItem | null {
  const columnName = asString(raw.columnName);
  if (!columnName) {
    return null;
  }
  return {
    columnName,
    hasVariations: raw.hasVariations === true,
    metadataStatus: asString(raw.metadataStatus) || undefined,
    groups: Array.isArray(raw.groups)
      ? raw.groups.flatMap((item) => {
          const rec = asRecord(item);
          return rec ? [mapGroup(rec)] : [];
        })
      : [],
  };
}

export async function getColumnGrid(query: ColumnGridQuery = {}): Promise<ColumnGridPage> {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  };
  const appendAll = (key: string, values: string[] | undefined): void => {
    for (const value of values ?? []) {
      if (value) {
        params.append(key, value);
      }
    }
  };
  set('columnNamePattern', query.columnNamePattern);
  set('serviceName', query.serviceName);
  set('databaseName', query.databaseName);
  set('schemaName', query.schemaName);
  appendAll('entityTypes', query.entityTypes);
  set('metadataStatus', query.metadataStatus);
  set('domainId', query.domainId);
  appendAll('tags', query.tags);
  appendAll('glossaryTerms', query.glossaryTerms);
  set('size', query.size);
  set('cursor', query.cursor);
  const suffix = params.toString();
  const payload = await apiRequest<unknown>(
    `/v1/columns/grid${suffix ? `?${suffix}` : ''}`,
  );
  const rec = asRecord(payload) ?? {};
  return {
    columns: Array.isArray(rec.columns)
      ? rec.columns.flatMap((item) => {
          const row = asRecord(item);
          const mapped = row ? mapGridItem(row) : null;
          return mapped ? [mapped] : [];
        })
      : [],
    cursor: asString(rec.cursor) || undefined,
    totalOccurrences: typeof rec.totalOccurrences === 'number' ? rec.totalOccurrences : 0,
    totalUniqueColumns:
      typeof rec.totalUniqueColumns === 'number' ? rec.totalUniqueColumns : 0,
  };
}

export async function bulkUpdateColumnsPreview(
  columnUpdates: ColumnUpdateInput[],
): Promise<BulkColumnUpdatePreview> {
  const payload = await apiRequest<unknown>('/v1/columns/bulk-update-preview', {
    method: 'POST',
    json: { columnUpdates: toRequestUpdates(columnUpdates) },
  });
  const rec = asRecord(payload) ?? {};
  const previews = Array.isArray(rec.columnPreviews) ? rec.columnPreviews : [];
  return {
    columnPreviews: previews.flatMap((item) => {
      const row = asRecord(item);
      if (!row) {
        return [];
      }
      const current = asRecord(row.currentValues) ?? {};
      const next = asRecord(row.newValues) ?? {};
      return [
        {
          columnFQN: asString(row.columnFQN),
          entityFQN: asString(row.entityFQN),
          hasChanges: row.hasChanges === true,
          currentDisplayName: asString(current.displayName) || undefined,
          currentDescription: asString(current.description) || undefined,
          newDisplayName: asString(next.displayName) || undefined,
          newDescription: asString(next.description) || undefined,
        },
      ];
    }),
    totalColumns: typeof rec.totalColumns === 'number' ? rec.totalColumns : 0,
  };
}

/**
 * Official columnAPI bulkUpdateColumnsAsync: POST
 * /v1/columns/bulk-update-async. The server starts the job before
 * answering, so the response carries the jobId the bulk-assets socket
 * channel reports progress for (pin ColumnGrid.component.tsx:1791,
 * SOCKET_EVENTS.BULK_ASSETS_CHANNEL).
 */
export async function bulkUpdateColumnsAsync(
  columnUpdates: ColumnUpdateInput[],
): Promise<{ jobId?: string }> {
  const payload = await apiRequest<unknown>('/v1/columns/bulk-update-async', {
    method: 'POST',
    json: { columnUpdates: toRequestUpdates(columnUpdates) },
  });
  const rec = asRecord(payload) ?? {};
  return { jobId: asString(rec.jobId) || undefined };
}

export interface ColumnCsvFilters {
  columnNamePattern?: string;
  serviceName?: string;
  databaseName?: string;
  schemaName?: string;
  entityTypes?: string[];
  domainId?: string;
}

function columnCsvQuery(filters: ColumnCsvFilters, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined): void => {
    if (value) {
      params.set(key, value);
    }
  };
  set('columnName', filters.columnNamePattern);
  set('serviceName', filters.serviceName);
  set('databaseName', filters.databaseName);
  set('schemaName', filters.schemaName);
  set('domainId', filters.domainId);
  for (const entityType of filters.entityTypes ?? []) {
    if (entityType) {
      params.append('entityTypes', entityType);
    }
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value);
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

/**
 * Official columnAPI exportColumnsCSV: GET /v1/columns/export with the
 * grid filters, returning the CSV text (Accept: text/plain).
 */
export async function exportColumnsCsv(filters: ColumnCsvFilters): Promise<string> {
  return apiRequest<string>(`/v1/columns/export${columnCsvQuery(filters)}`, {
    response: 'text',
    headers: { Accept: 'text/plain' },
  });
}

/**
 * Official columnAPI importColumnsCSV: POST /v1/columns/import with the
 * CSV text body (Content-Type: text/plain). Unlike the entity bulk
 * import, this endpoint returns the CSVImportResult synchronously, so
 * dryRun preview and real apply are two calls to the same function.
 */
export async function importColumnsCsv(
  csv: string,
  filters: ColumnCsvFilters,
  dryRun: boolean,
): Promise<CsvImportResult> {
  const payload = await apiRequest<unknown>(
    `/v1/columns/import${columnCsvQuery(filters, { dryRun: String(dryRun) })}`,
    { method: 'POST', text: csv },
  );
  return mapCsvImportResult(payload);
}

/**
 * D-2 batch 3 single-column PUT (official `rest/tableAPI.ts:352-361`
 * `updateTableColumn` and `rest/dataModelsAPI.ts:165-175`
 * `updateDataModelColumn`): `PUT /v1/columns/name/{fqn}?entityType=...`
 * with a partial-column body. The official UI calls this only for Table
 * (`entityType=table`) and DataModel (`entityType=dashboardDataModel`);
 * Topic / Container / SearchIndex go through the whole-entity PATCH
 * instead (see `columnTagsPatch`). The response is the updated column.
 */
export type ColumnEntityType = 'table' | 'dashboardDataModel';

export interface ColumnPartialUpdate {
  description?: string;
  displayName?: string;
  constraint?: string;
  removeConstraint?: boolean;
  extension?: Record<string, unknown>;
  tags?: TagLabelValue[];
}

export async function updateColumnDetails(
  columnFqn: string,
  entityType: ColumnEntityType,
  partial: ColumnPartialUpdate,
): Promise<Record<string, unknown>> {
  const payload = await apiRequest<Record<string, unknown>>(
    `/v1/columns/name/${encodeFqnForApi(columnFqn)}?entityType=${entityType}`,
    { method: 'PUT', json: partial },
  );
  return payload;
}

/**
 * D-F2 single-column PUT (tags-only callers): the response's tags are
 * the write-back source, and when the response carries no tags at all
 * the sent labels stand in — the server contract returns the updated
 * column, so a tag-less body means a malformed response, not a silent
 * wipe. The stand-in display name is the tag FQN's last segment (the
 * same display name the server returns for a classified tag, e.g.
 * `PII.Email` -> `Email`), never the bare FQN.
 */
async function updateSingleColumn(
  columnFqn: string,
  entityType: ColumnEntityType,
  tags: TagLabelValue[],
): Promise<TagRef[]> {
  const payload = await updateColumnDetails(columnFqn, entityType, { tags });
  const returned = mapTags(payload.tags);
  if (payload.tags === undefined) {
    return tags.map((tag) => ({
      tagFQN: tag.tagFQN,
      name: tag.tagFQN.split('.').pop() ?? tag.tagFQN,
      source: tag.source,
      labelType: tag.labelType,
      state: tag.state,
    }));
  }
  return returned;
}

export async function updateTableColumn(columnFqn: string, tags: TagLabelValue[]): Promise<TagRef[]> {
  return updateSingleColumn(columnFqn, 'table', tags);
}

export async function updateDataModelColumn(
  columnFqn: string,
  tags: TagLabelValue[],
): Promise<TagRef[]> {
  return updateSingleColumn(columnFqn, 'dashboardDataModel', tags);
}

export type ColumnSortBy = 'name' | 'ordinalPosition';
export type ColumnSortOrder = 'asc' | 'desc';

export interface ColumnListParams {
  limit?: number;
  offset?: number;
  /** Official fields: Table `tags,customMetrics,extension`, DataModel `tags`. */
  fields?: string;
  sortBy?: ColumnSortBy;
  sortOrder?: ColumnSortOrder;
}

export interface ColumnListPage {
  data: unknown[];
  paging: { total?: number };
}

function columnListQuery(params: ColumnListParams): Record<string, string | number | undefined> {
  return {
    fields: params.fields,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    include: 'all',
    limit: params.limit,
    offset: params.offset,
  };
}

/**
 * D-2 batch 3 Table self-fetch (official `rest/tableAPI.ts:304-314`
 * `getTableColumnsByFQN`): `GET /v1/tables/name/{fqn}/columns`.
 */
export async function getTableColumnsByFQN(
  fqn: string,
  params: ColumnListParams = {},
): Promise<ColumnListPage> {
  const payload = await apiRequest<Record<string, unknown>>(
    `/v1/tables/name/${encodeFqnForApi(fqn)}/columns`,
    { query: columnListQuery({ fields: 'tags,customMetrics,extension', ...params }) },
  );
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    paging: (payload.paging as ColumnListPage['paging']) ?? {},
  };
}

export interface SearchTableColumnsParams extends ColumnListParams {
  q?: string;
  /** Comma-separated classification tag FQNs. */
  tags?: string;
  /** Comma-separated glossary term FQNs. */
  glossaryTerms?: string;
}

/**
 * D-2 batch 3 Table column search (official `rest/tableAPI.ts:338-348`
 * `searchTableColumnsByFQN`, D-F2-2 design): `GET
 * /v1/tables/name/{fqn}/columns/search` with `tags` / `glossaryTerms`
 * as comma-separated FQNs. The server prunes the column tree to
 * matches itself (`TableRepository` `pruneColumnsToMatches`, mirroring
 * the UI's `getFilteredTagsData`: a node is kept when it matches or
 * has a kept descendant), OR within each group and AND across the two
 * groups — so the caller passes the two groups separately and never
 * filters locally. `fields` carries `tags` because the server only
 * populates column tags when requested. `include: all` matches the
 * official client (the search endpoint defaults to non-deleted).
 * Replaces A6's `searchTableColumnsByFQN` (same endpoint, same params;
 * the return shape is the shared `ColumnListPage` `{data, paging}` so
 * the list and search clients stay uniform — A6's `{columns, total}`
 * wrapper is dropped; its callers now read `page.data` /
 * `page.paging.total`).
 */
export async function searchTableColumnsByFQN(
  fqn: string,
  params: SearchTableColumnsParams = {},
): Promise<ColumnListPage> {
  const payload = await apiRequest<Record<string, unknown>>(
    `/v1/tables/name/${encodeFqnForApi(fqn)}/columns/search`,
    {
      query: {
        ...columnListQuery({
          fields: 'tags,customMetrics,extension',
          // A6 (D-F2-2) preserved default: source order when the caller
          // passes no sort (the product has no tenant DefaultColumnOrder
          // setting; a name-sorted filtered page would reorder the table).
          sortBy: 'ordinalPosition',
          sortOrder: 'asc',
          ...params,
        }),
        q: params.q,
        tags: params.tags,
        glossaryTerms: params.glossaryTerms,
      },
    },
  );
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    paging: (payload.paging as ColumnListPage['paging']) ?? {},
  };
}

/**
 * D-2 batch 3 DataModel self-fetch (official
 * `rest/dataModelsAPI.ts:127-144` `getDataModelColumnsByFQN`): `GET
 * /v1/dashboard/datamodels/name/{fqn}/columns`.
 */
export async function getDataModelColumnsByFQN(
  fqn: string,
  params: ColumnListParams = {},
): Promise<ColumnListPage> {
  const payload = await apiRequest<Record<string, unknown>>(
    `/v1/dashboard/datamodels/name/${encodeFqnForApi(fqn)}/columns`,
    { query: columnListQuery({ fields: 'tags', ...params }) },
  );
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    paging: (payload.paging as ColumnListPage['paging']) ?? {},
  };
}

/**
 * D-2 batch 3 DataModel column search (official
 * `rest/dataModelsAPI.ts:146-163` `searchDataModelColumnsByFQN`): `GET
 * /v1/dashboard/datamodels/name/{fqn}/columns/search`. Unlike Table,
 * this endpoint takes no tags/glossaryTerms parameters — tag filtering
 * on this face stays client-side (A6 §2).
 */
export async function searchDataModelColumnsByFQN(
  fqn: string,
  params: SearchTableColumnsParams = {},
): Promise<ColumnListPage> {
  const payload = await apiRequest<Record<string, unknown>>(
    `/v1/dashboard/datamodels/name/${encodeFqnForApi(fqn)}/columns/search`,
    { query: { ...columnListQuery({ fields: 'tags', ...params }), q: params.q } },
  );
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    paging: (payload.paging as ColumnListPage['paging']) ?? {},
  };
}
