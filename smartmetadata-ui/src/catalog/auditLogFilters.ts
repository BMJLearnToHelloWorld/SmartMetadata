/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ListAuditLogsQuery } from '@/api/auditLogs';

/**
 * Audit log filter tables. Official filter categories are time / user / bot /
 * entityType (AuditLogUtils); the time presets are the official
 * AUDIT_LOG_TIME_FILTER_RANGE (yesterday / last 7 days / last 30 days).
 * userName, entityType, eventType and q stay free text — the official API
 * takes them as open strings, so no value list is invented for them.
 */
export type AuditLogTimePreset = 'yesterday' | 'last7' | 'last30' | 'all';

export interface AuditLogTimePresetRow {
  key: AuditLogTimePreset;
  labelKey: string;
  days?: number;
}

export const AUDIT_LOG_TIME_PRESETS: AuditLogTimePresetRow[] = [
  { key: 'all', labelKey: 'admin.auditLogs.timeAll' },
  { key: 'yesterday', labelKey: 'admin.auditLogs.timeYesterday', days: 1 },
  { key: 'last7', labelKey: 'admin.auditLogs.timeLast7', days: 7 },
  { key: 'last30', labelKey: 'admin.auditLogs.timeLast30', days: 30 },
];

export type AuditLogActorType = 'USER' | 'BOT';

export interface AuditLogActorRow {
  key: AuditLogActorType;
  labelKey: string;
}

export const AUDIT_LOG_ACTORS: AuditLogActorRow[] = [
  { key: 'USER', labelKey: 'admin.auditLogs.actorUser' },
  { key: 'BOT', labelKey: 'admin.auditLogs.actorBot' },
];

export interface AuditLogFilters {
  timePreset: AuditLogTimePreset;
  userName?: string;
  actorType?: AuditLogActorType;
  entityType?: string;
  eventType?: string;
  q?: string;
}

export const EMPTY_AUDIT_LOG_FILTERS: AuditLogFilters = { timePreset: 'all' };

export function auditLogTimeRange(preset: AuditLogTimePreset, now = Date.now()): { startTs?: number; endTs?: number } {
  const row = AUDIT_LOG_TIME_PRESETS.find((item) => item.key === preset);
  if (!row || row.days === undefined) {
    return {};
  }
  return { startTs: now - row.days * 24 * 60 * 60 * 1000, endTs: now };
}

export function auditLogQuery(filters: AuditLogFilters, now = Date.now()): ListAuditLogsQuery {
  const range = auditLogTimeRange(filters.timePreset, now);
  const text = (value?: string): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  return {
    userName: text(filters.userName),
    actorType: filters.actorType,
    entityType: text(filters.entityType),
    eventType: text(filters.eventType),
    q: text(filters.q),
    startTs: range.startTs,
    endTs: range.endTs,
  };
}

export function auditLogFiltersActive(filters: AuditLogFilters): boolean {
  return (
    filters.timePreset !== 'all' ||
    Boolean(filters.userName?.trim()) ||
    Boolean(filters.actorType) ||
    Boolean(filters.entityType?.trim()) ||
    Boolean(filters.eventType?.trim()) ||
    Boolean(filters.q?.trim())
  );
}
