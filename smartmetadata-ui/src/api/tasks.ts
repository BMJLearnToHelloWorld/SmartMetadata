/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import type {
  CollaborationTask,
  CreateTaskRequest,
  ResolveTaskRequest,
  TaskComment,
} from '@/types/collaboration';
import { apiRequest } from './client';

export const TASK_LIST_FIELDS = 'assignees,about,createdBy';
export const TASK_DETAIL_FIELDS = 'assignees,reviewers,watchers,about,domains,comments,createdBy,payload';

export interface ListTasksQuery {
  limit?: number;
  after?: string;
  status?: string;
  statusGroup?: string;
  category?: string;
  type?: string;
  aboutEntity?: string;
}

function mapComments(value: unknown): TaskComment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const message = asString(rec.message);
    if (!message) {
      return [];
    }
    return [
      {
        id: asString(rec.id) || undefined,
        message,
        createdAt: asNumber(rec.createdAt),
        author: mapEntityRefs(rec.author ? [rec.author] : [])[0],
      },
    ];
  });
}

function mapTask(raw: Record<string, unknown>): CollaborationTask | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    category: asString(raw.category) || undefined,
    type: asString(raw.type) || undefined,
    status: asString(raw.status) || undefined,
    priority: asString(raw.priority) || undefined,
    about: mapEntityRefs(raw.about ? [raw.about] : [])[0],
    assignees: mapEntityRefs(raw.assignees),
    createdBy: mapEntityRefs(raw.createdBy ? [raw.createdBy] : [])[0],
    comments: mapComments(raw.comments),
  };
}

function requireTask(raw: Record<string, unknown>, action: string): CollaborationTask {
  const mapped = mapTask(raw);
  if (!mapped) {
    throw new Error(`${action} succeeded but the response had no task`);
  }
  return mapped;
}

export function listTasks(query: ListTasksQuery = {}): Promise<Paged<CollaborationTask>> {
  return apiRequest<unknown>('/v1/tasks', {
    query: {
      fields: TASK_LIST_FIELDS,
      limit: query.limit ?? 50,
      after: query.after,
      status: query.status,
      statusGroup: query.statusGroup,
      category: query.category,
      type: query.type,
      aboutEntity: query.aboutEntity,
    },
  }).then((payload) => parsePaged(payload, mapTask));
}

export async function getTask(id: string): Promise<CollaborationTask> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}`, {
    query: { fields: TASK_DETAIL_FIELDS },
  });
  return requireTask(raw, 'Get task');
}

export async function createTask(body: CreateTaskRequest): Promise<CollaborationTask> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/tasks', {
    method: 'POST',
    json: {
      category: body.category,
      type: body.type,
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      about: body.about,
      assignees: body.assignees,
      priority: body.priority,
    },
  });
  return requireTask(raw, 'Create task');
}

export async function resolveTask(id: string, body: ResolveTaskRequest): Promise<CollaborationTask> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    json: {
      resolutionType: body.resolutionType,
      comment: body.comment,
    },
  });
  return requireTask(raw, 'Resolve task');
}

/**
 * Close a task without resolution. Official shape
 * (openmetadata-ui/.../rest/tasksAPI.ts closeTask): POST /{id}/close with
 * the comment as a query parameter. Live acceptance by the product
 * backend is unverified (R8); the shape itself is official, not invented.
 */
export async function closeTask(id: string, comment?: string): Promise<CollaborationTask> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    query: { comment },
  });
  return requireTask(raw, 'Close task');
}

export async function addTaskComment(id: string, message: string): Promise<CollaborationTask> {
  const raw = await apiRequest<Record<string, unknown>>(`/v1/tasks/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    json: { message },
  });
  return requireTask(raw, 'Add task comment');
}
