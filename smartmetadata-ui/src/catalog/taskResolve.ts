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
  asStringOrUndefined,
  getTaskResolutionNewValue,
  normalizeTaskSuggestion,
  parseTagFqns,
} from '@/catalog/taskSuggestions';
import type {
  CollaborationTask,
  ResolveTaskRequest,
  TaskAvailableTransition,
} from '@/types/collaboration';

/**
 * Task resolve actions, mirroring official
 * components/discovery/personal-space/InboxPage/taskResolve.utils.ts
 * (getTaskResolveActions / buildResolveBody / needsTaskActionInput)
 * in its schema-less form: the My Tasks card never loads a task form
 * schema, so the per-type defaults cover every branch (the official
 * card passes no schema either). The TaskFormSchemaUtils tree is not
 * ported — the product carries no task-form uiSchema, and the card's
 * only inputs are the task and the two labels.
 * ADR:2026-11-08-my-data-my-task-resolve-actions
 */

// A task with no server transitions is only actionable in these states.
// Official OPEN_TASK_STATUSES (inbox.utils.ts, mirroring
// TaskBucketSql.SHARED_OPEN_STATUSES): Open, InProgress, Pending,
// ManualRevoke.
const OPEN_TASK_STATUSES: ReadonlySet<string> = new Set([
  'Open',
  'InProgress',
  'Pending',
  'ManualRevoke',
]);

// Not transition ids: a legacy resolve omits `transitionId` (see
// buildResolveBody) and lets the server pick its default transition.
export const LEGACY_APPROVE_ACTION_ID = 'legacy-approve';
export const LEGACY_REJECT_ACTION_ID = 'legacy-reject';

export type TaskActionKind = 'approve' | 'reject' | 'assignee' | 'other';

export interface TaskResolveAction {
  // Transition id for a workflow task; a LEGACY_*_ACTION_ID for a legacy one.
  id: string;
  label: string;
  kind: TaskActionKind;
  requiresComment: boolean;
  // Set only for a server-driven transition; absent ⇒ legacy task.
  transition?: TaskAvailableTransition;
  targetTaskStatus?: string;
}

/**
 * Transitions that (re)assign the task — the workflow expects the chosen
 * assignees in the resolve payload, so these open a picker instead of firing.
 */
export const isAssigneeTransition = (transition: TaskAvailableTransition): boolean =>
  transition.id === 'assign' ||
  transition.id === 'reassign' ||
  transition.targetStageId === 'assigned';

export const isApproveTransition = (transition: TaskAvailableTransition): boolean =>
  transition.resolutionType === 'Approved' ||
  transition.resolutionType === 'AutoApproved' ||
  transition.id === 'approve';

export const isRejectTransition = (transition: TaskAvailableTransition): boolean =>
  transition.resolutionType === 'Rejected' ||
  transition.resolutionType === 'AutoRejected' ||
  transition.id === 'reject';

function getTransitionKind(transition: TaskAvailableTransition): TaskActionKind {
  if (isAssigneeTransition(transition)) {
    return 'assignee';
  }
  if (isApproveTransition(transition)) {
    return 'approve';
  }
  if (isRejectTransition(transition)) {
    return 'reject';
  }
  return 'other';
}

/** Official inbox.utils isTaskOpen: open statuses, plus an Approved access request. */
export function isTaskOpen(task: CollaborationTask): boolean {
  return (
    (task.status !== undefined && OPEN_TASK_STATUSES.has(task.status)) ||
    (task.type === 'DataAccessRequest' && task.status === 'Approved')
  );
}

/**
 * Official TaskUtils.isOntologyReviewTask: a RequestApproval about an
 * ontology release. A native review votes on server-captured content;
 * it cannot edit that content, so the resolve body drops payload and
 * newValue for it (getTaskResolveBody).
 */
export function isOntologyReviewTask(task: CollaborationTask): boolean {
  return task.type === 'RequestApproval' && task.about?.type === 'ontologyRelease';
}

/**
 * Official MetadataCompletionTask.utils isRevisionRequest: a Metadata
 * Completion task whose payload carries a revision — completed by
 * editing the asset, not resolved here.
 */
export function isRevisionRequest(task: CollaborationTask): boolean {
  return task.type === 'MetadataCompletion' && task.rawPayload?.revision === true;
}

// Approval-type tasks resolve to the handler's approved/rejected
// sentinel; suggestion types (description, tags, …) to the value being
// applied. Per-type defaults from official TaskFormSchemaUtils
// (DEFAULT_TASK_FORM_HANDLERS, no uiSchema on the card).
const APPROVAL_HANDLER_TYPES: ReadonlySet<string> = new Set([
  'GlossaryApproval',
  'RequestApproval',
]);

function isApprovalHandlerType(task: CollaborationTask): boolean {
  return APPROVAL_HANDLER_TYPES.has(task.type ?? '');
}

interface LegacyResolution {
  resolutionType: 'Approved' | 'Rejected';
  newValue?: string;
  payload?: Record<string, unknown>;
}

/**
 * Official getEditableTaskPayload (TaskFormSchemaUtils, no uiSchema on the
 * card): a DescriptionUpdate approve carries fieldPath + the current/new
 * description, a TagUpdate approve carries fieldPath + current/add/remove
 * tags — each taken from the raw payload with the normalized suggestion
 * as fallback. Every other type echoes the raw payload unchanged, exactly
 * as official does for types with no editable-payload branch.
 */
function buildEditableTaskPayload(task: CollaborationTask): Record<string, unknown> {
  const raw = task.rawPayload ?? {};
  const normalized = normalizeTaskSuggestion(task);
  if (task.type === 'DescriptionUpdate') {
    return {
      ...raw,
      fieldPath: asStringOrUndefined(raw.fieldPath) ?? normalized.fieldPath,
      currentDescription:
        asStringOrUndefined(raw.currentDescription) ??
        asStringOrUndefined(raw.currentValue) ??
        normalized.currentDescription,
      newDescription:
        asStringOrUndefined(raw.newDescription) ??
        asStringOrUndefined(raw.suggestedValue) ??
        normalized.newDescription,
    };
  }
  if (task.type === 'TagUpdate') {
    const currentTags =
      raw.currentTags !== undefined ? parseTagFqns(raw.currentTags) : normalized.currentTags;
    const tagsToAdd =
      raw.tagsToAdd !== undefined
        ? parseTagFqns(raw.tagsToAdd)
        : normalized.suggestedTags.filter((tag) => !currentTags.includes(tag));
    const tagsToRemove =
      raw.tagsToRemove !== undefined
        ? parseTagFqns(raw.tagsToRemove)
        : currentTags.filter((tag) => !normalized.suggestedTags.includes(tag));
    return {
      ...raw,
      fieldPath: asStringOrUndefined(raw.fieldPath) ?? normalized.fieldPath,
      currentTags,
      tagsToAdd,
      tagsToRemove,
    };
  }
  return raw;
}

/**
 * Mirrors `TaskTabNew`'s legacy path: approval-type tasks resolve to the
 * handler's approved/rejected sentinel, suggestion types to the value
 * being applied. With no schema, shouldRequireTaskResolutionValue is
 * false, so approve is never dropped for an empty value here.
 */
function buildLegacyResolution(
  task: CollaborationTask,
  kind: 'approve' | 'reject',
): LegacyResolution {
  // DataAccessRequest has no entry in official
  // DEFAULT_TASK_FORM_HANDLERS, so its handler is 'custom', not
  // 'approval': its approve carries no newValue sentinel, only the
  // echoed payload.
  const isApprovalHandler = isApprovalHandlerType(task);
  if (kind === 'reject') {
    return {
      resolutionType: 'Rejected',
      // A rejection applies nothing, so it carries no payload.
      newValue: isApprovalHandler ? 'rejected' : undefined,
    };
  }
  return {
    resolutionType: 'Approved',
    newValue: isApprovalHandler ? 'approved' : getTaskResolutionNewValue(task),
    // The editable payload, not the raw echo: description/tag approves
    // carry the normalized fields the server applies.
    payload: buildEditableTaskPayload(task),
  };
}

function getLegacyActions(
  task: CollaborationTask,
  labels: { approve: string; reject: string },
): TaskResolveAction[] {
  if (!task.status || !OPEN_TASK_STATUSES.has(task.status)) {
    return [];
  }

  // Incidents resolve through their own transition ('resolve' + Completed + a
  // root cause), which a generic approve/reject cannot stand in for.
  if (task.category === 'Incident') {
    return [];
  }

  return [
    {
      id: LEGACY_APPROVE_ACTION_ID,
      label: labels.approve,
      kind: 'approve',
      requiresComment: false,
    },
    {
      id: LEGACY_REJECT_ACTION_ID,
      label: labels.reject,
      kind: 'reject',
      requiresComment: false,
    },
  ];
}

/**
 * The actions a task exposes: the server's `availableTransitions` when it has
 * them, else the legacy approve/reject the entity page's task tab offers.
 */
export function getTaskResolveActions(
  task: CollaborationTask,
  labels: { approve: string; reject: string },
): TaskResolveAction[] {
  // Closing a task without a transition (cancellation, timer expiry) leaves its
  // workflow transitions on it, so a closed task would still offer
  // Approve/Reject. A Granted access request is closed too, but its Revoke is
  // real; a row without a status is not known to be closed.
  const isClosed = Boolean(task.status) && !isTaskOpen(task) && task.status !== 'Granted';
  const transitions = isClosed ? [] : (task.availableTransitions ?? []);

  if (transitions.length > 0) {
    return transitions.map((transition) => ({
      id: transition.id,
      label: transition.label,
      kind: getTransitionKind(transition),
      requiresComment: Boolean(transition.requiresComment),
      transition,
      targetTaskStatus: transition.targetTaskStatus,
    }));
  }

  // A Revise and resubmit task is completed by editing the asset, not resolved here.
  return isOntologyReviewTask(task) || isRevisionRequest(task) ? [] : getLegacyActions(task, labels);
}

export interface TaskActionInput {
  // The workflow flagged requiresComment; the server 400s without one.
  requiresComment: boolean;
  // An (re)assign, whose assignees travel in the resolve payload.
  requiresAssignee: boolean;
  // Incident resolutions store the reason as testCaseFailureReason.
  requiresRootCause: boolean;
}

/**
 * What an action must collect before it can be resolved. An action that needs
 * nothing fires straight away; anything else opens the action modal.
 */
export function getTaskActionInput(task: CollaborationTask, action: TaskResolveAction): TaskActionInput {
  return {
    requiresComment: action.requiresComment,
    requiresAssignee: action.kind === 'assignee',
    requiresRootCause: task.category === 'Incident' && action.requiresComment,
  };
}

export function needsTaskActionInput(task: CollaborationTask, action: TaskResolveAction): boolean {
  return Object.values(getTaskActionInput(task, action)).some(Boolean);
}

/**
 * The `POST /tasks/{id}/resolve` body for an action. A workflow action names its
 * transition; a legacy action must NOT — the server validates a named
 * transitionId against `task.availableTransitions` and 400s on anything else, so
 * it sends resolutionType + newValue and lets the server resolve the transition.
 */
export function buildResolveBody(
  action: TaskResolveAction,
  task: CollaborationTask,
  extras?: { comment?: string; payload?: Record<string, unknown> },
): ResolveTaskRequest {
  const comment = extras?.comment ? { comment: extras.comment } : {};

  if (action.transition) {
    const body: ResolveTaskRequest = {
      transitionId: action.transition.id,
      resolutionType: action.transition.resolutionType as ResolveTaskRequest['resolutionType'],
      ...comment,
      ...(extras?.payload ? { payload: extras.payload } : {}),
    };
    // A native review votes on server-captured content; it cannot edit
    // that content (official getTaskResolveBody).
    return isOntologyReviewTask(task)
      ? {
          transitionId: body.transitionId,
          resolutionType: body.resolutionType,
          comment: body.comment,
        }
      : body;
  }

  const legacy = buildLegacyResolution(task, action.kind === 'reject' ? 'reject' : 'approve');
  return {
    ...legacy,
    ...comment,
    ...(extras?.payload
      ? { payload: { ...(legacy.payload ?? {}), ...extras.payload } }
      : {}),
  };
}
