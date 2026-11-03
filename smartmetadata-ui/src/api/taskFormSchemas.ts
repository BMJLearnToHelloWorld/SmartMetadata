/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/** JSON Schema object (formSchema / uiSchema family) as stored on the entity. */
export type JsonSchemaObject = Record<string, unknown>;

/**
 * Task form schema entity, mirroring the official TaskFormSchema fields
 * the settings page edits: identity, task type/category, the resolve and
 * create form schemas with their uiSchemas, per-transition forms, default
 * stage mappings, and the bound workflow definition reference.
 */
export interface TaskFormSchema {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  taskType: string;
  taskCategory?: string;
  formSchema: JsonSchemaObject;
  uiSchema?: JsonSchemaObject;
  createFormSchema?: JsonSchemaObject;
  createUiSchema?: JsonSchemaObject;
  transitionForms?: Record<string, unknown>;
  defaultStageMappings?: Record<string, string>;
  workflowDefinitionRef?: string;
  workflowVersion?: number;
  fullyQualifiedName?: string;
}

export function mapTaskFormSchema(raw: Record<string, unknown>): TaskFormSchema | null {
  const name = asString(raw.name);
  if (!name) {
    return null;
  }
  const asObject = (value: unknown): JsonSchemaObject | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonSchemaObject)
      : undefined;
  return {
    id: asString(raw.id) || undefined,
    name,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    taskType: asString(raw.taskType),
    taskCategory: asString(raw.taskCategory) || undefined,
    formSchema: asObject(raw.formSchema) ?? { type: 'object', properties: {} },
    uiSchema: asObject(raw.uiSchema),
    createFormSchema: asObject(raw.createFormSchema),
    createUiSchema: asObject(raw.createUiSchema),
    transitionForms: asObject(raw.transitionForms),
    defaultStageMappings: asObject(raw.defaultStageMappings) as Record<string, string> | undefined,
    workflowDefinitionRef: asString(raw.workflowDefinitionRef) || undefined,
    workflowVersion: typeof raw.workflowVersion === 'number' ? raw.workflowVersion : undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
  };
}

/** Official taskFormSchemasAPI: GET /v1/taskFormSchemas. */
export function listTaskFormSchemas(
  query: { limit?: number } = {},
): Promise<Paged<TaskFormSchema>> {
  return apiRequest<unknown>('/v1/taskFormSchemas', {
    query: { limit: query.limit ?? 100 },
  }).then((payload) => parsePaged(payload, mapTaskFormSchema));
}

/** Official taskFormSchemasAPI: POST /v1/taskFormSchemas. */
export async function createTaskFormSchema(data: TaskFormSchema): Promise<TaskFormSchema> {
  const raw = await apiRequest<unknown>('/v1/taskFormSchemas', { json: data });
  const rec = asRecord(raw);
  const mapped = rec ? mapTaskFormSchema(rec) : null;
  if (!mapped) {
    throw new Error('Task form schema response was missing its name');
  }
  return mapped;
}

/** Official taskFormSchemasAPI: PUT /v1/taskFormSchemas with the full entity. */
export async function updateTaskFormSchema(data: TaskFormSchema): Promise<TaskFormSchema> {
  const raw = await apiRequest<unknown>('/v1/taskFormSchemas', {
    method: 'PUT',
    json: data,
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapTaskFormSchema(rec) : null;
  if (!mapped) {
    throw new Error('Task form schema response was missing its name');
  }
  return mapped;
}
