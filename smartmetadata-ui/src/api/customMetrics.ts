/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';

/**
 * Official rest/customMetricAPI.ts CustomMetric write body used by
 * CustomMetricForm / CustomMetricFormDrawer.
 */
export interface CustomMetricWrite {
  name: string;
  expression: string;
  columnName?: string;
}

/**
 * Official putCustomMetric: PUT /v1/tables/{tableId}/customMetric.
 * Table-level metrics send name + expression; column metrics also send columnName.
 */
export async function putCustomMetric(tableId: string, metric: CustomMetricWrite): Promise<void> {
  const body: CustomMetricWrite = {
    name: metric.name,
    expression: metric.expression,
    ...(metric.columnName ? { columnName: metric.columnName } : {}),
  };
  await apiRequest(`/v1/tables/${encodeURIComponent(tableId)}/customMetric`, {
    method: 'PUT',
    json: body,
  });
}

/**
 * Official CustomMetricForm reads table.customMetrics for the uniqueness
 * check. Quality-tab 添加 does not already have that collection on the
 * asset, so load it from GET /v1/tables/{id}?fields=customMetrics.
 */
export async function listTableCustomMetricNames(tableId: string): Promise<string[]> {
  const payload = await apiRequest<unknown>(`/v1/tables/${encodeURIComponent(tableId)}`, {
    query: { fields: 'customMetrics' },
  });
  const metrics = (payload as { customMetrics?: Array<{ name?: string }> } | null)?.customMetrics ?? [];
  return metrics.map((metric) => metric.name).filter((name): name is string => Boolean(name));
}

export interface CustomMetricRecord {
  name: string;
  expression?: string;
  columnName?: string;
}

/**
 * Official CustomMetricGraphs and CustomMetricForm read table.customMetrics
 * (name, expression, columnName) from GET /v1/tables/{id}?fields=customMetrics.
 */
export async function listTableCustomMetrics(tableId: string): Promise<CustomMetricRecord[]> {
  const payload = await apiRequest<unknown>(`/v1/tables/${encodeURIComponent(tableId)}`, {
    query: { fields: 'customMetrics' },
  });
  const metrics = (payload as { customMetrics?: CustomMetricRecord[] } | null)?.customMetrics ?? [];
  return metrics.filter((metric): metric is CustomMetricRecord => Boolean(metric?.name));
}

/**
 * Official deleteCustomMetric: DELETE
 * /v1/tables/{tableId}/customMetric/{columnName?}/{customMetricName}?recursive=true&hardDelete=true
 */
export async function deleteCustomMetric(options: {
  tableId: string;
  customMetricName: string;
  columnName?: string;
}): Promise<void> {
  const url = options.columnName
    ? `${encodeURIComponent(options.columnName)}/${encodeURIComponent(options.customMetricName)}`
    : encodeURIComponent(options.customMetricName);
  await apiRequest(`/v1/tables/${encodeURIComponent(options.tableId)}/customMetric/${url}`, {
    method: 'DELETE',
    query: { recursive: true, hardDelete: true },
  });
}
