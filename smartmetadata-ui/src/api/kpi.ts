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
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { InsightResultPoint } from '@/api/dataInsights';
import type { Paged } from '@/types/admin';
import type {
  CreateKpiRequest,
  DeleteKpiOptions,
  Kpi,
  KpiResult,
  KpiTarget,
  ListKpiResultsQuery,
} from '@/types/kpi';
import { apiRequest } from './client';

/** Matches `KpiResource.FIELDS` so list/detail include the chart ref and stored result. */
export const KPI_FIELDS = 'owners,dataInsightChart,kpiResult';

export interface ListKpisQuery {
  limit?: number;
  after?: string;
}

function mapKpiTarget(raw: Record<string, unknown>): KpiTarget | null {
  const name = asString(raw.name);
  const value = asString(raw.value);
  if (!name && !value) {
    return null;
  }
  return {
    name: name || value,
    value,
    targetMet: asBoolean(raw.targetMet),
  };
}

export function mapKpiResult(raw: Record<string, unknown>): KpiResult | undefined {
  const timestamp = asNumber(raw.timestamp);
  const rows = Array.isArray(raw.targetResult) ? raw.targetResult : [];
  const targetResult = rows.flatMap((item) => {
    const rec = asRecord(item);
    const mapped = rec ? mapKpiTarget(rec) : null;
    return mapped ? [mapped] : [];
  });
  if (timestamp === undefined && !targetResult.length) {
    return undefined;
  }
  return {
    timestamp,
    kpiFqn: asString(raw.kpiFqn) || undefined,
    targetResult,
  };
}

function mapInsightPoint(raw: Record<string, unknown>): InsightResultPoint | null {
  const count = asNumber(raw.count);
  const day = asNumber(raw.day);
  const group = asString(raw.group) || undefined;
  const term = asString(raw.term) || undefined;
  const metric = asString(raw.metric) || undefined;
  if (count === undefined && day === undefined && !group && !term) {
    return null;
  }
  return { count, day, group, term, metric };
}

/** Map `DataInsightCustomChartResult` / result-list payloads without inventing points. */
export function mapKpiResultPoints(payload: unknown): InsightResultPoint[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.results)
    ? root.results
    : Array.isArray(payload)
      ? payload
      : [];
  return rows.flatMap((item) => {
    const rec = asRecord(item);
    const mapped = rec ? mapInsightPoint(rec) : null;
    return mapped ? [mapped] : [];
  });
}

export function mapKpi(raw: Record<string, unknown>): Kpi | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const chartRefs = mapEntityRefs(raw.dataInsightChart ? [raw.dataInsightChart] : []);
  const resultRec = asRecord(raw.kpiResult);
  return {
    id: asString(raw.id) || undefined,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    description: asString(raw.description) || undefined,
    metricType: asString(raw.metricType) || undefined,
    targetValue: asNumber(raw.targetValue),
    startDate: asNumber(raw.startDate),
    endDate: asNumber(raw.endDate),
    dataInsightChart: chartRefs[0],
    kpiResult: resultRec ? mapKpiResult(resultRec) : undefined,
    owners: mapEntityRefs(raw.owners),
  };
}

async function parseKpiResponse(raw: unknown, context: string): Promise<Kpi> {
  const rec = asRecord(raw);
  const mapped = rec ? mapKpi(rec) : null;
  if (!mapped) {
    throw new Error(`${context} succeeded but the response had no KPI`);
  }
  return mapped;
}

export function listKpis(query: ListKpisQuery = {}): Promise<Paged<Kpi>> {
  return apiRequest<unknown>('/v1/kpi', {
    query: {
      fields: KPI_FIELDS,
      limit: query.limit ?? 25,
      after: query.after,
    },
  }).then((payload) => parsePaged(payload, mapKpi));
}

export async function getKpiByName(name: string): Promise<Kpi> {
  const raw = await apiRequest<unknown>(`/v1/kpi/name/${encodeURIComponent(name)}`, {
    query: { fields: KPI_FIELDS },
  });
  return parseKpiResponse(raw, 'Get KPI by name');
}

export async function getKpiById(id: string): Promise<Kpi> {
  const raw = await apiRequest<unknown>(`/v1/kpi/${encodeURIComponent(id)}`, {
    query: { fields: KPI_FIELDS },
  });
  return parseKpiResponse(raw, 'Get KPI by id');
}

/** Apache `POST /v1/kpi` — CreateKpiRequest. */
export async function createKpi(body: CreateKpiRequest): Promise<Kpi> {
  const raw = await apiRequest<unknown>('/v1/kpi', {
    method: 'POST',
    json: body,
  });
  return parseKpiResponse(raw, 'Create KPI');
}

/** Apache `PUT /v1/kpi` — createOrUpdate with CreateKpiRequest. */
export async function updateKpi(body: CreateKpiRequest): Promise<Kpi> {
  const raw = await apiRequest<unknown>('/v1/kpi', {
    method: 'PUT',
    json: body,
  });
  return parseKpiResponse(raw, 'Update KPI');
}

/** Apache `PATCH /v1/kpi/{id}` — RFC 6902; product EditKPIPage uses this. */
export async function patchKpi(id: string, patch: JsonPatchOp[]): Promise<Kpi> {
  const raw = await apiRequest<unknown>(`/v1/kpi/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  return parseKpiResponse(raw, 'Patch KPI');
}

/** Apache `PATCH /v1/kpi/name/{fqn}` — RFC 6902 by name. */
export async function patchKpiByName(fqn: string, patch: JsonPatchOp[]): Promise<Kpi> {
  const raw = await apiRequest<unknown>(`/v1/kpi/name/${encodeURIComponent(fqn)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  return parseKpiResponse(raw, 'Patch KPI by name');
}

/** Apache `DELETE /v1/kpi/{id}`; product KPIList hard-deletes via entity delete. */
export function deleteKpi(id: string, options: DeleteKpiOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/kpi/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: {
      hardDelete: options.hardDelete,
      recursive: options.recursive,
    },
  });
}

/** Apache `DELETE /v1/kpi/name/{name}`. */
export function deleteKpiByName(name: string, options: DeleteKpiOptions = {}): Promise<unknown> {
  return apiRequest(`/v1/kpi/name/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    query: {
      hardDelete: options.hardDelete,
    },
  });
}

/**
 * Apache `GET /v1/kpi/{name}/kpiResult` — product `getListKpiResult`.
 * Returns chart result points only; no history-chart UI invent.
 */
export async function listKpiResults(
  name: string,
  query: ListKpiResultsQuery,
): Promise<InsightResultPoint[]> {
  const raw = await apiRequest<unknown>(`/v1/kpi/${encodeURIComponent(name)}/kpiResult`, {
    query: {
      startTs: query.startTs,
      endTs: query.endTs,
      orderBy: query.orderBy ?? 'ASC',
    },
  });
  return mapKpiResultPoints(raw);
}

/** Apache `GET /v1/kpi/{name}/latestKpiResult` — product `getLatestKpiResult`. */
export async function getLatestKpiResult(name: string): Promise<KpiResult | undefined> {
  const raw = await apiRequest<unknown>(`/v1/kpi/${encodeURIComponent(name)}/latestKpiResult`);
  const rec = asRecord(raw);
  return rec ? mapKpiResult(rec) : undefined;
}
