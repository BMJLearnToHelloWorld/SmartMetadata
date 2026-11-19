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
import type { AdminApp, AppSchedule, IncludeFilter, Paged } from '@/types/admin';
import type { EntityRef } from '@/types/api';

export type { AdminApp, AppSchedule } from '@/types/admin';
import { apiRequest } from './client';
import {
  asNumber,
  asRecord,
  asString,
  mapEntityRef,
  mapEntityRefs,
  parsePaged,
} from './json';

/**
 * Official generated/entity/applications/app.ts (pin a3012259ca): AppType
 * values are lowercase ('external' / 'internal'). Comparisons must use
 * these constants, never the capitalized enum member names.
 */
export const AppType = {
  External: 'external',
  Internal: 'internal',
} as const;
export type AppTypeValue = (typeof AppType)[keyof typeof AppType];

export const ScheduleType = {
  Live: 'Live',
  NoSchedule: 'NoSchedule',
  OnlyManual: 'OnlyManual',
  Scheduled: 'Scheduled',
  ScheduledOrManual: 'ScheduledOrManual',
} as const;
export type ScheduleTypeValue = (typeof ScheduleType)[keyof typeof ScheduleType];

export const ScheduleTimeline = {
  Custom: 'Custom',
  Daily: 'Daily',
  Hourly: 'Hourly',
  Monthly: 'Monthly',
  None: 'None',
  Weekly: 'Weekly',
} as const;
export type ScheduleTimelineValue =
  (typeof ScheduleTimeline)[keyof typeof ScheduleTimeline];

/** Official constants: exact app names the predicates match on. */
export const CACHE_WARMUP_APPLICATION_NAME = 'CacheWarmupApplication';
export const MCP_APPLICATION_NAME = 'McpApplication';
export const SEARCH_INDEXING_APPLICATION_NAME = 'SearchIndexingApplication';
export const RDF_INDEX_APP_NAME = 'RdfIndexApp';
export const DATA_INSIGHTS_REPORT_APPLICATION_NAME = 'DataInsightsReportApplication';

export function isExternalApp(app: Pick<AdminApp, 'appType'>): boolean {
  return app.appType === AppType.External;
}

function mapAppSchedule(value: unknown): AppSchedule | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  return {
    ...(asString(rec.cronExpression)
      ? { cronExpression: asString(rec.cronExpression) }
      : {}),
    ...(asString(rec.scheduleTimeline)
      ? { scheduleTimeline: asString(rec.scheduleTimeline) }
      : {}),
  };
}

export function mapApp(value: unknown): AdminApp | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const id = asString(rec.id);
  const name = asString(rec.name);
  if (!id || !name) {
    return null;
  }
  const config = asRecord(rec.appConfiguration);
  const schedule = mapAppSchedule(rec.appSchedule);
  return {
    id,
    name,
    ...(asString(rec.fullyQualifiedName)
      ? { fullyQualifiedName: asString(rec.fullyQualifiedName) }
      : {}),
    ...(asString(rec.displayName) ? { displayName: asString(rec.displayName) } : {}),
    ...(asString(rec.description) ? { description: asString(rec.description) } : {}),
    ...(asString(rec.href) ? { href: asString(rec.href) } : {}),
    ...(asNumber(rec.version) !== undefined ? { version: asNumber(rec.version) } : {}),
    ...(typeof rec.enabled === 'boolean' ? { enabled: rec.enabled } : {}),
    ...(typeof rec.deleted === 'boolean' ? { deleted: rec.deleted } : {}),
    ...(asString(rec.developer) ? { developer: asString(rec.developer) } : {}),
    ...(asString(rec.developerUrl) ? { developerUrl: asString(rec.developerUrl) } : {}),
    ...(asString(rec.appType) ? { appType: asString(rec.appType) } : {}),
    ...(asString(rec.scheduleType) ? { scheduleType: asString(rec.scheduleType) } : {}),
    ...(schedule ? { appSchedule: schedule } : {}),
    ...(config ? { appConfiguration: config } : {}),
    ...(typeof rec.supportsInterrupt === 'boolean'
      ? { supportsInterrupt: rec.supportsInterrupt }
      : {}),
    ...(typeof rec.supportsIngestionRunner === 'boolean'
      ? { supportsIngestionRunner: rec.supportsIngestionRunner }
      : {}),
    ...(typeof rec.system === 'boolean' ? { system: rec.system } : {}),
    ...(typeof rec.allowConfiguration === 'boolean'
      ? { allowConfiguration: rec.allowConfiguration }
      : {}),
    ...(asNumber(rec.updatedAt) !== undefined ? { updatedAt: asNumber(rec.updatedAt) } : {}),
    ...(asString(rec.updatedBy) ? { updatedBy: asString(rec.updatedBy) } : {}),
    ...(rec.pipelines ? { pipelines: mapEntityRefs(rec.pipelines) } : {}),
    ...(rec.owners ? { owners: mapEntityRefs(rec.owners) } : {}),
    ...(mapEntityRef(rec.ingestionRunner)
      ? { ingestionRunner: mapEntityRef(rec.ingestionRunner) }
      : {}),
    ...(Array.isArray(rec.appScreenshots)
      ? {
          appScreenshots: rec.appScreenshots.filter(
            (s): s is string => typeof s === 'string',
          ),
        }
      : {}),
    ...(mapEntityRef(rec.bot) ? { bot: mapEntityRef(rec.bot) } : {}),
    ...(rec.domains ? { domains: mapEntityRefs(rec.domains) } : {}),
  };
}

export interface AppListParams {
  fields?: string | string[];
  limit?: number;
  after?: string;
  before?: string;
  include?: IncludeFilter;
  agentType?: string;
  offset?: number;
  startTs?: number;
  endTs?: number;
}

function appListQuery(params: AppListParams): Record<string, string | number | boolean | undefined> {
  const fields = Array.isArray(params.fields) ? params.fields.join(',') : params.fields;
  return {
    ...(fields ? { fields } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.after ? { after: params.after } : {}),
    ...(params.before ? { before: params.before } : {}),
    ...(params.include ? { include: params.include } : {}),
    ...(params.agentType ? { agentType: params.agentType } : {}),
    ...(params.offset !== undefined ? { offset: params.offset } : {}),
    ...(params.startTs !== undefined ? { startTs: params.startTs } : {}),
    ...(params.endTs !== undefined ? { endTs: params.endTs } : {}),
  };
}

/**
 * Official rest/applicationAPI.ts getApplicationList: GET /v1/apps with the
 * caller-supplied params. No page-size default is applied here; callers pass
 * the limit they need (list page: the PAT-PAGING page size).
 */
export async function getApplicationList(
  params: AppListParams = {},
): Promise<Paged<AdminApp>> {
  const raw = await apiRequest<unknown>('/v1/apps', { query: appListQuery(params) });
  return parsePaged(raw, mapApp);
}

/** Back-compat alias used by the pre-existing list shell. */
export async function listApps(params: AppListParams = {}): Promise<Paged<AdminApp>> {
  return getApplicationList(params);
}

/**
 * Official rest/applicationAPI.ts getInstalledApplicationList: GET
 * /v1/apps/installed, returning EntityReference[] with no params. Its only
 * pin caller is ApplicationsProvider (plugin instantiation); the OSS plugin
 * registry is empty, so this batch builds the function only, no provider.
 */
export async function getInstalledApplicationList(): Promise<EntityRef[]> {
  const raw = await apiRequest<unknown>('/v1/apps/installed');
  return Array.isArray(raw) ? mapEntityRefs(raw) : [];
}

/**
 * Official rest/applicationAPI.ts getApplicationByName: GET
 * /v1/apps/name/{encodedFqn}. The detail page passes fields=owners,pipelines
 * & include=all; the marketplace detail probe passes fields=owners &
 * include=all. The field list is the caller's choice (PAT-FQN FQN-3).
 */
export async function getApplicationByName(
  fqn: string,
  params: AppListParams = {},
): Promise<AdminApp> {
  const raw = await apiRequest<unknown>(`/v1/apps/name/${encodeURIComponent(fqn)}`, {
    query: appListQuery(params),
  });
  const app = mapApp(raw);
  if (!app) {
    throw new Error('Application response was empty');
  }
  return app;
}

/** Back-compat alias: fetch by id (used by the pre-existing detail shell). */
export async function getApp(id: string): Promise<AdminApp> {
  const raw = await apiRequest<unknown>(`/v1/apps/${encodeURIComponent(id)}`);
  const app = mapApp(raw);
  if (!app) {
    throw new Error('Application response was empty');
  }
  return app;
}

/**
 * Back-compat alias kept for pre-existing callers. The marketplace probe
 * semantics (fields=owners, include=all) live at the call site now; this
 * alias fetches with no params, matching pin's parameter-less call shape.
 */
export async function getAppByName(fqn: string): Promise<AdminApp> {
  return getApplicationByName(fqn);
}

/** Official generated/entity/applications/createAppRequest.ts. */
export interface CreateAppRequest {
  name: string;
  displayName?: string;
  description?: string;
  appConfiguration?: Record<string, unknown>;
  appSchedule?: AppSchedule;
  ingestionRunner?: EntityRef;
}

/**
 * Official rest/applicationAPI.ts patchApplication: PATCH /v1/apps/{id}
 * with RFC 6902 operations. The path segment is the id (FQN-5).
 */
export async function patchApplication(id: string, operations: Operation[]): Promise<AdminApp> {
  const raw = await apiRequest<unknown>(`/v1/apps/${id}`, {
    method: 'PATCH',
    json: operations,
    contentType: 'application/json-patch+json',
  });
  const app = mapApp(raw);
  if (!app) {
    throw new Error('Application response was empty');
  }
  return app;
}

/** Official rest/applicationAPI.ts restoreApp: PUT /v1/apps/restore with {id}. */
export async function restoreApp(id: string): Promise<AdminApp> {
  const raw = await apiRequest<unknown>('/v1/apps/restore', {
    method: 'PUT',
    json: { id },
  });
  const app = mapApp(raw);
  if (!app) {
    throw new Error('Application response was empty');
  }
  return app;
}

/**
 * Official rest/applicationAPI.ts uninstallApp: DELETE
 * /v1/apps/name/{encodedFqn}?hardDelete=. Disabling an app goes through the
 * same endpoint with hardDelete=false; uninstall uses hardDelete=true.
 */
export async function uninstallApp(fqn: string, hardDelete = false): Promise<void> {
  await apiRequest<unknown>(`/v1/apps/name/${encodeURIComponent(fqn)}`, {
    method: 'DELETE',
    query: { hardDelete },
  });
}

/**
 * Official rest/applicationAPI.ts triggerOnDemandApp: POST
 * /v1/apps/trigger/{encodedFqn} with an optional trigger payload (for
 * AutoPilot, `{ entityLink }`). The server answers an empty 200.
 */
export async function triggerOnDemandApp(
  fqn: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await apiRequest<unknown>(`/v1/apps/trigger/${encodeURIComponent(fqn)}`, {
    method: 'POST',
    json: data ?? {},
  });
}

/** Official rest/applicationAPI.ts deployApp: POST /v1/apps/deploy/{encodedFqn}. */
export async function deployApp(fqn: string): Promise<void> {
  await apiRequest<unknown>(`/v1/apps/deploy/${encodeURIComponent(fqn)}`, {
    method: 'POST',
  });
}

/** Official rest/applicationAPI.ts configureApp: POST /v1/apps/configure/{encodedFqn}. */
export async function configureApp(
  fqn: string,
  configuration: Record<string, unknown>,
): Promise<void> {
  await apiRequest<unknown>(`/v1/apps/configure/${encodeURIComponent(fqn)}`, {
    method: 'POST',
    json: configuration,
  });
}

/**
 * Official rest/applicationAPI.ts stopApp: POST /v1/apps/stop/{encodedFqn}
 * with an optional runId query param, appended only when a run id is given.
 */
export async function stopApp(fqn: string, runId?: string): Promise<void> {
  await apiRequest<unknown>(`/v1/apps/stop/${encodeURIComponent(fqn)}`, {
    method: 'POST',
    query: runId ? { runId } : {},
  });
}

/** Official generated/entity/applications/appRunRecord.ts: run status values are lowercase. */
export type AppRunStatus =
  | 'active'
  | 'activeError'
  | 'completed'
  | 'failed'
  | 'pending'
  | 'running'
  | 'started'
  | 'stopInProgress'
  | 'stopped'
  | 'success';

/** Official generated StepStats (all fields optional). */
export interface AppRunStepStats {
  failedRecords?: number;
  successRecords?: number;
  totalRecords?: number;
  warningRecords?: number;
  processTimeMs?: number;
  readerTimeMs?: number;
  sinkTimeMs?: number;
  totalTimeMs?: number;
  vectorFailedRecords?: number;
  vectorSuccessRecords?: number;
  vectorTimeMs?: number;
}

/** Official generated Stats. */
export interface AppRunStats {
  entityStats?: Record<string, AppRunStepStats>;
  jobStats?: AppRunStepStats;
  processStats?: AppRunStepStats;
  readerStats?: AppRunStepStats;
  sinkStats?: AppRunStepStats;
  vectorStats?: AppRunStepStats;
}

export interface AppRunServerStats {
  processedRecords?: number;
  successRecords?: number;
  failedRecords?: number;
  totalPartitions?: number;
  completedPartitions?: number;
  processingPartitions?: number;
}

/** Official generated SuccessContext (stats + additionalProperties incl. serverStats/serverCount). */
export interface AppRunSuccessContext {
  stats?: AppRunStats;
  serverStats?: Record<string, AppRunServerStats>;
  serverCount?: number;
}

/** Official generated FailureContext (failure + additionalProperties incl. stats/stackTrace). */
export interface AppRunFailureContext {
  failure?: Record<string, unknown>;
  stats?: AppRunStats;
  stackTrace?: string;
}

export interface AppRunRecord {
  id?: string;
  appId?: string;
  appName?: string;
  config?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  timestamp?: number;
  startTime?: number;
  endTime?: number;
  executionTime?: number;
  status?: AppRunStatus;
  runType?: string;
  triggeredBy?: string;
  failureContext?: AppRunFailureContext;
  /**
   * Literal null from the wire is preserved (pin showLogAction tests
   * successContext === null for the Success branch); absent stays
   * undefined. The mapper keeps the distinction.
   */
  successContext?: AppRunSuccessContext | null;
}

/** Runs-history row: the record plus the id the table keys on (pin AppRunRecordWithId). */
export interface AppRunRecordWithId extends AppRunRecord {
  id: string;
  /** Client-side marker for the synthetic current-config row (pin AppRunsHistory). */
  isSynthetic?: boolean;
}

const STEP_STATS_KEYS = [
  'failedRecords',
  'successRecords',
  'totalRecords',
  'warningRecords',
  'processTimeMs',
  'readerTimeMs',
  'sinkTimeMs',
  'totalTimeMs',
  'vectorFailedRecords',
  'vectorSuccessRecords',
  'vectorTimeMs',
] as const;

function mapStepStats(value: unknown): AppRunStepStats | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const block: AppRunStepStats = {};
  for (const key of STEP_STATS_KEYS) {
    const n = asNumber(rec[key]);
    if (n !== undefined) {
      block[key] = n;
    }
  }
  return Object.keys(block).length > 0 ? block : undefined;
}

function mapRunStats(value: unknown): AppRunStats | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const stats: AppRunStats = {};
  for (const key of ['jobStats', 'processStats', 'readerStats', 'sinkStats', 'vectorStats'] as const) {
    const block = mapStepStats(rec[key]);
    if (block) {
      stats[key] = block;
    }
  }
  const entityStats = asRecord(rec.entityStats);
  if (entityStats) {
    const mapped: Record<string, AppRunStepStats> = {};
    for (const [key, entry] of Object.entries(entityStats)) {
      const block = mapStepStats(entry);
      if (block) {
        mapped[key] = block;
      }
    }
    if (Object.keys(mapped).length > 0) {
      stats.entityStats = mapped;
    }
  }
  return Object.keys(stats).length > 0 ? stats : undefined;
}

function mapServerStats(value: unknown): Record<string, AppRunServerStats> | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const mapped: Record<string, AppRunServerStats> = {};
  for (const [key, entry] of Object.entries(rec)) {
    const server = asRecord(entry);
    if (!server) {
      continue;
    }
    mapped[key] = {
      ...(asNumber(server.processedRecords) !== undefined
        ? { processedRecords: asNumber(server.processedRecords) }
        : {}),
      ...(asNumber(server.successRecords) !== undefined
        ? { successRecords: asNumber(server.successRecords) }
        : {}),
      ...(asNumber(server.failedRecords) !== undefined
        ? { failedRecords: asNumber(server.failedRecords) }
        : {}),
      ...(asNumber(server.totalPartitions) !== undefined
        ? { totalPartitions: asNumber(server.totalPartitions) }
        : {}),
      ...(asNumber(server.completedPartitions) !== undefined
        ? { completedPartitions: asNumber(server.completedPartitions) }
        : {}),
      ...(asNumber(server.processingPartitions) !== undefined
        ? { processingPartitions: asNumber(server.processingPartitions) }
        : {}),
    };
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapSuccessContext(value: unknown): AppRunSuccessContext | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const stats = mapRunStats(rec.stats);
  const serverStats = mapServerStats(rec.serverStats);
  const serverCount = asNumber(rec.serverCount);
  if (!stats && !serverStats && serverCount === undefined) {
    return undefined;
  }
  return {
    ...(stats ? { stats } : {}),
    ...(serverStats ? { serverStats } : {}),
    ...(serverCount !== undefined ? { serverCount } : {}),
  };
}

function mapFailureContext(value: unknown): AppRunFailureContext | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const failure = asRecord(rec.failure);
  const stats = mapRunStats(rec.stats);
  const stackTrace = asString(rec.stackTrace);
  if (!failure && !stats && !stackTrace) {
    return undefined;
  }
  return {
    ...(failure ? { failure } : {}),
    ...(stats ? { stats } : {}),
    ...(stackTrace ? { stackTrace } : {}),
  };
}

export function mapAppRunRecord(value: unknown): AppRunRecord | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const config = asRecord(rec.config);
  const properties = asRecord(rec.properties);
  const mappedFailure = mapFailureContext(rec.failureContext);
  const mappedSuccess =
    rec.successContext === null ? null : mapSuccessContext(rec.successContext);
  return {
    ...(asString(rec.id) ? { id: asString(rec.id) } : {}),
    ...(asString(rec.appId) ? { appId: asString(rec.appId) } : {}),
    ...(asString(rec.appName) ? { appName: asString(rec.appName) } : {}),
    ...(config ? { config } : {}),
    ...(properties ? { properties } : {}),
    ...(asNumber(rec.timestamp) !== undefined ? { timestamp: asNumber(rec.timestamp) } : {}),
    ...(asNumber(rec.startTime) !== undefined ? { startTime: asNumber(rec.startTime) } : {}),
    ...(asNumber(rec.endTime) !== undefined ? { endTime: asNumber(rec.endTime) } : {}),
    ...(asNumber(rec.executionTime) !== undefined
      ? { executionTime: asNumber(rec.executionTime) }
      : {}),
    ...(asString(rec.status) ? { status: asString(rec.status) as AppRunStatus } : {}),
    ...(asString(rec.runType) ? { runType: asString(rec.runType) } : {}),
    ...(asString(rec.triggeredBy) ? { triggeredBy: asString(rec.triggeredBy) } : {}),
    ...(mappedFailure ? { failureContext: mappedFailure } : {}),
    ...(mappedSuccess !== undefined ? { successContext: mappedSuccess } : {}),
  };
}

/**
 * Official rest/applicationAPI.ts getApplicationRuns: GET
 * /v1/apps/name/{encodedFqn}/status. Pin AppRunsHistory calls this for both
 * internal apps (offset paging) and external apps (30-day startTs/endTs
 * window at the call site).
 */
export async function getApplicationRuns(
  fqn: string,
  params: AppListParams = {},
): Promise<Paged<AppRunRecord>> {
  const raw = await apiRequest<unknown>(`/v1/apps/name/${encodeURIComponent(fqn)}/status`, {
    query: appListQuery(params),
  });
  return parsePaged(raw, mapAppRunRecord);
}

/**
 * Official rest/applicationAPI.ts getExternalApplicationRuns: the same
 * /v1/apps/name/{encodedFqn}/status endpoint, typed as PipelineStatus in
 * pin and used by useEntityLogs for the external-app logs path. Kept as a
 * separate function because pin keeps it; the runs-history component
 * follows the pin call site and uses getApplicationRuns for both kinds.
 */
export async function getExternalApplicationRuns(
  fqn: string,
  params: AppListParams = {},
): Promise<Paged<AppRunRecord>> {
  return getApplicationRuns(fqn, params);
}

/** Official interface/platform/application.interface.ts DataInsightLatestRun. */
export interface DataInsightLatestRun {
  data_insight_task?: string;
  application_task?: string;
  total?: string;
  pipelineStatus?: Record<string, unknown>;
}

/**
 * Official rest/applicationAPI.ts getLatestApplicationRuns: GET
 * /v1/apps/name/{encodedFqn}/logs with an optional runId param. Used by pin
 * useEntityLogs for the external-app logs path.
 */
export async function getLatestApplicationRuns(
  fqn: string,
  runId?: string,
): Promise<DataInsightLatestRun> {
  const raw = await apiRequest<unknown>(`/v1/apps/name/${encodeURIComponent(fqn)}/logs`, {
    query: runId ? { runId } : {},
  });
  const rec = asRecord(raw) ?? {};
  const pipelineStatus = asRecord(rec.pipelineStatus);
  return {
    ...(asString(rec.data_insight_task)
      ? { data_insight_task: asString(rec.data_insight_task) }
      : {}),
    ...(asString(rec.application_task)
      ? { application_task: asString(rec.application_task) }
      : {}),
    ...(asString(rec.total) ? { total: asString(rec.total) } : {}),
    ...(pipelineStatus ? { pipelineStatus } : {}),
  };
}

/**
 * Paged log-string response of GET /v1/apps/name/{name}/logs (pin
 * IngestionPipelineLogByIdInterface): `total` + `after` cursors and the log
 * text under the generic `logs` key (by-fqn fetch) or a pipeline-type
 * `*_task` field (by-id fetch). Extra fields are carried verbatim.
 */
export interface AppLogsResponse {
  total?: number | string;
  after?: string;
  logs?: string;
  [taskField: string]: unknown;
}

/**
 * Official rest/applicationAPI.ts getApplicationLogs: GET
 * /v1/apps/name/{appName}/logs with `{after, runId}` params. Pin does NOT
 * encode `appName` here (unlike the other endpoints); preserve that
 * verbatim — do not "fix" it to encode. `runId` is sent only when given.
 * Caller in pin is LogsUtils (fetchLogsRecursively).
 */
export async function getApplicationLogs(
  appName: string,
  after?: string,
  runId?: string,
): Promise<AppLogsResponse> {
  const raw = await apiRequest<unknown>(`/v1/apps/name/${appName}/logs`, {
    query: {
      ...(after !== undefined ? { after } : {}),
      ...(runId ? { runId } : {}),
    },
  });
  const rec = asRecord(raw) ?? {};
  return {
    ...rec,
    ...(asNumber(rec.total) !== undefined ? { total: asNumber(rec.total) } : {}),
    ...(asString(rec.after) ? { after: asString(rec.after) } : {}),
    ...(asString(rec.logs) ? { logs: asString(rec.logs) } : {}),
  };
}

/**
 * Official LogsUtils.getLogsFromResponse for the Application pipeline
 * type: a by-fqn fetch returns logs under the generic `logs` key;
 * otherwise the `application_task` field carries them.
 */
export function getLogsFromAppResponse(response: AppLogsResponse): string {
  if (response.logs) {
    return response.logs;
  }
  const task = response.application_task;
  return typeof task === 'string' ? task : '';
}

/**
 * Official LogsUtils.fetchLogsRecursively for applications: follows
 * the `after` cursor while the response carries one and a total, and
 * concatenates each page's log text. The download-progress store
 * update pin performs per page has no product equivalent and is
 * omitted; the recursion and concatenation match pin.
 */
export async function fetchAppLogsRecursively(
  appName: string,
  runId?: string,
  after?: string,
): Promise<string> {
  const response = await getApplicationLogs(appName, after, runId);
  let logs = getLogsFromAppResponse(response);
  if (response.after && response.total) {
    logs += await fetchAppLogsRecursively(appName, runId, response.after);
  }
  return logs;
}

/** Official rest/applicationAPI.ts SearchIndexRetryRecord. */
export interface SearchIndexRetryRecord {
  entityId: string;
  entityFqn: string;
  failureReason: string;
  status: string;
  entityType: string;
  retryCount: number;
  claimedAt: string | null;
}

function mapRetryRecord(value: unknown): SearchIndexRetryRecord | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  return {
    entityId: asString(rec.entityId),
    entityFqn: asString(rec.entityFqn),
    failureReason: asString(rec.failureReason),
    status: asString(rec.status),
    entityType: asString(rec.entityType),
    retryCount: asNumber(rec.retryCount) ?? 0,
    claimedAt: typeof rec.claimedAt === 'string' ? rec.claimedAt : null,
  };
}

/**
 * Official rest/applicationAPI.ts getLiveIndexingQueue: GET
 * /v1/apps/name/{encodedFqn}/live-indexing-queue with `{limit, offset}`.
 */
export async function getLiveIndexingQueue(
  fqn: string,
  params: { limit?: number; offset?: number } = {},
): Promise<Paged<SearchIndexRetryRecord>> {
  const raw = await apiRequest<unknown>(
    `/v1/apps/name/${encodeURIComponent(fqn)}/live-indexing-queue`,
    {
      query: {
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.offset !== undefined ? { offset: params.offset } : {}),
      },
    },
  );
  return parsePaged(raw, mapRetryRecord);
}

