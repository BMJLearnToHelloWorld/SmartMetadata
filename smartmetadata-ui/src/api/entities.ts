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
import { resolveDetailEndpoint, resolvePatchPath, resolveVersionsPath } from '@/catalog/entityRoutes';
import type { AssetDetail, EntityRef, MlHyperParameter, SchemaRow, TagRef } from '@/types/api';
import { mapCatalogPipelineStatus, mapPipelineTask } from './catalogPipelines';
import { apiRequest } from './client';
import { asNumber, mapEntityRefs } from './json';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
    return name || tagFQN
      ? [
          {
            tagFQN: tagFQN || name,
            name: name || tagFQN,
            source: source === 'Glossary' || source === 'Classification' ? source : undefined,
          },
        ]
      : [];
  });
}

function mapColumns(value: unknown): SchemaRow[] {
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
        dataType: asString(rec.dataTypeDisplay) || asString(rec.dataType),
        description: asString(rec.description) || undefined,
      },
    ];
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

export async function fetchAssetDetail(entityType: string, fqn: string): Promise<AssetDetail> {
  const endpoint = resolveDetailEndpoint(entityType, fqn);
  if (!endpoint) {
    throw new Error(`No Phase 1 detail endpoint for entity type "${entityType}"`);
  }
  const body = await apiRequest<Record<string, unknown>>(endpoint.path, {
    query: { fields: endpoint.fields },
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
    partitions: typeof body.partitions === 'number' ? body.partitions : undefined,
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
    tags: mapTags(body.tags),
    domains: mapOwners(body.domains),
    schemaRows: schema.rows,
    schemaLabel: schema.label,
    extension: asRecord(body.extension) || undefined,
  };
}

export interface EntityVersion {
  version?: number | string;
  updatedAt?: number;
  updatedBy?: string;
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
