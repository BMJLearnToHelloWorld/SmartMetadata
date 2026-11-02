/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/** Audit log entry, mirroring the official AuditLogEntry scalar fields. */
export interface AuditLogEntry {
  id?: number;
  changeEventId?: string;
  eventTs?: number;
  eventType?: string;
  userName?: string;
  actorType?: string;
  impersonatedBy?: string;
  serviceName?: string;
  entityType?: string;
  entityId?: string;
  entityFQN?: string;
  createdAt?: number;
  summary?: string;
}

export interface ListAuditLogsQuery {
  limit?: number;
  after?: string;
  before?: string;
  q?: string;
  userName?: string;
  actorType?: string;
  serviceName?: string;
  entityType?: string;
  entityFQN?: string;
  eventType?: string;
  startTs?: number;
  endTs?: number;
}

function mapAuditLog(raw: Record<string, unknown>): AuditLogEntry | null {
  // Entries without a numeric id are dropped rather than rendered as blank
  // rows (the list shell keys rows by id).
  if (asNumber(raw.id) === undefined) {
    return null;
  }
  return {
    id: asNumber(raw.id),
    changeEventId: asString(raw.changeEventId) || undefined,
    eventTs: asNumber(raw.eventTs),
    eventType: asString(raw.eventType) || undefined,
    userName: asString(raw.userName) || undefined,
    actorType: asString(raw.actorType) || undefined,
    impersonatedBy: asString(raw.impersonatedBy) || undefined,
    serviceName: asString(raw.serviceName) || undefined,
    entityType: asString(raw.entityType) || undefined,
    entityId: asString(raw.entityId) || undefined,
    entityFQN: asString(raw.entityFQN) || undefined,
    createdAt: asNumber(raw.createdAt),
    summary: asString(raw.summary) || undefined,
  };
}

export function listAuditLogs(query: ListAuditLogsQuery = {}): Promise<Paged<AuditLogEntry>> {
  return apiRequest<unknown>('/v1/audit/logs', {
    query: {
      limit: query.limit ?? 25,
      after: query.after,
      before: query.before,
      q: query.q,
      userName: query.userName,
      actorType: query.actorType,
      serviceName: query.serviceName,
      entityType: query.entityType,
      entityFQN: query.entityFQN,
      eventType: query.eventType,
      startTs: query.startTs,
      endTs: query.endTs,
    },
  }).then((payload) => parsePaged(payload, mapAuditLog));
}

export interface AuditLogExportJob {
  jobId?: string;
  status?: string;
}

/**
 * Official audit export (rest/auditLogAPI.ts): GET /export starts a job,
 * GET /export/{jobId} polls it (the official comment notes polling is the
 * fallback because the completion websocket only reaches one server),
 * GET /export/{jobId}/result fetches the completed payload as text.
 */
export async function exportAuditLogs(query: ListAuditLogsQuery = {}): Promise<AuditLogExportJob> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/audit/logs/export', {
    query: {
      q: query.q,
      userName: query.userName,
      actorType: query.actorType,
      serviceName: query.serviceName,
      entityType: query.entityType,
      entityFQN: query.entityFQN,
      eventType: query.eventType,
      startTs: query.startTs,
      endTs: query.endTs,
    },
  });
  return { jobId: asString(raw.jobId) || undefined, status: asString(raw.status) || undefined };
}

export async function getAuditLogExportJob(jobId: string): Promise<AuditLogExportJob> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/audit/logs/export/${encodeURIComponent(jobId)}`);
  return { jobId: asString(raw.jobId) || jobId, status: asString(raw.status) || undefined };
}

export async function getAuditLogExportResult(jobId: string): Promise<string> {
  return apiRequest<string>(`/v1/audit/logs/export/${encodeURIComponent(jobId)}/result`, {
    response: 'text',
  });
}
