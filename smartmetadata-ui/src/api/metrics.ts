/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';
import { asRecord, asString, mapEntityRefs, parsePaged } from './json';
import { mapTags } from './entities';
import type { Paged } from '@/types/admin';
import type { EntityRef, TagRef } from '@/types/api';

/**
 * Official deleteMetricAsync (rest/metricsAPI.ts): metric deletion is async —
 * DELETE /metrics/async/{id} starts a job; there is no synchronous delete
 * surface. The product has no metric-job tracking surface, so callers must
 * present this as "async delete submitted", never as "deleted".
 */
export function deleteMetricAsync(id: string): Promise<unknown> {
  return apiRequest(`/v1/metrics/async/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Metric entity as returned by GET /v1/metrics (MetricResource list,
 * fields '*' in the bulk-edit loader). Only the fields the bulk-edit grid
 * reads are mapped; the rest of the entity is never needed client-side
 * for a CSV round-trip, and the CSV columns come from the metric CSV
 * documentation, not from this shape.
 */
export interface Metric {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName: string;
  metricType?: string;
  unitOfMeasurement?: string;
  customUnitOfMeasurement?: string;
  granularity?: string;
  expressionLanguage?: string;
  expressionCode?: string;
  entityStatus?: string;
  parent?: EntityRef;
  metricGroup?: EntityRef;
  owners: EntityRef[];
  reviewers: EntityRef[];
  domains: EntityRef[];
  dataProducts: EntityRef[];
  relatedMetrics: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  extension?: Record<string, unknown>;
}

export interface ListMetricsQuery {
  limit?: number;
  after?: string;
  before?: string;
  fields?: string;
  include?: string;
}

const METRIC_LIST_FIELDS =
  'owners,reviewers,domains,dataProducts,relatedMetrics,experts,tags,parent,metricGroup,extension,metricExpression';

function mapMetric(raw: Record<string, unknown>): Metric | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  const fullyQualifiedName = asString(raw.fullyQualifiedName);
  if (!id || !name || !fullyQualifiedName) {
    return null;
  }
  const expression = asRecord(raw.metricExpression);
  const parentRefs = mapEntityRefs(raw.parent ? [raw.parent] : []);
  const groupRefs = mapEntityRefs(raw.metricGroup ? [raw.metricGroup] : []);
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName,
    metricType: asString(raw.metricType) || undefined,
    unitOfMeasurement: asString(raw.unitOfMeasurement) || undefined,
    customUnitOfMeasurement: asString(raw.customUnitOfMeasurement) || undefined,
    granularity: asString(raw.granularity) || undefined,
    expressionLanguage: asString(expression?.language) || undefined,
    expressionCode: asString(expression?.code) || undefined,
    entityStatus: asString(raw.entityStatus) || undefined,
    parent: parentRefs[0],
    metricGroup: groupRefs[0],
    owners: mapEntityRefs(raw.owners),
    reviewers: mapEntityRefs(raw.reviewers),
    domains: mapEntityRefs(raw.domains),
    dataProducts: mapEntityRefs(raw.dataProducts),
    relatedMetrics: mapEntityRefs(raw.relatedMetrics),
    experts: mapEntityRefs(raw.experts),
    tags: mapTags(raw.tags),
    extension: asRecord(raw.extension) ?? undefined,
  };
}

/**
 * Official getMetrics (rest/metricsAPI.ts): GET /v1/metrics with limit /
 * after paging. The bulk-edit loader pages with limit 1000 and fields '*'
 * semantics via METRIC_LIST_FIELDS; callers that only need names pass
 * their own fields value.
 */
export async function listMetrics(query: ListMetricsQuery = {}): Promise<Paged<Metric>> {
  const payload = await apiRequest<unknown>('/v1/metrics', {
    query: {
      fields: query.fields ?? METRIC_LIST_FIELDS,
      limit: query.limit ?? 1000,
      after: query.after,
      before: query.before,
      include: query.include,
    },
  });
  return parsePaged(payload, mapMetric);
}
