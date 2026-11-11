/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Operation } from 'fast-json-patch';
import { asBoolean, asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  AirflowConfig,
  CreateIngestionPipelineRequest,
  IngestionPipeline,
  IngestionPipelineLog,
  OrchestratorStatus,
  PipelineServiceClientResponse,
  PipelineSourceConfig,
  PipelineStatus,
  PipelineStepStatus,
} from '@/types/ingestion';
import { apiRequest } from './client';

/** C-01: the server's "no pipeline client" reason, returned with HTTP 200. */
export const PIPELINE_CLIENT_DISABLED_REASON = 'Pipeline Client Disabled';

/** C-01: a 200 whose reason is "Pipeline Client Disabled" did nothing. */
export function isPipelineClientDisabled(
  response: PipelineServiceClientResponse,
): boolean {
  return response.reason === PIPELINE_CLIENT_DISABLED_REASON;
}

export const INGESTION_PIPELINE_FIELDS = 'owners,pipelineStatuses';

export interface ListIngestionPipelinesQuery {
  limit?: number;
  after?: string;
  service?: string;
  pipelineType?: string;
  serviceType?: string;
  /**
   * Server-side sort (official getIngestionPipelines sortField). Only
   * 'displayName' is forwarded; any other value is dropped, never sent.
   */
  sortField?: 'displayName';
  /** Server-side sort direction; illegal values are dropped, never sent. */
  sortOrder?: 'asc' | 'desc';
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
  // Only keys the server actually sent are kept: a key set to
  // `undefined` still counts as present for `additionalProperties`
  // validation and for JSON Patch `compare`, so the mapper must not
  // manufacture undefined-valued keys (the schema-driven edit form
  // feeds this config straight into AJV).
  const mapped: Record<string, unknown> = {};
  const type = asString(config.type);
  if (type) {
    mapped.type = type;
  }
  const includeViews = asBoolean(config.includeViews);
  if (includeViews !== undefined) {
    mapped.includeViews = includeViews;
  }
  const includeTables = asBoolean(config.includeTables);
  if (includeTables !== undefined) {
    mapped.includeTables = includeTables;
  }
  if (schema) {
    mapped.schemaFilterPattern = {
      includes: stringList(schema.includes),
      excludes: stringList(schema.excludes),
    };
  }
  if (topic) {
    mapped.topicFilterPattern = {
      includes: stringList(topic.includes),
      excludes: stringList(topic.excludes),
    };
  }
  // TestSuite pipelines carry the table under test and the selected
  // test case names here; the edit form reads them back verbatim.
  const entityFullyQualifiedName = asString(config.entityFullyQualifiedName);
  if (entityFullyQualifiedName) {
    mapped.entityFullyQualifiedName = entityFullyQualifiedName;
  }
  const testCases = stringList(config.testCases);
  if (testCases !== undefined) {
    mapped.testCases = testCases;
  }
  return { config: mapped as PipelineSourceConfig['config'] };
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
    retries: asNumber(rec.retries),
    startDate: asString(rec.startDate) || undefined,
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
    raiseOnError: asBoolean(raw.raiseOnError),
    deleted: asBoolean(raw.deleted),
    owners: Array.isArray(raw.owners) ? mapEntityRefs(raw.owners) : undefined,
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
        if (!failure) {
          return [];
        }
        const name = asString(failure.name) || undefined;
        const error = asString(failure.error) || undefined;
        const stackTrace = asString(failure.stackTrace) || undefined;
        return name || error || stackTrace ? [{ name, error, stackTrace }] : [];
      })
    : undefined;
  return {
    name: asString(rec.name) || undefined,
    records: asNumber(rec.records),
    filtered: asNumber(rec.filtered),
    updated_records: asNumber(rec.updated_records),
    warnings: asNumber(rec.warnings),
    errors: asNumber(rec.errors),
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
      // Official toSortOrder guard: only the two legal values are
      // forwarded; anything else is dropped, never sent.
      sortField: query.sortField === 'displayName' ? 'displayName' : undefined,
      sortOrder: query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined,
    },
  }).then((payload) => parsePaged(payload, mapIngestionPipeline));
}

export async function getIngestionPipeline(id: string): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/ingestionPipelines/${encodeURIComponent(id)}`,
    // Official edit loading (EditIngestionPage.component.tsx:142):
    // fields=pipelineStatuses,owners — owners must be fetched so the form
    // pre-fills the saved owners and the patch diff replaces them instead
    // of adding against a missing baseline.
    { query: { fields: 'owners,pipelineStatuses' } },
  );
  const mapped = mapIngestionPipeline(raw);
  if (!mapped) {
    throw new Error('Ingestion pipeline response was missing id and name');
  }
  return mapped;
}

/**
 * Official getIngestionPipelineByFqn (rest/ingestionPipelineAPI.ts:46-55):
 * GET /v1/services/ingestionPipelines/name/{fqn}. The TestSuite edit flow
 * loads the pipeline directly by FQN instead of listing by service and
 * searching for it.
 */
export async function getIngestionPipelineByFqn(fqn: string): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/ingestionPipelines/name/${encodeURIComponent(fqn)}`,
    { query: { fields: 'owners,pipelineStatuses' } },
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

/**
 * Official updateIngestionPipeline (rest/ingestionPipelineAPI.ts:130-140):
 * PATCH /v1/services/ingestionPipelines/{id} with a JSON Patch (ops
 * array from fast-json-patch `compare(original, updated)`). Only the
 * changed paths are sent, so untouched keys — retries, startDate,
 * pipelineTimezone, description, unmodelled sourceConfig keys — are kept
 * server-side. The old whole-entity PUT (createOrUpdate by FQN) silently
 * replaced them and would recreate a deleted pipeline instead of 404ing.
 */
export async function updateIngestionPipeline(
  id: string,
  ops: Operation[],
): Promise<IngestionPipeline> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/ingestionPipelines/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: ops,
    },
  );
  const mapped = mapIngestionPipeline(raw);
  if (!mapped) {
    throw new Error('Update ingestion pipeline succeeded but the response had no pipeline');
  }
  return mapped;
}

/**
 * Official deleteIngestionPipelineById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts:124-128): DELETE …/{id}?hardDelete=true.
 * The default (soft) delete leaves the DAG file, config and schedule in
 * Airflow, so the "deleted" pipeline keeps running; hard delete removes
 * the runner objects too.
 */
export function deleteIngestionPipeline(id: string): Promise<void> {
  return apiRequest<void>(`/v1/services/ingestionPipelines/${encodeURIComponent(id)}?hardDelete=true`, {
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
 * Official postKillIngestionPipelineById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts:174-178): POST
 * /v1/services/ingestionPipelines/kill/{id}. Returns the client
 * response verbatim — a 200 with reason "Pipeline Client Disabled"
 * killed nothing (C-01), and no runnable run answers 404, which
 * surfaces as an ApiError the caller reports as a failure.
 */
export async function killIngestionPipeline(id: string): Promise<PipelineServiceClientResponse> {
  const raw = await apiRequest<unknown>(
    `/v1/services/ingestionPipelines/kill/${encodeURIComponent(id)}`,
    { method: 'POST' },
  );
  return mapPipelineServiceClientResponse(raw);
}

/**
 * Official getIngestionPipelineLogById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts:160-172): GET
 * /v1/services/ingestionPipelines/logs/{idOrFqn}/last?after=<cursor>.
 * `idOrFqn` may be the pipeline id or its fullyQualifiedName. The call
 * is made as text because a null pipeline client answers HTTP 200 with
 * the plain string "Pipeline Client Disabled" instead of JSON — that
 * surfaces as an Error carrying the reason, never as an empty log.
 * A missing run answers 404 and an empty log 400 (ApiError); both are
 * error states for the viewer, not empty pages.
 */
export async function getIngestionPipelineLogs(
  idOrFqn: string,
  after?: string,
): Promise<IngestionPipelineLog> {
  const text = await apiRequest<string>(
    `/v1/services/ingestionPipelines/logs/${encodeURIComponent(idOrFqn)}/last`,
    { query: { after }, response: 'text' },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(text || PIPELINE_CLIENT_DISABLED_REASON);
  }
  const rec = asRecord(parsed);
  if (!rec) {
    throw new Error('Ingestion pipeline log response was empty');
  }
  const taskField = (key: string): string | undefined => asString(rec[key]) || undefined;
  return {
    logs: taskField('logs'),
    after: taskField('after'),
    // The server returns total as a JSON number; mapping it through
    // asString would drop it, and the tail check (after >= total) in
    // useIngestionLogs could never clear hasMore.
    total: asNumber(rec.total),
    ingestion_task: taskField('ingestion_task'),
    profiler_task: taskField('profiler_task'),
    usage_task: taskField('usage_task'),
    lineage_task: taskField('lineage_task'),
    dbt_task: taskField('dbt_task'),
    test_suite_task: taskField('test_suite_task'),
    application_task: taskField('application_task'),
    data_insight_task: taskField('data_insight_task'),
    elasticsearch_reindex_task: taskField('elasticsearch_reindex_task'),
    auto_classification_task: taskField('auto_classification_task'),
  };
}

/**
 * Official downloadIngestionPipelineLogsById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts:198-205): GET
 * …/logs/{idOrFqn}/last/download with responseType 'blob'.
 */
export async function downloadIngestionPipelineLogs(idOrFqn: string): Promise<Blob> {
  return apiRequest<Blob>(
    `/v1/services/ingestionPipelines/logs/${encodeURIComponent(idOrFqn)}/last/download`,
    { response: 'blob' },
  );
}

/**
 * Official enableDisableIngestionPipelineById (openmetadata-ui
 * rest/ingestionPipelineAPI.ts): POST
 * /v1/services/ingestionPipelines/toggleIngestion/{id}. The server
 * branches on the entity's `enabled` field (AirflowRESTClient
 * toggleIngestion, fork = pin shape) and returns the updated pipeline;
 * a 404 from the plugin marks the pipeline undeployed server-side.
 * ADR:2026-11-11-ingestion-pipeline-born-unpaused
 */
export async function toggleIngestionPipeline(id: string): Promise<IngestionPipeline> {
  // Read as text: with the pipeline client disabled the server answers
  // HTTP 200 with the plain string "Pipeline Client Disabled" (C-01),
  // which is not JSON — surfacing it as an Error keeps the toggle from
  // reporting a success it never performed.
  const text = await apiRequest<string>(
    `/v1/services/ingestionPipelines/toggleIngestion/${encodeURIComponent(id)}`,
    { method: 'POST', response: 'text' },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(text || PIPELINE_CLIENT_DISABLED_REASON);
  }
  const rec = asRecord(parsed);
  if (!rec) {
    throw new Error(text || PIPELINE_CLIENT_DISABLED_REASON);
  }
  const mapped = mapIngestionPipeline(rec);
  if (!mapped) {
    throw new Error('Toggle ingestion pipeline succeeded but the response had no pipeline');
  }
  return mapped;
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
