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
import { resolveDetailEndpoint, resolveFollowersPath, resolvePatchPath, resolveVersionsPath } from '@/catalog/entityRoutes';
import { mapTableJoins } from '@/catalog/tableJoins';
import { mapUsageSummary } from '@/catalog/usagePercentile';
import type { AssetDetail, EntityRef, EntityVotes, MlHyperParameter, PartitionColumnDetails, SchemaRow, TableConstraint, TableConstraintType, TagRef } from '@/types/api';
import { mapCatalogPipelineStatus, mapPipelineTask } from './catalogPipelines';
import { apiRequest } from './client';
import { asNumber, mapEntityRefs } from './json';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mapVotes(value: unknown): EntityVotes | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    upVotes: asNumber(rec.upVotes),
    downVotes: asNumber(rec.downVotes),
    upVoters: mapOwners(rec.upVoters),
    downVoters: mapOwners(rec.downVoters),
  };
}

function mapOwners(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.displayName) || asString(rec.name) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    return [
      {
        id: id || undefined,
        name: name || id,
        displayName: asString(rec.displayName) || undefined,
        type: asString(rec.type) || undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
      },
    ];
  });
}

export function mapTags(value: unknown): TagRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const tagFQN = asString(rec.tagFQN);
    const name = asString(rec.name) || tagFQN;
    const source = asString(rec.source);
    const labelType = asString(rec.labelType);
    const state = asString(rec.state);
    return name || tagFQN
      ? [
          {
            tagFQN: tagFQN || name,
            name: name || tagFQN,
            source: source === 'Glossary' || source === 'Classification' ? source : undefined,
            labelType:
              labelType === 'Automated' ||
              labelType === 'Derived' ||
              labelType === 'Generated' ||
              labelType === 'Manual' ||
              labelType === 'Propagated'
                ? labelType
                : undefined,
            // D-F2: the column write round-trip preserves a Suggested
            // label's state through the mapping, so a later edit does
            // not silently flip it to Confirmed (same validation shape
            // as labelType above).
            state: state === 'Confirmed' || state === 'Suggested' ? state : undefined,
          },
        ]
      : [];
  });
}

/**
 * Maps columns recursively: a STRUCT column's nested columns become its
 * children, following the official SchemaTable's two guards — empty children
 * are dropped rather than attached, so leaf columns never draw an expand
 * icon for an empty list. Tags, the column FQN and the positional path are
 * carried (D-F2): tags feed the Tags / Glossary Terms columns, the FQN
 * feeds the single-column PUT, and the index path feeds the PATCH group's
 * JSON Patch path for nested fields.
 */
function mapColumns(value: unknown, prefix = '', path: number[] = []): SchemaRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name);
    if (!name) {
      return [];
    }
    const key = prefix ? `${prefix}.${name}` : name;
    const indexPath = [...path, index];
    const children = mapColumns(rec.children, key, indexPath);
    const tags = mapTags(rec.tags);
    return [
      {
        key,
        name,
        dataType: asString(rec.dataTypeDisplay) || asString(rec.dataType),
        description: asString(rec.description) || undefined,
        children: children.length ? children : undefined,
        tags: tags.length ? tags : undefined,
        fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
        indexPath,
      },
    ];
  });
}

/**
 * Returns a copy of `rows` with the tags of the row whose `key` matches
 * replaced by `tags` (D-F2 write回写): the match may sit at any nesting
 * depth, and only that row is touched. The replacement list is the row's
 * full tag list (both sources merged, as the official TagsContainerV2
 * sends it), never a single-source subset.
 */
export function updateSchemaRowTags(rows: SchemaRow[], key: string, tags: TagRef[]): SchemaRow[] {
  return rows.map((row) => {
    if (row.key === key) {
      return { ...row, tags: tags.length ? [...tags] : undefined };
    }
    if (row.children?.length) {
      return { ...row, children: updateSchemaRowTags(row.children, key, tags) };
    }
    return row;
  });
}

function schemaRowsFor(entityType: string, body: Record<string, unknown>): { rows: SchemaRow[]; label: string } {
  if (entityType === 'table') {
    return { rows: mapColumns(body.columns), label: 'Columns' };
  }
  if (entityType === 'topic') {
    const schema = asRecord(body.messageSchema);
    return { rows: mapColumns(schema?.schemaFields), label: 'Schema fields' };
  }
  if (entityType === 'container') {
    const model = asRecord(body.dataModel);
    return { rows: mapColumns(model?.columns), label: 'Columns' };
  }
  if (entityType === 'searchIndex') {
    return { rows: mapColumns(body.fields), label: 'Fields' };
  }
  if (entityType === 'dashboardDataModel') {
    return { rows: mapColumns(body.columns), label: 'Columns' };
  }
  return { rows: [], label: 'Schema' };
}

function mapHyperParameters(value: unknown): MlHyperParameter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name = asString(rec.name);
    if (!name) {
      return [];
    }
    return [
      {
        name,
        value: asString(rec.value) || undefined,
        description: asString(rec.description) || undefined,
      },
    ];
  });
}

function mapStoredProcedureCode(value: unknown): AssetDetail['storedProcedureCode'] {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const language = asString(rec.language) || undefined;
  const code = asString(rec.code) || undefined;
  if (!language && !code) {
    return undefined;
  }
  return { language, code };
}

function relatedRefsFor(entityType: string, body: Record<string, unknown>): EntityRef[] {
  if (entityType === 'chart') {
    return mapEntityRefs(body.dashboards);
  }
  if (entityType === 'database') {
    return mapEntityRefs(body.databaseSchemas);
  }
  if (entityType === 'databaseSchema') {
    return mapEntityRefs(body.tables);
  }
  return mapEntityRefs(body.children);
}

function mapStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

const TABLE_CONSTRAINT_TYPES: readonly TableConstraintType[] = [
  'PRIMARY_KEY',
  'UNIQUE',
  'FOREIGN_KEY',
  'SORT_KEY',
  'DIST_KEY',
  'CLUSTER_KEY',
];

/**
 * Table partition columns (official `tablePartition.columns`): only
 * rows with a column name survive; the interval type is kept verbatim
 * and rendered as-is (`--` when absent, per the pin widget).
 */
function mapPartitionColumns(value: unknown): PartitionColumnDetails[] {
  const rec = asRecord(value);
  if (!rec || !Array.isArray(rec.columns)) {
    return [];
  }
  return rec.columns.flatMap((item) => {
    const column = asRecord(item);
    const columnName = column ? asString(column.columnName) : '';
    if (!columnName) {
      return [];
    }
    const intervalType = (column ? asString(column.intervalType) : '') || undefined;
    return intervalType ? [{ columnName, intervalType }] : [{ columnName }];
  });
}

/**
 * Table constraints (official generated `TableConstraint`): unknown
 * constraint types are dropped rather than rendered under a wrong
 * heading; string lists keep strings only.
 */
function mapTableConstraints(value: unknown): TableConstraint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const constraintType = asString(rec.constraintType);
    if (!TABLE_CONSTRAINT_TYPES.includes(constraintType as TableConstraintType)) {
      return [];
    }
    const columns = mapStringList(rec.columns);
    const referredColumns = mapStringList(rec.referredColumns);
    const relationshipType = asString(rec.relationshipType) || undefined;
    return [
      {
        constraintType: constraintType as TableConstraintType,
        ...(columns.length ? { columns } : {}),
        ...(referredColumns.length ? { referredColumns } : {}),
        ...(relationshipType ? { relationshipType } : {}),
      },
    ];
  });
}

function mapRef(value: unknown): EntityRef | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const name = asString(rec.displayName) || asString(rec.name) || asString(rec.fullyQualifiedName);
  const id = asString(rec.id);
  if (!name && !id) {
    return undefined;
  }
  return {
    id: id || undefined,
    name: name || id,
    displayName: asString(rec.displayName) || undefined,
    type: asString(rec.type) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
  };
}

export interface FetchAssetDetailOptions {
  /**
   * Permission-gated fields appended to the endpoint's field set (e.g.
   * `usageSummary`, only when the viewer holds VIEW_USAGE). The caller
   * decides; this function never requests a gated field on its own.
   */
  extraFields?: string[];
}

export async function fetchAssetDetail(
  entityType: string,
  fqn: string,
  options: FetchAssetDetailOptions = {},
): Promise<AssetDetail> {
  const endpoint = resolveDetailEndpoint(entityType, fqn);
  if (!endpoint) {
    throw new Error(`No Phase 1 detail endpoint for entity type "${entityType}"`);
  }
  const fields = [...endpoint.fields.split(','), ...(options.extraFields ?? [])]
    .filter((field, index, all) => field && all.indexOf(field) === index)
    .join(',');
  const body = await apiRequest<Record<string, unknown>>(endpoint.path, {
    query: { fields },
  });
  const schema = schemaRowsFor(entityType, body);
  const code =
    mapStoredProcedureCode(body.storedProcedureCode) ?? mapStoredProcedureCode(body.metricExpression);
  const relatedChildren = relatedRefsFor(entityType, body);
  const tasks = Array.isArray(body.tasks)
    ? body.tasks.flatMap((item) => {
        const mapped = mapPipelineTask(item);
        return mapped ? [mapped] : [];
      })
    : [];
  const pipelineStatus = mapCatalogPipelineStatus(body.pipelineStatus) ?? undefined;
  const partitionColumns = mapPartitionColumns(body.tablePartition);
  const tableConstraints = mapTableConstraints(body.tableConstraints);
  const aliases = mapStringList(body.aliases);
  return {
    entityType,
    id: asString(body.id) || undefined,
    name: asString(body.name) || asString(body.displayName) || fqn,
    displayName: asString(body.displayName) || undefined,
    fullyQualifiedName: asString(body.fullyQualifiedName) || fqn,
    description: asString(body.description) || undefined,
    tableType: asString(body.tableType) || undefined,
    serviceType: asString(body.serviceType) || undefined,
    service: mapRef(body.service),
    database: mapRef(body.database),
    databaseSchema: mapRef(body.databaseSchema),
    // The Table schema carries no `partitions` count field, so the
    // overview count is derived from the partition columns when the
    // server sends none (a topic's own `partitions` number still wins).
    partitions:
      typeof body.partitions === 'number'
        ? body.partitions
        : entityType === 'table' && partitionColumns.length > 0
          ? partitionColumns.length
          : undefined,
    tablePartition: partitionColumns.length > 0 ? { columns: partitionColumns } : undefined,
    tableConstraints: tableConstraints.length > 0 ? tableConstraints : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    sourceUrl: asString(body.sourceUrl) || undefined,
    scheduleInterval: asString(body.scheduleInterval) || undefined,
    pipelineState: asString(body.state) || undefined,
    project: asString(body.project) || undefined,
    dashboardType: asString(body.dashboardType) || undefined,
    chartType: asString(body.chartType) || undefined,
    metricType: asString(body.metricType) || undefined,
    unitOfMeasurement: asString(body.unitOfMeasurement) || undefined,
    granularity: asString(body.granularity) || undefined,
    dataModelType: asString(body.dataModelType) || undefined,
    algorithm: asString(body.algorithm) || undefined,
    target: asString(body.target) || undefined,
    prefix: asString(body.prefix) || undefined,
    numberOfObjects: asNumber(body.numberOfObjects),
    size: asNumber(body.size),
    fileFormats: mapStringList(body.fileFormats),
    indexType: asString(body.indexType) || undefined,
    storedProcedureType: asString(body.storedProcedureType) || undefined,
    storedProcedureCode: code,
    parent: mapRef(body.parent),
    children: relatedChildren,
    charts: mapEntityRefs(body.charts),
    dataModels: mapEntityRefs(body.dataModels),
    mlFeatures: mapColumns(body.mlFeatures),
    mlHyperParameters: mapHyperParameters(body.mlHyperParameters),
    tasks,
    pipelineStatus,
    owners: mapOwners(body.owners),
    followers: mapOwners(body.followers),
    votes: mapVotes(body.votes),
    tags: mapTags(body.tags),
    domains: mapOwners(body.domains),
    schemaRows: schema.rows,
    schemaLabel: schema.label,
    // P2 B5: API endpoint detail fields (entity/data/apiEndpoint.json).
    apiEndpointUrl: asString(body.endpointURL) || undefined,
    apiRequestMethod: asString(body.requestMethod) || undefined,
    apiRequestSchema: asRecord(body.requestSchema) || undefined,
    apiResponseSchema: asRecord(body.responseSchema) || undefined,
    extension: asRecord(body.extension) || undefined,
    usageSummary: mapUsageSummary(body.usageSummary),
    joins: mapTableJoins(body.joins),
    deleted: typeof body.deleted === 'boolean' ? body.deleted : undefined,
  };
}

export interface ChangeField {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface ChangeDescription {
  fieldsAdded?: ChangeField[];
  fieldsDeleted?: ChangeField[];
  fieldsUpdated?: ChangeField[];
  /** Version this change supersedes (EntityHistory previousVersion); drives the Major badge. */
  previousVersion?: string;
}

export interface EntityVersion {
  version?: number | string;
  updatedAt?: number;
  updatedBy?: string;
  changeDescription?: ChangeDescription;
}

function mapChangeFields(value: unknown): ChangeField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    return [
      {
        field: asString(rec.name) || asString(rec.field) || undefined,
        oldValue: rec.oldValue,
        newValue: rec.newValue,
      },
    ];
  });
}

export function mapChangeDescription(value: unknown): ChangeDescription | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const fieldsAdded = mapChangeFields(rec.fieldsAdded);
  const fieldsDeleted = mapChangeFields(rec.fieldsDeleted);
  const fieldsUpdated = mapChangeFields(rec.fieldsUpdated);
  // The wire shape is numeric (auditLogs maps it with asNumber); the
  // interface keeps the string form the diff module parses, so coerce
  // numbers instead of dropping them the way asString would.
  const rawPrevious = rec.previousVersion;
  const previousVersion =
    typeof rawPrevious === 'number'
      ? String(rawPrevious)
      : asString(rawPrevious) || undefined;
  if (!fieldsAdded.length && !fieldsDeleted.length && !fieldsUpdated.length) {
    return previousVersion ? { fieldsAdded, fieldsDeleted, fieldsUpdated, previousVersion } : undefined;
  }
  return { fieldsAdded, fieldsDeleted, fieldsUpdated, previousVersion };
}

/**
 * Official add/remove-follower pattern, per collection:
 * PUT /v1/{collection}/{id}/followers (body: userId),
 * DELETE /v1/{collection}/{id}/followers/{userId}.
 */
export async function followAsset(entityType: string, id: string, userId: string): Promise<unknown> {
  const path = resolveFollowersPath(entityType, id);
  if (!path) {
    throw new Error(`No followers endpoint for entity type "${entityType}"`);
  }
  return apiRequest(path, { method: 'PUT', json: userId });
}

export async function unfollowAsset(entityType: string, id: string, userId: string): Promise<unknown> {
  const path = resolveFollowersPath(entityType, id);
  if (!path) {
    throw new Error(`No followers endpoint for entity type "${entityType}"`);
  }
  return apiRequest(`${path}/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

/**
 * Version history for an entity, following the official per-entity
 * /v1/{collection}/{id}/versions endpoint shape (EntityHistory.versions).
 * The caller owns the empty/error states: a backend that does not serve
 * versions must surface as an honest empty, never as invented rows.
 */
export async function listEntityVersions(entityType: string, id: string): Promise<EntityVersion[]> {
  const versionsPath = resolveVersionsPath(entityType, id);
  if (!versionsPath) {
    throw new Error(`No version endpoint for entity type "${entityType}"`);
  }
  const body = await apiRequest<Record<string, unknown>>(versionsPath);
  const versions = body.versions;
  if (!Array.isArray(versions)) {
    return [];
  }
  return versions.flatMap((item) => {
    if (item === null || typeof item !== 'object') {
      return [];
    }
    const rec = item as Record<string, unknown>;
    return [
      {
        version: typeof rec.version === 'number' || typeof rec.version === 'string' ? rec.version : undefined,
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : undefined,
        updatedBy: typeof rec.updatedBy === 'string' ? rec.updatedBy : undefined,
        changeDescription: mapChangeDescription(rec.changeDescription),
      },
    ];
  });
}

export function patchAsset(entityType: string, id: string, patch: JsonPatchOp[]): Promise<unknown> {
  const path = resolvePatchPath(entityType, id);
  if (!path) {
    throw new Error(`No Phase 4 patch endpoint for entity type "${entityType}"`);
  }
  return apiRequest(path, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}
