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
import type {
  AirflowConfig,
  CreateIngestionPipelineRequest,
  IngestionPipeline,
  OrchestratorStatus,
  PipelineServiceClientResponse,
  PipelineSourceConfig,
  PipelineStatus,
  PipelineStepStatus,
} from '@/types/ingestion';
import { apiRequest } from './client';

export const INGESTION_PIPELINE_FIELDS = 'owners';

export interface ListIngestionPipelinesQuery {
  limit?: number;
  after?: string;
  service?: string;
  pipelineType?: string;
  serviceType?: string;
  /**
   * Field-set override (official arrQueryFields, joined into the
   * `fields` query param). The Platform Health culprit lookup asks
   * for `pipelineStatuses`; every other caller keeps the default.
   */
  fields?: string;
  /** Service FQN filter — official `serviceFilter`, sent as `service`. */
  serviceFilter?: string;
}

function mapSourceConfig(value: unknown): PipelineSourceConfig | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const config = asRecord(rec.config);
  if (!config) {
    return { config: undefined };
  }
  const schema = asRecord(config.schemaFilterPattern);
  const topic = asRecord(config.topicFilterPattern);
  const stringList = (raw: unknown): string[] | undefined =>
    Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : undefined;
  return {
    config: {
      type: asString(config.type) || undefined,
      includeViews: asBoolean(config.includeViews),
      includeTables: asBoolean(config.includeTables),
      schemaFilterPattern: schema
        ? { includes: stringList(schema.includes), excludes: stringList(schema.excludes) }
        : undefined,
      topicFilterPattern: topic
        ? { includes: stringList(topic.includes), excludes: stringList(topic.excludes) }
        : undefined,
    },
  };
}

function mapAirflowConfig(value: unknown): AirflowConfig | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    pausePipeline: asBoolean(rec.pausePipeline),
    scheduleInterval: asString(rec.scheduleInterval) || undefined,
    pipelineTimezone: asString(rec.pipelineTimezone) || undefined,
  };
}

export function mapIngestionPipeline(raw: Record<string, unknown>): IngestionPipeline | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  const service = mapEntityRefs(raw.service ? [raw.service] : [])[0];
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || name,
    pipelineType: asString(raw.pipelineType) || undefined,
    service,
    sourceConfig: mapSourceConfig(raw.sourceConfig),
    airflowConfig: mapAirflowConfig(raw.airflowConfig),
    deployed: asBoolean(raw.deployed),
    enabled: asBoolean(raw.enabled),
    loggerLevel: asString(raw.loggerLevel) || undefined,
    pipelineStatuses: Array.isArray(raw.pipelineStatuses)
      ? raw.pipelineStatuses.flatMap((item) => {
          const rec = asRecord(item);
          const mapped = rec ? mapPipelineStatus(rec) : null;
          return mapped ? [mapped] : [];
        })
      : undefined,
  };
}

function mapPipelineStepStatus(value: unknown): PipelineStepStatus | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const failures = Array.isArray(rec.failures)
    ? rec.failures.flatMap((item) => {
        const failure = asRecord(item);
        const error = failure ? asString(failure.error) : '';
        return error ? [{ error }] : [];
      })
    : undefined;
  return {
    name: asString(rec.name) || undefined,
    failures: failures?.length ? failures : undefined,
  };
}

export function mapPipelineStatus(raw: Record<string, unknown>): PipelineStatus | null {
  const runId = asString(raw.runId);
  const pipelineState = asString(raw.pipelineState);
  if (!runId && !pipelineState && raw.timestamp === undefined) {
    return null;
  }
  return {
    runId: runId || undefined,
    pipelineState: pipelineState || undefined,
    startDate: asNumber(raw.startDate),
    timestamp: asNumber(raw.timestamp),
    endDate: asNumber(raw.endDate),
    triggeredBy: asString(raw.triggeredBy) || undefined,
    status: Array.isArray(raw.status)
      ? raw.status.flatMap((item) => {
          const mapped = mapPipelineStepStatus(item);
          return mapped ? [mapped] : [];
        })
      : undefined,
  };
}

export function listIngestionPipelines(
  query: ListIngestionPipelinesQuery = {},
): Promise<Paged<IngestionPipeline>> {
  return apiRequest<unknown>('/v1/services/ingestionPipelines', {
    query: {
      fields: query.fields ?? INGESTION_PIPELINE_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      service: query.serviceFilter ?? query.service,
      pipelineType: query.pipelineType,
      serviceType: query.serviceType,
    },
  }).then((payload) => parsePaged(payload, mapIngestionPipeline));
}

export async function getIngestionPipeline(id: string): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/ingestionPipelines/${encodeURIComponent(id)}`,
    { query: { fields: INGESTION_PIPELINE_FIELDS } },
  );
  const mapped = mapIngestionPipeline(raw);
  if (!mapped) {
    throw new Error('Ingestion pipeline response was missing id and name');
  }
  return mapped;
}

export async function createIngestionPipeline(
  body: CreateIngestionPipelineRequest,
): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/ingestionPipelines', {
    method: 'POST',
    json: body,
  });
  const mapped = mapIngestionPipeline(raw);
  if (!mapped) {
    throw new Error('Create ingestion pipeline succeeded but the response had no pipeline');
  }
  return mapped;
}

export async function updateIngestionPipeline(
  body: CreateIngestionPipelineRequest,
): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/ingestionPipelines', {
    method: 'PUT',
    json: body,
  });
  const mapped = mapIngestionPipeline(raw);
  if (!mapped) {
    throw new Error('Update ingestion pipeline succeeded but the response had no pipeline');
  }
  return mapped;
}

export function deleteIngestionPipeline(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/ingestionPipelines/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

function mapPipelineServiceClientResponse(raw: unknown): PipelineServiceClientResponse {
  const rec = asRecord(raw);
  if (!rec) {
    return {};
  }
  return {
    code: asNumber(rec.code),
    reason: asString(rec.reason) || undefined,
    platform: asString(rec.platform) || undefined,
    version: asString(rec.version) || undefined,
    runId: asString(rec.runId) || undefined,
  };
}

/**
 * Official deployIngestionPipelineById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts): POST
 * /v1/services/ingestionPipelines/deploy/{id}, authorized server-side
 * with the DEPLOY operation. Returns the client response verbatim — a
 * 200 with reason "Pipeline Client Disabled" is not a deploy.
 */
export async function deployIngestionPipeline(id: string): Promise<PipelineServiceClientResponse> {
  const raw = await apiRequest<unknown>(
    `/v1/services/ingestionPipelines/deploy/${encodeURIComponent(id)}`,
    { method: 'POST' },
  );
  return mapPipelineServiceClientResponse(raw);
}

/**
 * Official triggerIngestionPipelineById: POST
 * /v1/services/ingestionPipelines/trigger/{id}, authorized server-side
 * via IngestionPipelineTriggers.authorizeTrigger. With the product's
 * in-memory airflow-apis backend the response records a queued run;
 * nothing executes until a real Airflow backend lands.
 */
export async function triggerIngestionPipeline(id: string): Promise<PipelineServiceClientResponse> {
  const raw = await apiRequest<unknown>(
    `/v1/services/ingestionPipelines/trigger/${encodeURIComponent(id)}`,
    { method: 'POST' },
  );
  return mapPipelineServiceClientResponse(raw);
}

/**
 * Bulk deploy (IngestionPipelineResource /bulk/deploy): POST a list of
 * pipeline ids; the server authorizes DEPLOY per id and returns one
 * PipelineServiceClientResponse per id, in request order. Empty lists
 * and duplicates are rejected server-side, so the caller filters first.
 */
export async function bulkDeployIngestionPipelines(
  ids: string[],
): Promise<PipelineServiceClientResponse[]> {
  const raw = await apiRequest<unknown>('/v1/services/ingestionPipelines/bulk/deploy', {
    method: 'POST',
    json: ids,
  });
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(mapPipelineServiceClientResponse);
}

export function listPipelineStatuses(
  fqn: string,
  query: { limit?: number } = {},
): Promise<Paged<PipelineStatus>> {
  return apiRequest<unknown>(
    `/v1/services/ingestionPipelines/${encodeURIComponent(fqn)}/pipelineStatus`,
    { query: { limit: query.limit ?? 5 } },
  ).then((payload) => parsePaged(payload, mapPipelineStatus));
}

export async function getOrchestratorStatus(): Promise<OrchestratorStatus> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/services/ingestionPipelines/status');
  return {
    code: asNumber(raw.code),
    platform: asString(raw.platform) || undefined,
    reason: asString(raw.reason) || undefined,
  };
}
