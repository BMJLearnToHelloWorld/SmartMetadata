/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type { Kpi, KpiResult, KpiTarget } from '@/types/kpi';
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

function mapKpiResult(raw: Record<string, unknown>): KpiResult | undefined {
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
  const rec = asRecord(raw);
  const mapped = rec ? mapKpi(rec) : null;
  if (!mapped) {
    throw new Error('KPI response was missing name');
  }
  return mapped;
}
