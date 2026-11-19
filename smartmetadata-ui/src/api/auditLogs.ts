/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/** One field change inside a ChangeDescription (fieldsAdded/Updated/Deleted). */
export interface AuditLogFieldChange {
  name?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditLogChangeDescription {
  fieldsAdded?: AuditLogFieldChange[];
  fieldsUpdated?: AuditLogFieldChange[];
  fieldsDeleted?: AuditLogFieldChange[];
  previousVersion?: number;
}

/** The entity carried on a change event; only the fields the feed reads are mapped. */
export interface AuditLogChangeEventEntity {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
}

export interface AuditLogChangeEvent {
  entity?: AuditLogChangeEventEntity;
  entityType?: string;
  entityFullyQualifiedName?: string;
  changeDescription?: AuditLogChangeDescription;
}

/** Audit log entry, mirroring the official AuditLogEntry (types/auditLogs.interface.ts:16-34). */
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
  changeEvent?: AuditLogChangeEvent;
  summary?: string;
  /** Carried only; the feed never renders it (the pin list does not read it either). */
  rawEventJson?: unknown;
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
  /** Present in the pin parameter type; the UI never assigns it (03 §11.3, C12). */
  eventType?: string;
  startTs?: number;
  endTs?: number;
}

function mapFieldChanges(value: unknown): AuditLogFieldChange[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    return [
      {
        name: asString(rec.name) || undefined,
        oldValue: rec.oldValue,
        newValue: rec.newValue,
      },
    ];
  });
}

function mapChangeEvent(value: unknown): AuditLogChangeEvent | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const entityRec = asRecord(rec.entity);
  const descriptionRec = asRecord(rec.changeDescription);
  return {
    entity: entityRec
      ? {
          id: asString(entityRec.id) || undefined,
          name: asString(entityRec.name) || undefined,
          displayName: asString(entityRec.displayName) || undefined,
          fullyQualifiedName: asString(entityRec.fullyQualifiedName) || undefined,
        }
      : undefined,
    entityType: asString(rec.entityType) || undefined,
    entityFullyQualifiedName: asString(rec.entityFullyQualifiedName) || undefined,
    changeDescription: descriptionRec
      ? {
          fieldsAdded: mapFieldChanges(descriptionRec.fieldsAdded),
          fieldsUpdated: mapFieldChanges(descriptionRec.fieldsUpdated),
          fieldsDeleted: mapFieldChanges(descriptionRec.fieldsDeleted),
          previousVersion: asNumber(descriptionRec.previousVersion),
        }
      : undefined,
  };
}

function mapAuditLog(raw: Record<string, unknown>): AuditLogEntry {
  // 03 §11.2: entries without a numeric id are kept (the pin keys rows
  // by id ?? changeEventId ?? index); nothing is dropped here.
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
    changeEvent: mapChangeEvent(raw.changeEvent),
    summary: asString(raw.summary) || undefined,
    rawEventJson: raw.rawEventJson,
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

/** Export job (types/auditLogs.interface.ts:101-109): all fields, not just id/status. */
export interface AuditLogExportJob {
  jobId?: string;
  status?: string;
  message?: string;
  error?: string;
  progress?: number;
  total?: number;
}

function mapExportJob(raw: Record<string, unknown>, fallbackJobId?: string): AuditLogExportJob {
  return {
    jobId: asString(raw.jobId) || fallbackJobId,
    status: asString(raw.status) || undefined,
    message: asString(raw.message) || undefined,
    error: asString(raw.error) || undefined,
    progress: asNumber(raw.progress),
    total: asNumber(raw.total),
  };
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
  return mapExportJob(raw);
}

export async function getAuditLogExportJob(jobId: string): Promise<AuditLogExportJob> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/audit/logs/export/${encodeURIComponent(jobId)}`);
  return mapExportJob(raw, jobId);
}

export async function getAuditLogExportResult(jobId: string): Promise<string> {
  return apiRequest<string>(`/v1/audit/logs/export/${encodeURIComponent(jobId)}/result`, {
    response: 'text',
  });
}
