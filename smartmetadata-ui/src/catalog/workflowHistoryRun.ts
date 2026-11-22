/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  getWorkflowDefinitionById,
  getWorkflowInstanceStates,
  listWorkflowInstancesForEntity,
  type WorkflowDefinitionDetail,
  type WorkflowInstance,
  type WorkflowInstanceState,
} from '@/api/workflows';
import { toEntityLink } from '@/quality/entityLink';

/**
 * Official getLatestWorkflowRun
 * (openmetadata-ui/.../GlossaryTerms/tabs/WorkFlowTab/WorkflowHistory.utils.ts),
 * ported 1:1: the card follows the term's stage, so only a workflow that
 * sets it counts — the default approval workflow or a lifecycle playbook,
 * not an event-based workflow that merely ran on the term.
 *
 * Bounded deviation: pin reads definition nodes as raw JSON (a node with
 * no subType never matches). The product's `asBackendNodes` defaults a
 * missing subType to `setEntityAttributeTask`, so a malformed node with
 * no subType but `config.fieldName` of `status`/`entityStatus` would
 * match here and not in pin. Such a node carries no meaning in either
 * tree (fieldName only exists on set-attribute nodes); the deviation is
 * recorded, not papered over.
 */
const STAGE_FIELDS: ReadonlySet<string> = new Set(['status', 'entityStatus']);

export function setsEntityStage(definition: WorkflowDefinitionDetail): boolean {
  const config = definition.config as Record<string, unknown> | undefined;
  if (config?.lifecycle) {
    return true;
  }
  return (definition.nodes ?? []).some((node) => {
    if (node.subType === 'setGlossaryTermStatusTask') {
      return true;
    }
    if (node.subType !== 'setEntityAttributeTask') {
      return false;
    }
    const fieldName = node.config?.fieldName;
    return typeof fieldName === 'string' && STAGE_FIELDS.has(fieldName);
  });
}

export interface LatestWorkflowRun {
  definition: WorkflowDefinitionDetail;
  states: WorkflowInstanceState[];
}

/** Official RECENT_INSTANCES_LIMIT (WorkflowHistory.utils.ts). */
export const WORKFLOW_HISTORY_PAGE_LIMIT = 25;
/** Official MAX_INSTANCE_PAGES (WorkflowHistory.utils.ts). */
export const WORKFLOW_HISTORY_MAX_PAGES = 8;
/** Official 180-day window (WorkflowHistory.component.tsx). */
export const WORKFLOW_HISTORY_WINDOW_DAYS = 180;

export function workflowHistoryTimeRange(now = Date.now()): { startTs: number; endTs: number } {
  return {
    startTs: now - WORKFLOW_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    endTs: now,
  };
}

export function glossaryTermEntityLink(fullyQualifiedName: string): string {
  return toEntityLink('glossaryTerm', fullyQualifiedName);
}

function getInstanceStart(instance: WorkflowInstance): number {
  return instance.startedAt ?? instance.timestamp ?? 0;
}

async function getReadableDefinitions(
  instances: WorkflowInstance[],
): Promise<Map<string, WorkflowDefinitionDetail>> {
  const ids = [...new Set(instances.map((instance) => instance.workflowDefinitionId).filter(Boolean))] as string[];
  const results = await Promise.allSettled(ids.map((id) => getWorkflowDefinitionById(id)));
  const byId = new Map<string, WorkflowDefinitionDetail>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      byId.set(result.value.id, result.value);
    }
  }
  return byId;
}

interface StageRun {
  instance: WorkflowInstance;
  definition: WorkflowDefinitionDetail;
}

async function findStageRun(
  entityLink: string,
  timeRange: { startTs: number; endTs: number },
  page = 0,
  after?: string,
): Promise<StageRun | undefined> {
  const { data, after: nextAfter } = await listWorkflowInstancesForEntity({
    ...timeRange,
    entityLink,
    limit: WORKFLOW_HISTORY_PAGE_LIMIT,
    ...(after ? { offset: after } : {}),
  });
  const instances = [...(data ?? [])].sort((a, b) => getInstanceStart(b) - getInstanceStart(a));
  const definitions = await getReadableDefinitions(instances);
  const instance = instances.find(
    (candidate) =>
      candidate.id &&
      candidate.workflowDefinitionId &&
      definitions.get(candidate.workflowDefinitionId) &&
      setsEntityStage(definitions.get(candidate.workflowDefinitionId) as WorkflowDefinitionDetail),
  );
  if (instance?.workflowDefinitionId) {
    return {
      instance,
      definition: definitions.get(instance.workflowDefinitionId) as WorkflowDefinitionDetail,
    };
  }
  const next = page + 1 < WORKFLOW_HISTORY_MAX_PAGES ? nextAfter : undefined;
  return next ? findStageRun(entityLink, timeRange, page + 1, next) : undefined;
}

/**
 * Without a definition name the instance list covers every workflow that
 * ran for the entity; the newest run of a workflow that sets the entity's
 * stage decides whose history the card shows.
 */
export async function getLatestWorkflowRun(
  entityLink: string,
  timeRange: { startTs: number; endTs: number },
): Promise<LatestWorkflowRun | undefined> {
  const run = await findStageRun(entityLink, timeRange);
  if (!run?.instance.id) {
    return undefined;
  }
  const { data: states } = await getWorkflowInstanceStates(run.definition.name, run.instance.id, timeRange);
  return { definition: run.definition, states: [...states].reverse() };
}
