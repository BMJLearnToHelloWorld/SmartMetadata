/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import {
  clampLineageDepth,
  LINEAGE_DEPTH_DEFAULT,
} from '@/lineage/depth';
import {
  LINEAGE_SCENE_DEPTH_MAX,
  LINEAGE_SCENE_NODES_PER_LAYER_DEFAULT,
  type LineageBand,
  type LineageLens,
  type LineageScene,
} from '@/lineage/scene';
import { ApiError, apiRequest } from './client';
import { notifyCsvJobsRefresh } from './csvJobs';
import { asRecord, asString } from './json';

export interface FetchEntityLineageOptions {
  entityType: string;
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
}

export interface LineageEdgeEndpoints {
  fromType: string;
  fromFqn: string;
  toType: string;
  toFqn: string;
}

export interface PutEntityLineageOptions extends LineageEdgeEndpoints {
  /** Apache LineageDetails body; defaults to Manual source (MCP create_lineage). */
  details?: Record<string, unknown>;
}

function requireEdgeEndpoints(options: LineageEdgeEndpoints): LineageEdgeEndpoints {
  const fromType = options.fromType.trim();
  const fromFqn = options.fromFqn.trim();
  const toType = options.toType.trim();
  const toFqn = options.toFqn.trim();
  if (!fromType || !toType) {
    throw new Error('Lineage write requires from and to entity types');
  }
  if (!fromFqn || !toFqn) {
    throw new Error('Lineage write requires from and to FQNs');
  }
  return { fromType, fromFqn, toType, toFqn };
}

/** PUT /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} — same path as RestClient.put_lineage / MCP create_lineage. */
export function lineageEdgePath(options: LineageEdgeEndpoints): string {
  const edge = requireEdgeEndpoints(options);
  return (
    `/v1/lineage/${encodeURIComponent(edge.fromType)}/name/${encodeFqnForApi(edge.fromFqn)}` +
    `/${encodeURIComponent(edge.toType)}/name/${encodeFqnForApi(edge.toFqn)}`
  );
}

/**
 * GET /v1/lineage/{entity}/name/{fqn} — EntityLineage with depth 0–3.
 * Does not call the search-backed /getLineage endpoints.
 */
export async function fetchEntityLineage(options: FetchEntityLineageOptions): Promise<unknown> {
  const entityType = options.entityType.trim();
  const fqn = options.fqn.trim();
  if (!entityType) {
    throw new Error('Lineage requires an entity type');
  }
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  return apiRequest<unknown>(`/v1/lineage/${encodeURIComponent(entityType)}/name/${encodeFqnForApi(fqn)}`, {
    query: {
      upstreamDepth: clampLineageDepth(options.upstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      downstreamDepth: clampLineageDepth(options.downstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
    },
  });
}

export interface SearchLineageOptions {
  entityType: string;
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
  /** Nodes per layer; the server defaults to 1000 when omitted. */
  size?: number;
  from?: number;
  /** JSON query filter (pin getLineageDataByFQN `query_filter`). */
  queryFilter?: string;
  /** Column-level filter (pin getLineageDataByFQN `column_filter`). */
  columnFilter?: string;
  /**
   * Directional fetch (pin `LineageDirection`: 'Upstream' | 'Downstream'):
   * the request goes to `lineage/getLineage/{direction}`. Used by
   * load-on-expand, which fetches one level in a single direction.
   */
  direction?: 'Upstream' | 'Downstream';
  startTime?: number;
  endTime?: number;
}

/**
 * GET /v1/lineage/getLineage[/{direction}] — the search-backed lineage
 * endpoint the official lineage page uses (openmetadata-ui rest/lineageAPI.ts
 * getLineageDataByFQN). Unlike the traversal GET above, this endpoint
 * accepts query_filter/column_filter/size/from/startTime/endTime
 * (LineageResource.java:392-476, with validateTemporalBounds) and returns a
 * SearchLineageResult: nodes as a map keyed by FQN (NodeInformation: ES
 * entity map + nodeDepth + paging) plus upstreamEdges/downstreamEdges maps
 * (EsLineageData: fromEntity / toEntity {id, fullyQualifiedName, type} +
 * pipeline + sqlQuery + columns). See graphModel.mapSearchLineage for the
 * graph adapter. Time params are only sent when defined, so all-time stays
 * unfiltered.
 */
export async function searchLineage(options: SearchLineageOptions): Promise<unknown> {
  const entityType = options.entityType.trim();
  const fqn = options.fqn.trim();
  if (!entityType) {
    throw new Error('Lineage requires an entity type');
  }
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  const path = options.direction
    ? `/v1/lineage/getLineage/${options.direction}`
    : '/v1/lineage/getLineage';
  return apiRequest<unknown>(path, {
    query: {
      fqn,
      type: entityType,
      upstreamDepth: clampLineageDepth(options.upstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      downstreamDepth: clampLineageDepth(options.downstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      includeDeleted: false,
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.columnFilter !== undefined ? { column_filter: options.columnFilter } : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
}

export interface DataQualityLineageOptions {
  fqn: string;
  /** Pin getDataQualityLineage defaults upstreamDepth to 1. */
  upstreamDepth?: number;
  /** JSON query filter (pin `query_filter`). */
  queryFilter?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * GET /v1/lineage/getDataQualityLineage — the official DQ lineage fetch
 * (openmetadata-ui rest/lineageAPI.ts getDataQualityLineage; product
 * LineageResource.java:610 searchDataQualityLineage). Returns the failing-test
 * upstream walk as `{ nodes: [{ id, fullyQualifiedName, ... }], edges: [...] }`
 * (see RootCauseAnalysisTool.java: buildUpstreamAnalysis). The product server
 * declares fqn/upstreamDepth/query_filter/includeDeleted; startTime/endTime
 * are sent when defined, matching the pin client shape (the server ignores
 * undeclared query params). Callers must swallow failures: pin sets the DQ
 * lineage to undefined on error so a DQ failure never fails the graph.
 */
export async function getDataQualityLineage(options: DataQualityLineageOptions): Promise<unknown> {
  const fqn = options.fqn.trim();
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  return apiRequest<unknown>('/v1/lineage/getDataQualityLineage', {
    query: {
      fqn,
      upstreamDepth: Math.max(0, Math.trunc(options.upstreamDepth ?? 1)),
      includeDeleted: false,
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
}

export interface LineageExportAsyncOptions {
  fqn: string;
  entityType?: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
  /** JSON query filter (pin `query_filter`). */
  queryFilter?: string;
  startTime?: number;
  endTime?: number;
}

/** Async CSV export job record (pin `CSVExportResponse`: `{ jobId, message }`). */
export interface LineageCsvExportResponse {
  jobId: string;
  message: string;
}

/**
 * GET /v1/lineage/exportAsync — the official async CSV export
 * (openmetadata-ui rest/lineageAPI.ts exportLineageAsync :42-62; product
 * LineageResource.java:688-760). Depths default to 1, like pin's config
 * destructure. The server answers 202 with `{ jobId, message }`; the file
 * itself is downloaded from the CSV jobs tray
 * (`GET /v1/csvAsyncJobs/{jobId}/result`) — the caller marks the job owned
 * and notifies the tray, it never downloads inline here.
 */
export async function exportLineageAsync(
  options: LineageExportAsyncOptions,
): Promise<LineageCsvExportResponse> {
  const fqn = options.fqn.trim();
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  const payload = await apiRequest<unknown>('/v1/lineage/exportAsync', {
    query: {
      fqn,
      ...(options.entityType ? { type: options.entityType } : {}),
      upstreamDepth: clampLineageDepth(options.upstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      downstreamDepth: clampLineageDepth(options.downstreamDepth ?? LINEAGE_DEPTH_DEFAULT),
      includeDeleted: false,
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
  const rec = asRecord(payload) ?? {};
  return { jobId: asString(rec.jobId), message: asString(rec.message) };
}

/**
 * GET /v1/lineage/getLineageEdge/{fromId}/{toId} — the official edge-details
 * fetch (openmetadata-ui rest/lineageAPI.ts getLineageEdgeDetails :167-177;
 * product LineageResource.java:1129). Returns `response.edge`
 * (LineageDetails: columnsLineage, pipeline, source, …). The server 404s
 * when no edge exists; callers that probe for existing details
 * (saveLineageEdge) treat a 404 as "no existing details", any other
 * failure still rejects.
 */
export async function getLineageEdgeDetails(
  fromId: string,
  toId: string,
): Promise<Record<string, unknown>> {
  const from = fromId.trim();
  const to = toId.trim();
  if (!from || !to) {
    throw new Error('Lineage edge details require from and to entity ids');
  }
  const payload = await apiRequest<unknown>(
    `/v1/lineage/getLineageEdge/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
  );
  return asRecord(asRecord(payload)?.edge) ?? {};
}

/** True when an apiRequest failure is a 404 (no such edge/entity). */
export function isLineageNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * PUT lineage edge by name. Body defaults to `{ source: 'Manual' }` (MCP create_lineage).
 */
export async function putEntityLineage(options: PutEntityLineageOptions): Promise<unknown> {
  const path = lineageEdgePath(options);
  const details = options.details ?? { source: 'Manual' };
  return apiRequest<unknown>(path, {
    method: 'PUT',
    json: details,
  });
}

/**
 * DELETE /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} — RestClient.delete_lineage_by_name.
 * Wired by the canvas delete flows (node delete removes every connected
 * edge; edge delete removes the one edge).
 */
export async function deleteEntityLineageByName(options: LineageEdgeEndpoints): Promise<unknown> {
  return apiRequest<unknown>(lineageEdgePath(options), { method: 'DELETE' });
}

/** Pin `LineageDirection` (generated/api/lineage/lineageDirection): the count/export APIs take it as a path/query value, not the product's lowercase graph direction. */
export type LineageTableDirection = 'Upstream' | 'Downstream';

function requireLineageTableTarget(options: { fqn: string }): string {
  const fqn = options.fqn.trim();
  if (!fqn) {
    throw new Error('Lineage requires an FQN');
  }
  return fqn;
}

function requireLineageTableDirection(direction: unknown): LineageTableDirection {
  if (direction !== 'Upstream' && direction !== 'Downstream') {
    throw new Error("Lineage impact requires direction 'Upstream' or 'Downstream'");
  }
  return direction;
}

function requireLineageTableDepth(nodeDepth: unknown): number {
  if (typeof nodeDepth !== 'number' || !Number.isFinite(nodeDepth) || nodeDepth < 0) {
    throw new Error('Lineage impact requires a node depth of 0 or more');
  }
  return Math.trunc(nodeDepth);
}

export interface LineageEntityCountOptions {
  fqn: string;
  entityType: string;
  direction: LineageTableDirection;
  nodeDepth: number;
  /** Defaults to nodeDepth (pin getLineageByEntityCount: `maxDepth ?? nodeDepth`). */
  maxDepth?: number;
  upstreamDepth?: number;
  downstreamDepth?: number;
  from?: number;
  size?: number;
  queryFilter?: string;
  columnFilter?: string;
  includePaginationInfo?: boolean;
  startTime?: number;
  endTime?: number;
}

/**
 * GET /v1/lineage/getLineageByEntityCount — the official impact-table fetch
 * (openmetadata-ui rest/lineageAPI.ts getLineageByEntityCount; product
 * LineageResource.java:913). Returns a SearchLineageResult: nodes as a map
 * keyed by FQN (NodeInformation: ES entity map + nodeDepth + paging) plus
 * upstreamEdges/downstreamEdges maps, and — only when
 * `include_pagination_info` is true — a `paginationInfo` object with
 * per-depth entity counts. Unlike the graph's searchLineage, the depth
 * here is the impact depth (pin passes it straight through; the
 * 0–3 graph clamp does not apply) and `type` is never sent (pin sends
 * `type: undefined`, `entityType` carries the type).
 */
export async function getLineageByEntityCount(options: LineageEntityCountOptions): Promise<unknown> {
  const fqn = requireLineageTableTarget(options);
  const direction = requireLineageTableDirection(options.direction);
  const nodeDepth = requireLineageTableDepth(options.nodeDepth);
  const entityType = options.entityType.trim();
  if (!entityType) {
    throw new Error('Lineage requires an entity type');
  }
  return apiRequest<unknown>('/v1/lineage/getLineageByEntityCount', {
    query: {
      fqn,
      entityType,
      direction,
      nodeDepth,
      maxDepth: options.maxDepth ?? nodeDepth,
      ...(options.upstreamDepth !== undefined ? { upstreamDepth: options.upstreamDepth } : {}),
      ...(options.downstreamDepth !== undefined ? { downstreamDepth: options.downstreamDepth } : {}),
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.columnFilter !== undefined ? { column_filter: options.columnFilter } : {}),
      ...(options.includePaginationInfo !== undefined
        ? { include_pagination_info: options.includePaginationInfo }
        : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
}

export interface LineageEntityCountExportOptions {
  fqn: string;
  entityType: string;
  direction: LineageTableDirection;
  nodeDepth: number;
  /** Defaults to nodeDepth (pin exportLineageByEntityCountAsync: `maxDepth ?? nodeDepth`). */
  maxDepth?: number;
  from?: number;
  size?: number;
  queryFilter?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * GET /v1/lineage/exportByEntityCountAsync — the official impact-table CSV
 * export (openmetadata-ui rest/lineageAPI.ts exportLineageByEntityCountAsync;
 * product LineageResource.java:821). The server answers 202 with the async
 * job record; only its `jobId` is read here, so the export wiring can claim
 * the job for the CSV jobs tray (markCsvJobOwned, as in TeamDetailView) —
 * the same shape as metrics.ts exportMetricsCsvAsync. On success the CSV
 * jobs tray is told to refresh, so the job appears even if the tray has not
 * polled yet. When the response carries no jobId the caller only gets the
 * refresh event — a jobId is never invented
 * (ADR:2026-11-08-csv-job-owned-memory-set).
 */
export interface LineageCsvExportJob {
  jobId?: string;
}

export async function exportLineageByEntityCountAsync(
  options: LineageEntityCountExportOptions,
): Promise<LineageCsvExportJob> {
  const fqn = requireLineageTableTarget(options);
  const direction = requireLineageTableDirection(options.direction);
  const nodeDepth = requireLineageTableDepth(options.nodeDepth);
  const entityType = options.entityType.trim();
  if (!entityType) {
    throw new Error('Lineage requires an entity type');
  }
  const payload = await apiRequest<unknown>('/v1/lineage/exportByEntityCountAsync', {
    query: {
      fqn,
      entityType,
      direction,
      nodeDepth,
      maxDepth: options.maxDepth ?? nodeDepth,
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.size !== undefined ? { size: options.size } : {}),
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
  notifyCsvJobsRefresh();
  const jobId = asString(asRecord(payload)?.jobId);
  return jobId ? { jobId } : {};
}

export interface LineagePagingDataOptions {
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
  entityType?: string;
  queryFilter?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * GET /v1/lineage/getPaginationInfo — the official pagination-info fetch
 * (openmetadata-ui rest/lineageAPI.ts getLineagePagingData; product
 * LineageResource.java:761). Returns `LineagePaginationInfo`: per-depth
 * entity counts (`downstreamDepthInfo` / `upstreamDepthInfo`) plus max
 * depths and totals. The impact table normally gets this from
 * getLineageByEntityCount with `include_pagination_info`; this call is
 * the fallback when a count response omits it, so the depth options and
 * direction counts still resolve instead of rendering empty.
 */
export async function getLineagePagingData(options: LineagePagingDataOptions): Promise<unknown> {
  const fqn = requireLineageTableTarget(options);
  return apiRequest<unknown>('/v1/lineage/getPaginationInfo', {
    query: {
      fqn,
      ...(options.upstreamDepth !== undefined ? { upstreamDepth: options.upstreamDepth } : {}),
      ...(options.downstreamDepth !== undefined ? { downstreamDepth: options.downstreamDepth } : {}),
      ...(options.entityType !== undefined ? { entityType: options.entityType } : {}),
      ...(options.queryFilter !== undefined ? { query_filter: options.queryFilter } : {}),
      ...(options.startTime !== undefined ? { startTime: options.startTime } : {}),
      ...(options.endTime !== undefined ? { endTime: options.endTime } : {}),
    },
  });
}

export interface GetLineageSceneOptions {
  lens: LineageLens;
  band: LineageBand;
  focusFqn?: string;
  entityType?: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
  /** Nodes per layer; the official scene default is 200. */
  nodesPerLayer?: number;
  queryFilter?: string;
}

function clampSceneDepth(value: number | undefined): number {
  return Math.min(LINEAGE_SCENE_DEPTH_MAX, clampLineageDepth(value ?? LINEAGE_DEPTH_DEFAULT));
}

/**
 * GET /v1/lineage/scene — the platform scene map endpoint (official
 * rest/lineageAPI.ts getLineageScene). Depths default to 1/1 and are
 * capped at 3 (official MAX_SCENE_DEPTH); size defaults to 200 nodes
 * per layer; deleted entities are never included.
 */
export async function getLineageScene(options: GetLineageSceneOptions): Promise<LineageScene> {
  const focusFqn = options.focusFqn?.trim() || undefined;
  const entityType = options.entityType?.trim() || undefined;
  if ((focusFqn && !entityType) || (!focusFqn && entityType)) {
    throw new Error('Lineage scene focus requires both an FQN and an entity type');
  }
  return apiRequest<LineageScene>('/v1/lineage/scene', {
    query: {
      focusFqn,
      entityType,
      lens: options.lens,
      band: options.band,
      upstreamDepth: clampSceneDepth(options.upstreamDepth),
      downstreamDepth: clampSceneDepth(options.downstreamDepth),
      query_filter: options.queryFilter?.trim() || undefined,
      includeDeleted: false,
      size: options.nodesPerLayer ?? LINEAGE_SCENE_NODES_PER_LAYER_DEFAULT,
    },
  });
}
