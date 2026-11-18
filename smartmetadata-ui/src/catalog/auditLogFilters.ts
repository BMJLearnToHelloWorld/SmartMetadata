/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dayjs from 'dayjs';
import type { ListAuditLogsQuery } from '@/api/auditLogs';

/**
 * Audit log filter model (03 §11.3): the closed four-category set from
 * the pin (`AuditLogFilterCategoryType`, types/auditLogs.interface.ts:59),
 * the active-filter array the page carries, and `buildParamsFromFilters`
 * (utils/AuditLogUtils.ts:40-74). There is no `all` preset, no
 * standalone actorType control, and no eventType input: absence of a
 * filter means absence of its parameters.
 */

export type AuditLogFilterCategoryType = 'time' | 'user' | 'bot' | 'entityType';

/** Category label keys (AuditLogUtils.ts:22-38 `getAuditLogCategoryLabel`). */
export const AUDIT_LOG_CATEGORY_LABEL_KEYS: Record<AuditLogFilterCategoryType, string> = {
  time: 'label.time',
  user: 'label.user',
  bot: 'label.bot',
  entityType: 'label.entity-type',
};

export interface AuditLogTimeFilterValue {
  /** Preset key (`yesterday`/`last7days`/`last30days`) or `'custom'`. */
  key: string;
  /** Chip/display label; for custom ranges `yyyy-MM-dd -> yyyy-MM-dd`. */
  label: string;
  startTs?: number;
  endTs?: number;
}

export interface AuditLogOptionFilterValue {
  /** user/bot name, or the entity-type value. */
  key: string;
  label: string;
}

export type AuditLogFilterValue = AuditLogTimeFilterValue | AuditLogOptionFilterValue;

export interface AuditLogActiveFilter {
  category: AuditLogFilterCategoryType;
  value: AuditLogFilterValue;
}

export interface AuditLogTimeRangeRow {
  key: string;
  titleKey: string;
  titleData?: { numberOfDays: number };
  days: number;
}

/** Pin AUDIT_LOG_TIME_FILTER_RANGE (constants/auditLog.constant.ts:16-35). */
export const AUDIT_LOG_TIME_FILTER_RANGE: AuditLogTimeRangeRow[] = [
  { key: 'yesterday', titleKey: 'label.yesterday', days: 1 },
  { key: 'last7days', titleKey: 'label.last-number-of-days', titleData: { numberOfDays: 7 }, days: 7 },
  { key: 'last30days', titleKey: 'label.last-number-of-days', titleData: { numberOfDays: 30 }, days: 30 },
];

/** Pin DEFAULT_SELECTED_RANGE (constants/profiler.constant.ts:114-121): the trigger's display default, not a filter. */
export const AUDIT_LOG_DEFAULT_TIME_RANGE: AuditLogTimeRangeRow = AUDIT_LOG_TIME_FILTER_RANGE[1]!;

/** Pin CUSTOM_DATE_RANGE_KEY (utils/DatePickerMenuUtils.tsx:15). */
export const CUSTOM_DATE_RANGE_KEY = 'customRange';

/** Key carried by a custom-range time filter value (AuditLogFilters.component.tsx:179-216). */
export const CUSTOM_TIME_FILTER_KEY = 'custom';

/**
 * Rolling preset window (U5, 03 §11.3): `startTs = now - days`,
 * `endTs = now` (DatePickerMenu.component.tsx:229-256,
 * `getEpochMillisForPastDays`). Calendar-day subtraction, matching the
 * pin Luxon `minus({days})` semantics.
 */
export function auditLogPresetRange(days: number, now = Date.now()): { startTs: number; endTs: number } {
  return { startTs: dayjs(now).subtract(days, 'day').valueOf(), endTs: now };
}

/**
 * Natural-day bounds for a custom range and for the export request:
 * start of the first day through the last millisecond of the last day
 * (`dateValueToMillis` / `dateValueToEndOfDayMillis`,
 * utils/date-time/calendarDate.utils.ts:33-56). Inputs are day-start
 * millis in local time.
 */
export function auditLogDayRangeBounds(
  startDayMs: number,
  endDayMs: number,
): { startTs: number; endTs: number } {
  return { startTs: startDayMs, endTs: dayjs(endDayMs).add(1, 'day').valueOf() - 1 };
}

/** Custom-range label `yyyy-MM-dd -> yyyy-MM-dd` (AuditLogFilters.component.tsx:179-216). */
export function auditLogCustomRangeLabel(startDayMs: number, endDayMs: number): string {
  return `${dayjs(startDayMs).format('YYYY-MM-DD')} -> ${dayjs(endDayMs).format('YYYY-MM-DD')}`;
}

/**
 * Pin `buildParamsFromFilters` (AuditLogUtils.ts:40-74): time sets
 * startTs/endTs only when both values are present; user/bot set
 * userName + actorType; entityType sets entityType. Filters apply in
 * array order, so a later user/bot filter overwrites an earlier one —
 * pin-native behaviour, reproduced as-is.
 */
export function buildParamsFromFilters(filters: AuditLogActiveFilter[]): ListAuditLogsQuery {
  const params: ListAuditLogsQuery = {};
  for (const filter of filters) {
    if (filter.category === 'time') {
      const value = filter.value as AuditLogTimeFilterValue;
      if (value.startTs !== undefined && value.endTs !== undefined) {
        params.startTs = value.startTs;
        params.endTs = value.endTs;
      }
    } else if (filter.category === 'user') {
      params.userName = (filter.value as AuditLogOptionFilterValue).key;
      params.actorType = 'USER';
    } else if (filter.category === 'bot') {
      params.userName = (filter.value as AuditLogOptionFilterValue).key;
      params.actorType = 'BOT';
    } else if (filter.category === 'entityType') {
      params.entityType = (filter.value as AuditLogOptionFilterValue).key;
    }
  }
  return params;
}

export interface AuditLogEntityTypeOption {
  value: string;
  /** Pin literal English label (AuditLogFilters.component.tsx:50-106); never self-translated (03 §11.3). */
  label: string;
}

/** Pin ENTITY_TYPE_OPTIONS, verbatim order and labels (AuditLogFilters.component.tsx:50-106). */
export const AUDIT_LOG_ENTITY_TYPE_OPTIONS: AuditLogEntityTypeOption[] = [
  { label: 'Table', value: 'table' },
  { label: 'Topic', value: 'topic' },
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Pipeline', value: 'pipeline' },
  { label: 'ML Model', value: 'mlmodel' },
  { label: 'Container', value: 'container' },
  { label: 'Search Index', value: 'searchIndex' },
  { label: 'Stored Procedure', value: 'storedProcedure' },
  { label: 'Dashboard Data Model', value: 'dashboardDataModel' },
  { label: 'Chart', value: 'chart' },
  { label: 'Database', value: 'database' },
  { label: 'Database Schema', value: 'databaseSchema' },
  { label: 'Query', value: 'query' },
  { label: 'API Collection', value: 'apiCollection' },
  { label: 'API Endpoint', value: 'apiEndpoint' },
  { label: 'Metric', value: 'metric' },
  { label: 'Glossary', value: 'glossary' },
  { label: 'Glossary Term', value: 'glossaryTerm' },
  { label: 'Classification', value: 'classification' },
  { label: 'Tag', value: 'tag' },
  { label: 'Domain', value: 'domain' },
  { label: 'Data Product', value: 'dataProduct' },
  { label: 'User', value: 'user' },
  { label: 'Team', value: 'team' },
  { label: 'Bot', value: 'bot' },
  { label: 'Persona', value: 'persona' },
  { label: 'Role', value: 'role' },
  { label: 'Policy', value: 'policy' },
  { label: 'Database Service', value: 'databaseService' },
  { label: 'Messaging Service', value: 'messagingService' },
  { label: 'Dashboard Service', value: 'dashboardService' },
  { label: 'Pipeline Service', value: 'pipelineService' },
  { label: 'ML Model Service', value: 'mlmodelService' },
  { label: 'Storage Service', value: 'storageService' },
  { label: 'Search Service', value: 'searchService' },
  { label: 'API Service', value: 'apiService' },
  { label: 'Metadata Service', value: 'metadataService' },
  { label: 'Ingestion Pipeline', value: 'ingestionPipeline' },
  { label: 'Test Suite', value: 'testSuite' },
  { label: 'Test Case', value: 'testCase' },
  { label: 'Event Subscription', value: 'eventsubscription' },
  { label: 'Application', value: 'app' },
  { label: 'KPI', value: 'kpi' },
];

/**
 * Pin `getTermQuery({isBot})` (utils/SearchPureUtils.ts:162-166) as the
 * serialized `query_filter` string the search API takes: a pure must
 * term clause, with the boolean carried as the STRING `'true'`/`'false'`
 * — not a JSON boolean. Deliberately not the bots surface's combined
 * wildcard builder, whose shape differs.
 */
export function auditLogUserSearchQueryFilter(isBot: boolean): string {
  return JSON.stringify({ query: { bool: { must: [{ term: { isBot: isBot ? 'true' : 'false' } }] } } });
}
