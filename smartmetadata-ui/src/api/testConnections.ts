/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString } from '@/api/json';
import { mapTestConnectionResult } from '@/api/serviceCommon';
import type { ServiceKind, TestConnectionResult } from '@/types/ingestion';
import { apiRequest } from './client';

/**
 * Official TestConnection flow (openmetadata-ui
 * components/common/TestConnection/TestConnection.tsx +
 * rest/workflowAPI.ts), against the product server:
 * 1. GET /v1/services/testConnectionDefinitions/name/{type}.testConnectionDefinition
 * 2. POST /v1/automations/workflows { workflowType: 'TEST_CONNECTION', request }
 * 3. POST /v1/automations/workflows/trigger/{id}
 * 4. Poll GET /v1/automations/workflows/{id} until the workflow completes;
 *    its `response` carries the TestConnectionResult steps.
 * 5. DELETE the workflow once finished (official cleanup; on trigger
 *    failure too). On a polling timeout the workflow is left in place and
 *    the UI says so — deleting an unfinished run would hide its state.
 * The stored service testConnectionResult is written by the runner, never
 * PUT by this console; the UI reloads the service after completion.
 */

export interface TestConnectionDefinitionStep {
  name: string;
  description?: string;
  mandatory?: boolean;
}

export interface TestConnectionWorkflow {
  id: string;
  status?: string;
  response?: TestConnectionResult;
}

function mapWorkflow(raw: Record<string, unknown>): TestConnectionWorkflow | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }
  return {
    id,
    status: asString(raw.status) || undefined,
    response: mapTestConnectionResult(raw.response),
  };
}

export async function getTestConnectionDefinition(
  connectionType: string,
): Promise<TestConnectionDefinitionStep[]> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/services/testConnectionDefinitions/name/${encodeURIComponent(connectionType)}.testConnectionDefinition`,
  );
  const steps = raw.steps;
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.flatMap((item) => {
    const step = asRecord(item);
    const name = step ? asString(step.name) : '';
    if (!name) {
      return [];
    }
    return [
      {
        name,
        description: step ? asString(step.description) || undefined : undefined,
        mandatory: step ? asBoolean(step.mandatory) : undefined,
      },
    ];
  });
}

export interface CreateTestConnectionWorkflowRequest {
  serviceName: string;
  kind: ServiceKind;
  connectionType: string;
  /**
   * Stored connection as returned by GET service (unredacted). For an
   * admin the server returns real secrets and the runner tests them;
   * for anyone else secrets arrive masked and the run fails honestly
   * (or workflow creation is denied server-side). The UI never sends
   * the redacted display JSON — that would test masked values.
   */
  connection: Record<string, unknown>;
}

/** openmetadata-spec entity/services/serviceType.json, by product kind. */
export const WORKFLOW_SERVICE_TYPE_BY_KIND: Record<ServiceKind, string> = {
  database: 'Database',
  messaging: 'Messaging',
  dashboard: 'Dashboard',
  storage: 'Storage',
  pipeline: 'Pipeline',
  api: 'Api',
  mlmodel: 'MlModel',
  metadata: 'Metadata',
  drive: 'Drive',
  search: 'Search',
  llm: 'LLM',
  mcp: 'Mcp',
  security: 'Security',
};

export async function createTestConnectionWorkflow(
  body: CreateTestConnectionWorkflowRequest,
): Promise<TestConnectionWorkflow> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/automations/workflows', {
    method: 'POST',
    json: {
      name: `${body.connectionType}.testConnection`,
      workflowType: 'TEST_CONNECTION',
      request: {
        connection: body.connection,
        serviceType: WORKFLOW_SERVICE_TYPE_BY_KIND[body.kind],
        connectionType: body.connectionType,
        serviceName: body.serviceName,
      },
    },
  });
  const mapped = mapWorkflow(raw);
  if (!mapped) {
    throw new Error('Create test-connection workflow succeeded but the response had no workflow');
  }
  return mapped;
}

/**
 * Trigger a test-connection workflow. The product client throws on a
 * non-2xx response, so resolving means triggered (official's
 * `status === 200` check) and rejecting means trigger failed — the
 * caller then deletes the workflow, as official does.
 */
export function triggerTestConnectionWorkflow(id: string): Promise<void> {
  return apiRequest<void>(`/v1/automations/workflows/trigger/${encodeURIComponent(id)}`, {
    method: 'POST',
  });
}

export async function getTestConnectionWorkflow(id: string): Promise<TestConnectionWorkflow> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/automations/workflows/${encodeURIComponent(id)}`,
  );
  const mapped = mapWorkflow(raw);
  if (!mapped) {
    throw new Error('Test-connection workflow response was missing id');
  }
  return mapped;
}

export function deleteTestConnectionWorkflow(id: string): Promise<void> {
  return apiRequest<void>(`/v1/automations/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Workflow statuses after which the run will not change again (official WORKFLOW_COMPLETE_STATUS). */
export const TEST_CONNECTION_COMPLETE_STATUSES = ['Successful', 'Failed'] as const;

export function isTestConnectionComplete(status: string | undefined): boolean {
  return status !== undefined && (TEST_CONNECTION_COMPLETE_STATUSES as readonly string[]).includes(status);
}
