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
import { mapTags } from '@/api/entities';
import { asBoolean, asString } from '@/api/json';
import type { IncludeFilter } from '@/types/admin';
import type { TagRef } from '@/types/api';

export interface ChartRow {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  chartType?: string;
  description?: string;
  tags: TagRef[];
  deleted?: boolean;
}

function mapChart(raw: Record<string, unknown>): ChartRow | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  return {
    id: asString(raw.id) || name,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    chartType: asString(raw.chartType) || undefined,
    description: asString(raw.description) || undefined,
    tags: mapTags(raw.tags),
    deleted: asBoolean(raw.deleted) ? true : undefined,
  };
}

/**
 * Official getChartById (rest/chartAPI.ts:20): GET /v1/charts/{id} with
 * fields=tags (the chart table only ever reads tags off the chart).
 */
export async function getChartById(id: string, include?: IncludeFilter): Promise<ChartRow> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/charts/${encodeURIComponent(id)}`, {
    query: { fields: 'tags', include: include ?? 'non-deleted' },
  });
  const mapped = mapChart(raw);
  if (!mapped) {
    throw new Error('Chart response was missing id and name');
  }
  return mapped;
}

/**
 * Official updateChart (rest/chartAPI.ts:28): PATCH /v1/charts/{id} with
 * a JSON Patch document; returns the updated chart.
 */
export async function updateChart(id: string, patch: unknown[]): Promise<ChartRow> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/charts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
  const mapped = mapChart(raw);
  if (!mapped) {
    throw new Error('Update chart succeeded but the response had no chart');
  }
  return mapped;
}

/**
 * Official fetchCharts (utils/DashboardDetailsUtils.tsx:100): one
 * getChartById per dashboard chart reference, Promise.allSettled, only
 * the fulfilled results survive (a deleted/unreadable chart never blanks
 * the whole table). References without an id are skipped.
 */
export async function fetchCharts(
  refs: ReadonlyArray<{ id?: string }>,
  showDeleted = false,
): Promise<ChartRow[]> {
  const withId = refs.filter((ref): ref is { id: string } => Boolean(ref.id));
  if (withId.length === 0) {
    return [];
  }
  const results = await Promise.allSettled(
    withId.map((ref) => getChartById(ref.id, showDeleted ? 'deleted' : 'non-deleted')),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}
