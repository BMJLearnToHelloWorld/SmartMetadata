/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  CACHE_WARMUP_APPLICATION_NAME,
  MCP_APPLICATION_NAME,
  type AdminApp,
  type AppRunFailureContext,
  type AppRunRecord,
  type AppRunRecordWithId,
  type AppRunStats,
  type AppRunStatus,
  type AppRunStepStats,
  type AppRunSuccessContext,
  type AppSchedule,
} from '@/api/apps';
import { getScheduleOptionsFromSchedules } from '@/ingestion/schedule';

/** Official NO_DATA_PLACEHOLDER (constants.ts:96). */
export const NO_DATA_PLACEHOLDER = '--';

/** Official getEntityName (utils/EntityNameUtils.ts:27-32): displayName || name || ''. */
export function getEntityName(entity?: {
  name?: string;
  displayName?: string;
}): string {
  return entity?.displayName || entity?.name || '';
}

/**
 * Official getAppCronExpression (utils/ApplicationUtils.tsx): only the
 * object form of appSchedule carries a cron expression.
 */
export function getAppCronExpression(
  appSchedule?: AppSchedule | null,
): string | undefined {
  if (!appSchedule || typeof appSchedule !== 'object' || Array.isArray(appSchedule)) {
    return undefined;
  }
  return appSchedule.cronExpression;
}

export function isCacheWarmupApplication(appName?: string): boolean {
  return appName === CACHE_WARMUP_APPLICATION_NAME;
}

export function isMcpApplication(appName?: string): boolean {
  return appName === MCP_APPLICATION_NAME;
}

/** Official AppDetails: enabled===false && !deleted. */
export function isRuntimeDisabled(app?: { enabled?: boolean; deleted?: boolean }): boolean {
  return app?.enabled === false && !app.deleted;
}

/** Official AppDetails: deleted || runtime-disabled. */
export function isAppUnavailable(app?: { enabled?: boolean; deleted?: boolean }): boolean {
  return Boolean(app?.deleted) || isRuntimeDisabled(app);
}

/**
 * Official STATUS_LABEL (constants.ts:513-523). Values are hardcoded
 * English in pin, not i18n keys; AppRunsHistory renders them verbatim.
 * `stopInProgress` has no entry in pin (the lookup yields undefined);
 * keep the gap rather than inventing a label.
 */
export const STATUS_LABEL: Partial<Record<AppRunStatus, string>> = {
  active: 'Active',
  activeError: 'Active With Error',
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  running: 'Running',
  started: 'Started',
  stopped: 'Stopped',
  success: 'Success',
};

/** Official StatusType (StatusBadge.interface.ts). */
export type StatusTypeValue =
  | 'success'
  | 'warning'
  | 'failure'
  | 'activeError'
  | 'running'
  | 'started'
  | 'stopped'
  | 'pending'
  | 'aborted'
  | 'inReview'
  | 'deprecated'
  | 'version'
  | 'acknowledged'
  | 'unprocessed'
  | 'archived';

export const StatusType = {
  Success: 'success',
  Warning: 'warning',
  Failure: 'failure',
  ActiveError: 'activeError',
  Running: 'running',
  Started: 'started',
  Stopped: 'stopped',
  Pending: 'pending',
  Aborted: 'aborted',
  InReview: 'inReview',
  Deprecated: 'deprecated',
  Version: 'version',
  Acknowledged: 'acknowledged',
  Unprocessed: 'unprocessed',
  Archived: 'archived',
} as const;

/** Official STATUS_TYPE_TO_BADGE_COLOR (StatusBadge.constant.ts). */
export const STATUS_TYPE_TO_BADGE_COLOR: Record<StatusTypeValue, string> = {
  success: 'success',
  warning: 'warning',
  pending: 'warning',
  failure: 'error',
  stopped: 'error',
  activeError: 'error',
  aborted: 'orange',
  running: 'brand',
  acknowledged: 'blue',
  started: 'purple',
  inReview: 'purple',
  version: 'purple',
  deprecated: 'gray',
  archived: 'gray',
  unprocessed: 'gray',
};

/**
 * Official getStatusTypeForApplication (utils/ApplicationUtils.tsx:48-73),
 * expressed as a lookup table per the design (no if-else chain). Unknown
 * statuses fall through to Stopped, as in pin's switch default.
 */
const STATUS_TYPE_MAP: Partial<Record<AppRunStatus, StatusTypeValue>> = {
  failed: 'failure',
  success: 'success',
  active: 'success',
  completed: 'success',
  running: 'running',
  started: 'started',
  pending: 'pending',
  activeError: 'activeError',
};

export function getStatusTypeForApplication(status: AppRunStatus): StatusTypeValue {
  return STATUS_TYPE_MAP[status] ?? 'stopped';
}

/** Official STATUS_ICON (constants.ts:507-511): only three statuses carry an icon. */
export const STATUS_ICON_KEYS: ReadonlySet<string> = new Set([
  'success',
  'failed',
  'completed',
]);

/**
 * Official StatusBadge icon lookup (StatusBadge.component.tsx): the icon
 * is resolved from the LABEL, exact match first, then lowercased, against
 * the `icons` map (StatusBadge.constant.ts). The keys below are the
 * AppStatus/TestCaseStatus members reachable from this batch's call
 * sites; EntityStatus members (glossary/test flows) never reach the
 * applications badge and are not mapped here.
 */
const STATUS_BADGE_ICON_KEYS: ReadonlySet<string> = new Set([
  'active',
  'completed',
  'failed',
  'running',
  'started',
  'stopped',
  'success',
  'pending',
  'activeError',
  'aborted',
]);

export function statusBadgeIconKey(label: string): string | undefined {
  if (STATUS_BADGE_ICON_KEYS.has(label)) {
    return label;
  }
  const lowered = label.toLowerCase();
  return STATUS_BADGE_ICON_KEYS.has(lowered) ? lowered : undefined;
}

/**
 * Official StatusBadge color resolution: the `failed` status aliases to
 * Failure (test-case results arrive lower-cased), and any unmapped
 * status falls back to gray.
 */
export function resolveStatusBadgeColor(status: string): string {
  const key = (status === 'failed' ? 'failure' : status) as StatusTypeValue;
  return STATUS_TYPE_TO_BADGE_COLOR[key] ?? 'gray';
}

/**
 * Official formatLatencyAverage (utils/ApplicationUtils.tsx:101-124).
 * '—' when no timing or no records; '<1 ms' below 1ms; 'x.x ms' below a
 * second; 'x.xx s' above. totalTimeMs === 0 with records is a valid
 * sub-millisecond batch and falls through to '<1 ms'.
 */
export function formatLatencyAverage(
  totalTimeMs?: number,
  successRecords?: number,
): string {
  if (
    totalTimeMs === undefined ||
    successRecords === undefined ||
    successRecords <= 0
  ) {
    return '—';
  }
  const avgMs = totalTimeMs / successRecords;
  if (avgMs < 1) {
    return '<1 ms';
  }
  if (avgMs < 1000) {
    return `${avgMs.toFixed(1)} ms`;
  }
  return `${(avgMs / 1000).toFixed(2)} s`;
}

/**
 * Official formatThroughput (utils/ApplicationUtils.tsx:184-207). Same
 * fallback semantics as formatLatencyAverage; sub-millisecond batches
 * report as '>N r/s' using a 1ms floor.
 */
export function formatThroughput(
  totalTimeMs?: number,
  successRecords?: number,
): string {
  if (
    totalTimeMs === undefined ||
    successRecords === undefined ||
    successRecords <= 0
  ) {
    return '—';
  }
  const effectiveMs = totalTimeMs > 0 ? totalTimeMs : 1;
  const seconds = effectiveMs / 1000;
  const rps = successRecords / seconds;
  const prefix = totalTimeMs > 0 ? '' : '>';
  if (rps >= 1000) {
    return `${prefix}${(rps / 1000).toFixed(1)}k r/s`;
  }
  if (rps >= 100) {
    return `${prefix}${rps.toFixed(0)} r/s`;
  }
  return `${prefix}${rps.toFixed(1)} r/s`;
}

const VECTOR_INDEXABLE_ENTITIES = new Set([
  'table',
  'glossary',
  'glossaryterm',
  'chart',
  'container',
  'dashboard',
  'dashboarddatamodel',
  'database',
  'databaseschema',
  'dataproduct',
  'pipeline',
  'mlmodel',
  'metric',
  'apiendpoint',
  'apicollection',
  'page',
  'storedprocedure',
  'searchindex',
  'topic',
]);

export interface EntityStatsData {
  name: string;
  totalRecords: number;
  successRecords: number;
  failedRecords: number;
  vectorEmbeddings: number | null;
  readerAvgMs: string;
  processAvgMs: string;
  sinkAvgMs: string;
  vectorAvgMs: string;
}

function upperFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Official getEntityStatsData (utils/ApplicationUtils.tsx:126-182).
 * Skips the aggregate keys and rows missing any of the three counts;
 * sorts by name.
 */
export function getEntityStatsData(data: {
  [key: string]: AppRunStepStats;
}): EntityStatsData[] {
  const filteredRow = ['failedRecords', 'totalRecords', 'successRecords'];
  const result: EntityStatsData[] = [];
  for (const [key, stats] of Object.entries(data)) {
    if (filteredRow.includes(key)) {
      continue;
    }
    if (
      !stats ||
      typeof stats.totalRecords !== 'number' ||
      typeof stats.successRecords !== 'number' ||
      typeof stats.failedRecords !== 'number'
    ) {
      continue;
    }
    const isVectorIndexable = VECTOR_INDEXABLE_ENTITIES.has(key.toLowerCase());
    result.push({
      name: upperFirst(key),
      totalRecords: stats.totalRecords,
      successRecords: stats.successRecords,
      failedRecords: stats.failedRecords,
      vectorEmbeddings: isVectorIndexable ? (stats.vectorSuccessRecords ?? 0) : null,
      readerAvgMs: formatLatencyAverage(stats.readerTimeMs, stats.successRecords),
      processAvgMs: formatLatencyAverage(stats.processTimeMs, stats.successRecords),
      sinkAvgMs: formatLatencyAverage(stats.sinkTimeMs, stats.successRecords),
      vectorAvgMs: formatLatencyAverage(stats.vectorTimeMs, stats.vectorSuccessRecords),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** Official APP_RUN_STAT_KEYS (utils/ApplicationUtils.tsx:209-216). */
const APP_RUN_STAT_KEYS: (keyof AppRunStats)[] = [
  'jobStats',
  'readerStats',
  'processStats',
  'sinkStats',
  'vectorStats',
  'entityStats',
];

/**
 * Official formatJsonString (utils/StringUtils.ts:368-388): nested objects
 * recurse with two-space indent; unparseable input returns verbatim.
 */
export function formatJsonString(jsonString: string, indent = ''): string {
  try {
    let formattedJson = '';
    const jsonObj = JSON.parse(jsonString) as Record<string, unknown>;
    for (const [key, value] of Object.entries(jsonObj)) {
      if (typeof value === 'object' && value !== null) {
        formattedJson += `${indent}[${key}]:\n`;
        formattedJson += formatJsonString(JSON.stringify(value), `${indent}  `);
      } else {
        formattedJson += `${indent}[${key}]: ${String(value)}\n`;
      }
    }
    return formattedJson;
  } catch {
    return jsonString;
  }
}

/**
 * Official getAppRunFailureLogs (utils/ApplicationUtils.tsx:234-239):
 * failureContext.stackTrace ?? failureContext.failure ?? {}, JSON-formatted.
 */
export function getAppRunFailureLogs(record: AppRunRecord): string {
  return formatJsonString(
    JSON.stringify(
      record.failureContext?.stackTrace ?? record.failureContext?.failure ?? {},
    ),
  );
}

/**
 * Official hasAppRunStats (utils/ApplicationUtils.tsx:244-253): any
 * APP_RUN_STAT_KEYS block in success/failure stats, or non-empty
 * serverStats on the success context.
 */
export function hasAppRunStats(record: AppRunRecord): boolean {
  const successStats = record.successContext?.stats;
  const failureStats = record.failureContext?.stats;
  const hasStatBlocks = APP_RUN_STAT_KEYS.some(
    (key) => successStats?.[key] || failureStats?.[key],
  );
  const serverStats = record.successContext?.serverStats;
  const hasServerStats =
    serverStats !== undefined && Object.keys(serverStats).length > 0;
  return hasStatBlocks || hasServerStats;
}

/**
 * Official formatDurationToHHMMSS (DateTimeUtils.ts:539-545): sub-second
 * durations render as whole milliseconds; otherwise HH:MM:SS with total
 * hours (luxon Duration.toFormat('hh:mm:ss') semantics).
 */
export function formatDurationToHHMMSS(ms: number): string {
  if (ms > 0 && ms < 1000) {
    return `${Math.floor(ms)} ms`;
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Official formatDateTime (DateTimeUtils.ts:116-126): 'MMM dd, yyyy, hh:mm a
 * (UTC±HH:MM)' in the 12h tenant default. Implemented with Intl parts plus
 * a manual UTC offset (the product has no luxon); the locale comes from the
 * caller's i18n locale. Nil input renders ''.
 */
export function formatAppDateTime(
  timestamp?: number,
  locale = 'en-US',
): string {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offset = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${pick('month')} ${pick('day')}, ${pick('year')}, ${pick('hour')}:${pick('minute')} ${pick('dayPeriod')} (${offset})`;
}

/**
 * Official formatDateTimeWithTimezone (DateTimeUtils.ts:205-223): the full
 * localized date-time (luxon DATETIME_FULL, 12h default).
 */
export function formatDateTimeWithTimezone(
  timestamp: number,
  locale = 'en-US',
): string {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }
  return new Date(timestamp).toLocaleString(locale, {
    dateStyle: 'full',
    timeStyle: 'full',
    hour12: true,
  });
}

/** Official getEpochMillisForPastDays (DateTimeUtils.ts:349-350). */
export function getEpochMillisForPastDays(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/** Official getIntervalInMilliseconds (DateTimeUtils.ts:370-379). */
export function getIntervalInMilliseconds(startTime: number, endTime: number): number {
  return endTime - startTime;
}

/**
 * Official ApplicationsClassBase.getScheduleOptionsForApp: week-only for
 * the DataInsights report app, day-only for external apps, otherwise the
 * limits-config pipeline schedules mapped through
 * getScheduleOptionsFromSchedules, or undefined when the config is absent.
 */
export function getScheduleOptionsForApp(
  app: string,
  appType: string | undefined,
  pipelineSchedules?: string[],
): string[] | undefined {
  if (app === 'DataInsightsReportApplication') {
    return ['week'];
  }
  if (appType === 'external') {
    return ['day'];
  }
  return pipelineSchedules
    ? getScheduleOptionsFromSchedules(pipelineSchedules)
    : undefined;
}

/** Lodash `kebabCase` semantics for the card testid (`${kebabCase(appName)}-card`). */
export function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Official TERMINAL_APP_RUN_STATUSES (AppRunsHistory.component.tsx:87-94). */
export const TERMINAL_APP_RUN_STATUSES: ReadonlySet<AppRunStatus> = new Set([
  'success',
  'failed',
  'stopped',
  'completed',
  'stopInProgress',
]);

export function isTerminalAppRunStatus(status?: AppRunStatus): boolean {
  return status !== undefined && TERMINAL_APP_RUN_STATUSES.has(status);
}

/**
 * Official showLogAction (AppRunsHistory.component.tsx:193-213). The name
 * is pin's; the Logs button is DISABLED when this returns true. Note the
 * success branch tests successContext === null (literal null from the
 * wire), not undefined.
 */
export function showLogAction(
  record: AppRunRecordWithId,
  isExternal: boolean,
): boolean {
  if (record.isSynthetic) {
    return true;
  }
  if (isExternal) {
    return false;
  }
  if (record.status === 'success' && record.successContext === null) {
    return true;
  }
  return false;
}

/** Official row id synthesis (AppRunsHistory fetchAppHistory). */
export function runRowId(record: AppRunRecord): string {
  return `${record.appId}-${record.runType}-${record.timestamp}`;
}

/**
 * Official synthetic current-config row (AppRunsHistory.component.tsx:151-165):
 * internal apps with zero runs and an app present render one row carrying
 * the current configuration; every column renders the placeholder.
 */
export function buildSyntheticRunRecord(app: AdminApp): AppRunRecordWithId {
  return {
    id: `${app.id ?? app.name ?? 'app'}-current-config`,
    appId: app.id,
    appName: app.name,
    config: (app.appConfiguration ?? {}) as Record<string, unknown>,
    isSynthetic: true,
  };
}

/** Whether the Stop action appears for a run row (pin getActionButton). */
export function canStopAppRun(
  record: AppRunRecordWithId,
  supportsInterrupt?: boolean,
): boolean {
  return (
    !record.isSynthetic &&
    !isTerminalAppRunStatus(record.status) &&
    Boolean(supportsInterrupt)
  );
}

export type { AppRunFailureContext, AppRunSuccessContext };
