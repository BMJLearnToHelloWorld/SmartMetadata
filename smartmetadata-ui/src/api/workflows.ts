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
import type { CreateWorkflowDefinitionRequest, WorkflowDefinition } from '@/types/governance';
import { apiRequest } from './client';

/**
 * Official list/create surface
 * (openmetadata-ui/.../rest/workflowDefinitionsAPI.ts):
 * GET/POST /governance/workflowDefinitions with limit/after/before cursors.
 */
const WORKFLOW_DEFINITIONS_PATH = '/v1/governance/workflowDefinitions';

export interface ListWorkflowsQuery {
  limit?: number;
  after?: string;
  before?: string;
}

function mapWorkflowDefinition(raw: Record<string, unknown>): WorkflowDefinition | null {
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id && !name) {
    return null;
  }
  return {
    id,
    name,
    displayName: asString(raw.displayName) || undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
    description: asString(raw.description) || undefined,
  };
}

export function listWorkflows(query: ListWorkflowsQuery = {}): Promise<Paged<WorkflowDefinition>> {
  return apiRequest<unknown>(WORKFLOW_DEFINITIONS_PATH, {
    query: {
      limit: query.limit,
      after: query.after,
      before: query.before,
    },
  }).then((payload) => parsePaged(payload, mapWorkflowDefinition));
}

export async function createWorkflow(
  body: CreateWorkflowDefinitionRequest,
): Promise<WorkflowDefinition> {
  const raw = await apiRequest<Record<string, unknown>>(WORKFLOW_DEFINITIONS_PATH, {
    method: 'POST',
    json: body,
  });
  const mapped = mapWorkflowDefinition(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Create workflow succeeded but the response had no workflow definition');
  }
  return mapped;
}

/**
 * Full workflow definition shape for the task-form settings page, which
 * edits the definition JSON (owners, config, trigger, nodes, edges) and
 * reads back the saved name and version.
 */
export interface WorkflowDefinitionDetail extends WorkflowDefinition {
  owners?: unknown;
  config?: unknown;
  trigger?: unknown;
  nodes?: unknown;
  edges?: unknown;
  version?: number;
}

function mapWorkflowDefinitionDetail(raw: Record<string, unknown>): WorkflowDefinitionDetail | null {
  const base = mapWorkflowDefinition(raw);
  if (!base) {
    return null;
  }
  return {
    ...base,
    owners: raw.owners,
    config: raw.config,
    trigger: raw.trigger,
    nodes: raw.nodes,
    edges: raw.edges,
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

/** Official workflowDefinitionsAPI: GET /v1/governance/workflowDefinitions/name/{fqn}. */
export async function getWorkflowDefinitionByFqn(fqn: string): Promise<WorkflowDefinitionDetail> {
  const raw = await apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/name/${encodeURIComponent(fqn)}`,
  );
  const mapped = mapWorkflowDefinitionDetail(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Workflow definition response was missing its name');
  }
  return mapped;
}

/** Official workflowDefinitionsAPI: PUT /v1/governance/workflowDefinitions. */
export async function updateWorkflowDefinition(
  body: WorkflowDefinitionDetail,
): Promise<WorkflowDefinitionDetail> {
  const raw = await apiRequest<unknown>(WORKFLOW_DEFINITIONS_PATH, {
    method: 'PUT',
    json: body,
  });
  const mapped = mapWorkflowDefinitionDetail(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Workflow definition response was missing its name');
  }
  return mapped;
}
