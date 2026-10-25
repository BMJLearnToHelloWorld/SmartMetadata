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
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import type { CatalogPipelineStatus, PipelineTask, PipelineTaskStatus } from '@/types/api';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

export function mapPipelineTask(value: unknown): PipelineTask | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const name = asString(rec.name);
  if (!name) {
    return null;
  }
  const downstream = Array.isArray(rec.downstreamTasks)
    ? rec.downstreamTasks.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  return {
    name,
    displayName: asString(rec.displayName) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
    description: asString(rec.description) || undefined,
    taskType: asString(rec.taskType) || undefined,
    sourceUrl: asString(rec.sourceUrl) || undefined,
    downstreamTasks: downstream,
  };
}

export function mapPipelineTaskStatus(value: unknown): PipelineTaskStatus | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const name = asString(rec.name);
  const executionStatus = asString(rec.executionStatus);
  if (!name || !executionStatus) {
    return null;
  }
  return {
    name,
    executionStatus,
    startTime: asNumber(rec.startTime),
    endTime: asNumber(rec.endTime),
  };
}

export function mapCatalogPipelineStatus(value: unknown): CatalogPipelineStatus | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const timestamp = asNumber(rec.timestamp);
  const executionStatus = asString(rec.executionStatus);
  if (timestamp === undefined || !executionStatus) {
    return null;
  }
  const taskStatus = Array.isArray(rec.taskStatus)
    ? rec.taskStatus.flatMap((item) => {
        const mapped = mapPipelineTaskStatus(item);
        return mapped ? [mapped] : [];
      })
    : [];
  return {
    timestamp,
    executionStatus,
    executionId: asString(rec.executionId) || undefined,
    endTime: asNumber(rec.endTime),
    taskStatus,
  };
}

export function listCatalogPipelineStatuses(
  fqn: string,
  query: { startTs: number; endTs: number; limit?: number },
): Promise<Paged<CatalogPipelineStatus>> {
  return apiRequest<unknown>(`/v1/pipelines/${encodeFqnForApi(fqn)}/status`, {
    query: {
      startTs: query.startTs,
      endTs: query.endTs,
      limit: query.limit ?? 20,
    },
  }).then((payload) => parsePaged(payload, (row) => mapCatalogPipelineStatus(row)));
}
