/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, mapEntityRefs, parsePaged } from '@/api/json';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { Paged } from '@/types/admin';
import type {
  CreateWorkflowDefinitionRequest,
  WorkflowBackendEdge,
  WorkflowBackendNode,
  WorkflowDefinition,
  WorkflowDefinitionFull,
  WorkflowTriggerObject,
} from '@/types/governance';
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
  /** Official history pagination (getWorkflowInstancesByFQN): offset is a String cursor. */
  offset?: string;
  startTs?: number;
  endTs?: number;
  /**
   * Entity-link filter (WorkflowInstanceResource `entityLink` query
   * param): restricts instances to runs for one entity, e.g. the
   * AutoPilot runs of one service.
   */
  entityLink?: string;
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
 * Full workflow definition shape for the builder, which edits the definition
 * JSON (owners, config, trigger, nodes, edges) and reads back the saved name
 * and version. Typed from the spec (WorkflowDefinitionFull); the trigger,
 * nodes and edges are no longer `unknown`.
 */
export interface WorkflowDefinitionDetail extends WorkflowDefinition {
  owners?: WorkflowDefinitionFull['owners'];
  config?: Record<string, unknown>;
  trigger?: WorkflowTriggerObject | unknown;
  nodes?: WorkflowBackendNode[];
  edges?: WorkflowBackendEdge[];
  version?: number;
  type?: WorkflowDefinitionFull['type'];
  deployed?: boolean;
  suspended?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export function asBackendNodes(raw: unknown): WorkflowBackendNode[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec || typeof rec.name !== 'string' || typeof rec.type !== 'string') {
      return [];
    }
    return [
      {
        type: rec.type as WorkflowBackendNode['type'],
        subType: (typeof rec.subType === 'string'
          ? rec.subType
          : 'setEntityAttributeTask') as WorkflowBackendNode['subType'],
        name: rec.name,
        displayName: asString(rec.displayName) || undefined,
        description: asString(rec.description) || undefined,
        input: Array.isArray(rec.input)
          ? (rec.input as unknown[]).map(String)
          : undefined,
        inputNamespaceMap: asRecord(rec.inputNamespaceMap) as
          | Record<string, string>
          | undefined,
        output: Array.isArray(rec.output)
          ? (rec.output as unknown[]).map(String)
          : undefined,
        branches: Array.isArray(rec.branches)
          ? (rec.branches as unknown[]).map(String)
          : undefined,
        config: asRecord(rec.config) ?? undefined,
      },
    ];
  });
}

export function asBackendEdges(raw: unknown): WorkflowBackendEdge[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.flatMap((item) => {
    const rec = asRecord(item);
    if (
      !rec ||
      typeof rec.from !== 'string' ||
      typeof rec.to !== 'string'
    ) {
      return [];
    }
    return [
      {
        from: rec.from,
        to: rec.to,
        condition: asString(rec.condition) || undefined,
      },
    ];
  });
}

function mapWorkflowDefinitionDetail(raw: Record<string, unknown>): WorkflowDefinitionDetail | null {
  const base = mapWorkflowDefinition(raw);
  if (!base) {
    return null;
  }
  return {
    ...base,
    owners: Array.isArray(raw.owners) ? mapEntityRefs(raw.owners) : undefined,
    config: asRecord(raw.config) ?? undefined,
    trigger: raw.trigger,
    nodes: asBackendNodes(raw.nodes),
    edges: asBackendEdges(raw.edges),
    version: typeof raw.version === 'number' ? raw.version : undefined,
    type: asString(raw.type) as WorkflowDefinitionDetail['type'],
    deployed: typeof raw.deployed === 'boolean' ? raw.deployed : undefined,
    suspended: typeof raw.suspended === 'boolean' ? raw.suspended : undefined,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
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
  body: WorkflowDefinitionDetail | WorkflowDefinitionFull,
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

/**
 * Official execution-history surface
 * (openmetadata-ui/.../rest/workflowDefinitionsAPI.ts getWorkflowInstancesByFQN):
 * GET /v1/governance/workflowInstances?workflowDefinitionName={fqn}.
 * Server WorkflowInstanceResource @Path /v1/governance/workflowInstances.
 */
export interface WorkflowInstance {
  id: string;
  status?: string;
  startedAt?: number;
  endedAt?: number;
  variables?: Record<string, unknown>;
}

function mapWorkflowInstance(raw: Record<string, unknown>): WorkflowInstance | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    status: asString(raw.status) || undefined,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : undefined,
    endedAt: typeof raw.endedAt === 'number' ? raw.endedAt : undefined,
    variables: asRecord(raw.variables) ?? undefined,
  };
}

export function listWorkflowInstances(
  fqn: string,
  query: ListWorkflowsQuery = {},
): Promise<Paged<WorkflowInstance>> {
  return apiRequest<unknown>('/v1/governance/workflowInstances', {
    query: {
      workflowDefinitionName: fqn,
      limit: query.limit,
      after: query.after,
      before: query.before,
      offset: query.offset,
      startTs: query.startTs,
      endTs: query.endTs,
      entityLink: query.entityLink,
    },
  }).then((payload) => parsePaged(payload, mapWorkflowInstance));
}

/** Official workflowDefinitionsAPI: GET /v1/governance/workflowDefinitions/{id}?include=all. */
export async function getWorkflowDefinitionById(
  id: string,
): Promise<WorkflowDefinitionDetail> {
  const raw = await apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/${encodeURIComponent(id)}`,
    { query: { include: 'all' } },
  );
  const mapped = mapWorkflowDefinitionDetail(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Workflow definition response was missing its name');
  }
  return mapped;
}

/** Official workflowDefinitionsAPI: PATCH /v1/governance/workflowDefinitions/{id} (JSON Patch). */
export async function patchWorkflowDefinition(
  id: string,
  patch: JsonPatchOp[],
): Promise<WorkflowDefinitionDetail> {
  const raw = await apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: patch,
      contentType: 'application/json-patch+json',
    },
  );
  const mapped = mapWorkflowDefinitionDetail(asRecord(raw) ?? {});
  if (!mapped) {
    throw new Error('Workflow definition response was missing its name');
  }
  return mapped;
}

/** Official workflowDefinitionsAPI: POST /v1/governance/workflowDefinitions/name/{fqn}/trigger. */
export async function triggerWorkflow(fqn: string): Promise<unknown> {
  return apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/name/${encodeURIComponent(fqn)}/trigger`,
    { method: 'POST', json: {} },
  );
}

/**
 * Official workflowDefinitionsAPI: PUT /v1/governance/workflowDefinitions/name/{fqn}/suspend.
 * Server WorkflowDefinitionResource exposes the same path in the product fork.
 */
export async function suspendWorkflow(fqn: string): Promise<unknown> {
  return apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/name/${encodeURIComponent(fqn)}/suspend`,
    { method: 'PUT' },
  );
}

/**
 * Official workflowDefinitionsAPI: PUT /v1/governance/workflowDefinitions/name/{fqn}/resume.
 * Server WorkflowDefinitionResource exposes the same path in the product fork.
 */
export async function resumeWorkflow(fqn: string): Promise<unknown> {
  return apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/name/${encodeURIComponent(fqn)}/resume`,
    { method: 'PUT' },
  );
}

/** Official workflowDefinitionsAPI: POST /v1/governance/workflowDefinitions/validate. */
export interface WorkflowValidationResult {
  message: string;
  status?: string;
  validatedAt?: number;
  code?: number;
}

export async function validateWorkflowDefinition(
  body: WorkflowDefinitionFull,
): Promise<WorkflowValidationResult> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${WORKFLOW_DEFINITIONS_PATH}/validate`,
    { method: 'POST', json: body },
  );
  return {
    message: asString(raw.message) || '',
    status: asString(raw.status) || undefined,
    validatedAt: typeof raw.validatedAt === 'number' ? raw.validatedAt : undefined,
    code: typeof raw.code === 'number' ? raw.code : undefined,
  };
}

/** Official workflowDefinitionsAPI: DELETE /v1/governance/workflowDefinitions/name/{fqn}?hardDelete. */
export async function deleteWorkflowByFqn(
  fqn: string,
  hardDelete = true,
): Promise<unknown> {
  return apiRequest<unknown>(
    `${WORKFLOW_DEFINITIONS_PATH}/name/${encodeURIComponent(fqn)}`,
    { method: 'DELETE', query: { hardDelete } },
  );
}

/**
 * Official workflowDefinitionsAPI: GET governance/workflowInstanceStates/{fqn}/{instanceId}.
 * (No leading slash in the official call; the client prefixes /v1 the same way.)
 */
export async function getWorkflowInstanceDetails(
  fqn: string,
  instanceId: string,
): Promise<Record<string, unknown>> {
  const raw = await apiRequest<unknown>(
    `/v1/governance/workflowInstanceStates/${encodeURIComponent(fqn)}/${encodeURIComponent(instanceId)}`,
  );
  return asRecord(raw) ?? {};
}
