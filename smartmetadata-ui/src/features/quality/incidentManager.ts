/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, mapEntityRefs } from '@/api/json';
import {
  AGGREGATE_PAGE_SIZE_LARGE,
  postAggregateFieldOptions,
  type AggregateResponse,
} from '@/api/search';
import { createTask, resolveTask } from '@/api/tasks';
import { getTeamByName } from '@/api/teams';
import {
  createTestIncident,
  getTestCaseIncidentByStateId,
  patchTestIncident,
  severityPatch,
} from '@/api/testIncidents';
import { getUserByName } from '@/api/users';
import { toEntityLink } from '@/quality/entityLink';
import type { EntityRef } from '@/types/api';
import type { ResolveTaskRequest } from '@/types/collaboration';
import type { IncidentStatus, TestIncident } from '@/types/quality';

/**
 * Incident-manager classic list (G-14, W2-2): the pure logic behind
 * IncidentsListView — status-menu options, resolve-request builders,
 * the reopen path, the severity patch, the assignee aggregate and the
 * FQN helpers. Everything here is a verbatim port of the official
 * pin (a3012259ca) pieces named in the comments; the view owns
 * toasts, routing and permission state.
 *
 * ADR:2026-11-08-incident-task-flow-reuses-resolve-task
 * ADR:2026-11-08-incident-severity-inline-patch
 * ADR:2026-11-08-incident-assignee-aggregate-candidates
 */

/** Official INCIDENT_TRANSITION_ID (rest/incidentManagerAPI.ts). */
export const INCIDENT_TRANSITION_ID = {
  New: 'new',
  Ack: 'ack',
  Assign: 'assign',
  Reassign: 'reassign',
  Resolve: 'resolve',
} as const;

/**
 * Official INCIDENT_STATUS_MENU_OPTIONS (constants/TestSuite.constant.ts):
 * the statuses a row's inline menu offers from each current status.
 * New/Ack offer all four; Assigned offers only Assigned/Resolved; a
 * Resolved row offers all four because picking one reopens it.
 * NEVER the TEST_CASE_STATUS workflow edge table: its Resolved entry
 * is empty, which would leave a resolved row with no options.
 */
export const INCIDENT_STATUS_MENU_OPTIONS: Record<string, IncidentStatus[]> = {
  New: ['New', 'Ack', 'Assigned', 'Resolved'],
  Ack: ['New', 'Ack', 'Assigned', 'Resolved'],
  Assigned: ['Assigned', 'Resolved'],
  Resolved: ['New', 'Ack', 'Assigned', 'Resolved'],
};

export function incidentStatusMenuOptions(currentStatus?: string): IncidentStatus[] {
  return INCIDENT_STATUS_MENU_OPTIONS[currentStatus ?? ''] ?? ['New', 'Ack', 'Assigned', 'Resolved'];
}

/** Official StatusChangeAdditionalData (InlineTestCaseIncidentStatus). */
export interface StatusChangeAdditionalData {
  assignee?: EntityRef;
  reason?: string;
  comment?: string;
}

/**
 * Official buildAssignedResolveRequest: the current status decides the
 * transition — reassign when already Assigned, assign otherwise — and
 * the payload carries exactly one EntityReference.
 */
export function buildAssignedResolveRequest(
  currentStatus: string | undefined,
  additionalData?: StatusChangeAdditionalData,
): ResolveTaskRequest {
  const transitionId =
    currentStatus === 'Assigned' ? INCIDENT_TRANSITION_ID.Reassign : INCIDENT_TRANSITION_ID.Assign;
  const assignee = additionalData?.assignee;
  return {
    transitionId,
    payload: assignee
      ? {
          assignees: [
            {
              id: assignee.id,
              type: assignee.type ?? 'user',
              name: assignee.name,
              fullyQualifiedName: assignee.fullyQualifiedName ?? assignee.name,
              displayName: assignee.displayName,
            },
          ],
        }
      : undefined,
  };
}

/**
 * Official buildResolveRequest: one resolve body per target status.
 * Resolved carries resolutionType Completed, the comment at top level
 * and the failure reason in the payload — never a POST of a new
 * incident record.
 */
export function buildResolveRequest(
  status: string,
  currentStatus: string | undefined,
  additionalData?: StatusChangeAdditionalData,
): ResolveTaskRequest | undefined {
  const requestByStatus: Record<string, ResolveTaskRequest> = {
    New: { transitionId: INCIDENT_TRANSITION_ID.New },
    Ack: { transitionId: INCIDENT_TRANSITION_ID.Ack },
    Assigned: buildAssignedResolveRequest(currentStatus, additionalData),
    Resolved: {
      transitionId: INCIDENT_TRANSITION_ID.Resolve,
      resolutionType: 'Completed',
      comment: additionalData?.comment,
      payload: additionalData?.reason
        ? { testCaseFailureReason: additionalData.reason }
        : undefined,
    },
  };
  return requestByStatus[status];
}

/**
 * Official submitIncidentSeverity (IncidentManager.utils.ts): PATCH the
 * incident's severity and report whether the change went through, so
 * the caller only replaces the row on success. The caller shows the
 * error toast (views own toasts in this codebase); this helper never
 * swallows the failure into a silent row update.
 */
export async function submitIncidentSeverity(
  incident: TestIncident,
  severity?: string,
): Promise<boolean> {
  try {
    const ops = severityPatch(incident.severity, severity);
    if (ops.length === 0) {
      return true;
    }
    await patchTestIncident(incident.id, ops);
    return true;
  } catch {
    return false;
  }
}

/** Read-back after a row write: the server's record for a stateId. */
export async function getLatestIncident(stateId?: string): Promise<TestIncident | undefined> {
  if (!stateId) {
    return undefined;
  }
  return getTestCaseIncidentByStateId(stateId, 1);
}

export interface ReopenIncidentParams {
  testCaseFqn: string;
  testCaseName: string;
  targetStatus: string;
  currentStateId?: string;
  details?: StatusChangeAdditionalData;
}

/**
 * Official reopenResolvedIncident (utils/DataQuality/
 * IncidentManagerUtils.ts): a resolved incident has no open task to
 * transition, so reopening starts a fresh record. New starts a fresh
 * task (createTask, type TestCaseResolution); Ack/Assigned/Resolved
 * post a new incident status (the backend reuses the stateId and
 * restarts its task). This is the ONLY remaining caller of the POST
 * new-record path — open-incident status changes never use it.
 */
export async function reopenResolvedIncident({
  testCaseFqn,
  testCaseName,
  targetStatus,
  currentStateId,
  details,
}: ReopenIncidentParams): Promise<TestIncident | undefined> {
  if (targetStatus === 'New') {
    const newTask = await createTask({
      name: `Incident: ${testCaseName}`,
      category: 'Incident',
      type: 'TestCaseResolution',
      about: toEntityLink('testCase', testCaseFqn),
    });
    return getLatestIncident(newTask.id);
  }

  const reopened = await createTestIncident({
    testCaseReference: testCaseFqn,
    testCaseResolutionStatusType: targetStatus,
    testCaseResolutionStatusDetails: getReopenStatusDetails(targetStatus, details),
  });
  return getLatestIncident(reopened?.stateId ?? currentStateId);
}

function getReopenStatusDetails(
  targetStatus: string,
  details?: ReopenIncidentParams['details'],
): { assignee?: EntityRef; testCaseFailureReason?: string; testCaseFailureComment?: string } | undefined {
  if (targetStatus === 'Assigned' && details?.assignee) {
    const { assignee } = details;
    return {
      assignee: {
        id: assignee.id,
        type: assignee.type ?? 'user',
        name: assignee.name,
        fullyQualifiedName: assignee.fullyQualifiedName ?? assignee.name,
        displayName: assignee.displayName,
      },
    };
  }
  if (targetStatus === 'Resolved') {
    return {
      testCaseFailureReason: details?.reason,
      testCaseFailureComment: details?.comment,
    };
  }
  return undefined;
}

/**
 * Submit an inline status change for an OPEN incident: resolve the
 * task, then read the row back and return the server's record. A
 * Resolved row never reaches this function — it goes through
 * reopenResolvedIncident instead. Returns undefined when there is no
 * task to transition or the read-back finds no row.
 */
export async function submitIncidentStatusChange(
  record: TestIncident,
  targetStatus: string,
  additionalData?: StatusChangeAdditionalData,
): Promise<TestIncident | undefined> {
  const taskId = record.stateId;
  if (!taskId) {
    return undefined;
  }
  const resolveRequest = buildResolveRequest(
    targetStatus,
    record.testCaseResolutionStatusType,
    additionalData,
  );
  if (!resolveRequest) {
    return undefined;
  }
  await resolveTask(taskId, resolveRequest);
  return getLatestIncident(taskId);
}

/**
 * Official getSeverityLabel (Severity.utils.ts): the translated word
 * with its level, e.g. "Severity 2". The word comes from the caller
 * (i18n); this helper extracts the level digits.
 */
export function severityLevel(severity?: string): string | undefined {
  const level = (severity ?? '').replace(/\D/g, '');
  return level === '' ? undefined : level;
}

/**
 * Split an FQN on dots, keeping double-quoted segments whole —
 * the same rule official's Fqn.split applies, so a table named
 * `"a.b"` does not split into two parts. The product has no shared
 * quote-aware FQN splitter; this local one serves the table-column
 * derivation only.
 */
export function splitFqn(fqn: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of fqn) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === '.' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.filter((part) => part.length > 0);
}

/**
 * Official IncidentManagerTable: the table column shows the table part
 * of the test-case FQN (service.database.schema.table). Returns
 * undefined when the FQN has fewer than four parts, so the caller
 * falls back to the full test-case FQN as display text.
 */
export function tableFqnFromTestCaseFqn(testCaseFqn?: string): string | undefined {
  if (!testCaseFqn) {
    return undefined;
  }
  const parts = splitFqn(testCaseFqn);
  if (parts.length < 4) {
    return undefined;
  }
  return parts.slice(0, 4).join('.');
}

/** Last segment of an FQN (the table name for a table FQN). */
export function entityNameFromFqn(fqn?: string): string | undefined {
  if (!fqn) {
    return undefined;
  }
  const parts = splitFqn(fqn);
  return parts[parts.length - 1];
}

/**
 * Official getQueryFilterForDataProducts (utils/DomainFilterUtils.ts),
 * verbatim: incidents whose domains term/prefix-match the active
 * domain. The caller JSON-stringifies the result into the aggregate
 * request's `query` (the server takes it as a string).
 */
export function buildDomainQueryFilter(domainFqn: string | undefined): Record<string, unknown> {
  if (!domainFqn) {
    return { query: { match_none: {} } };
  }
  return {
    query: {
      bool: {
        must: [
          {
            bool: {
              should: [
                { term: { 'domains.fullyQualifiedName': domainFqn } },
                { prefix: { 'domains.fullyQualifiedName': `${domainFqn}.` } },
              ],
            },
          },
        ],
      },
    },
  };
}

const ASSIGNEE_FIELD = 'testCaseResolutionStatusDetails.assignee';
const ASSIGNEE_AGGREGATION = `${ASSIGNEE_FIELD}.id`;

function assigneeFromBucket(bucket: unknown): EntityRef | undefined {
  const rec = asRecord(bucket);
  const topHits = asRecord(rec?.['top_hits#top']);
  const hits = asRecord(topHits?.hits);
  const list = Array.isArray(hits?.hits) ? hits.hits : [];
  const source = asRecord(asRecord(list[0])?._source);
  const details = asRecord(source?.testCaseResolutionStatusDetails);
  const assignee = asRecord(details?.assignee);
  if (!assignee || assignee.deleted === true) {
    return undefined;
  }
  return mapEntityRefs([assignee])[0];
}

/**
 * Official fetchIncidentAssignees (useIncidentFilterOptions.ts): the
 * users and teams assigned to at least one incident in the active
 * domain, read as a terms aggregation over the incident index so they
 * never depend on the page of incidents on screen. A terms
 * aggregation cannot page, so the whole set is read up to
 * AGGREGATE_PAGE_SIZE_LARGE. Incident documents carry no top-level
 * `deleted`, so `deleted: null` — the default `deleted: false` term
 * would match none of them.
 */
export async function fetchIncidentAssignees(domainFqn?: string): Promise<EntityRef[]> {
  const response: AggregateResponse = await postAggregateFieldOptions({
    index: 'testCaseResolutionStatus',
    fieldName: ASSIGNEE_AGGREGATION,
    fieldValue: '',
    size: AGGREGATE_PAGE_SIZE_LARGE,
    deleted: null,
    query: domainFqn ? JSON.stringify(buildDomainQueryFilter(domainFqn)) : undefined,
    sourceFields: [ASSIGNEE_FIELD],
    topHits: { size: 1, sortField: 'timestamp', sortOrder: 'desc' },
  });
  const buckets = response.aggregations?.[ASSIGNEE_AGGREGATION]?.buckets ?? [];
  const assignees = buckets.flatMap((bucket) => {
    const assignee = assigneeFromBucket(bucket);
    return assignee ? [assignee] : [];
  });
  return assignees.sort((a, b) =>
    (a.displayName ?? a.name).toLowerCase().localeCompare((b.displayName ?? b.name).toLowerCase()),
  );
}

/**
 * The assignee filter's candidate set: the aggregate results (full,
 * page-independent) ∪ the current page rows' assignees, deduplicated
 * by type:name. The aggregate list stays sorted; page-only assignees
 * append in row order.
 */
export function mergeAssigneeCandidates(aggregated: EntityRef[], pageRows: TestIncident[]): EntityRef[] {
  const seen = new Set(aggregated.map((ref) => `${ref.type ?? ''}:${ref.name}`));
  const merged = [...aggregated];
  for (const row of pageRows) {
    const assignee = row.testCaseResolutionStatusDetails?.assignee;
    if (!assignee?.name) {
      continue;
    }
    const key = `${assignee.type ?? ''}:${assignee.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(assignee);
  }
  return merged;
}

/**
 * Official selected-assignee resolution (IncidentManager.component.tsx):
 * try the user endpoint, then the team endpoint; both failing degrades
 * to a bare {id: name, type: 'user'} ref so the filter still shows the
 * selected value instead of an empty picker.
 */
export async function resolveAssigneeRef(name: string): Promise<EntityRef> {
  try {
    const user = await getUserByName(name);
    return {
      id: user.id,
      type: 'user',
      name: user.name,
      displayName: user.displayName,
      fullyQualifiedName: user.name,
    };
  } catch {
    try {
      const team = await getTeamByName(name);
      return {
        id: team.id,
        type: 'team',
        name: team.name,
        displayName: team.displayName,
        fullyQualifiedName: team.name,
      };
    } catch {
      return { id: name, name, type: 'user' };
    }
  }
}

/** Assignee display name, mirroring official getEntityName. */
export function assigneeDisplayName(ref?: EntityRef): string {
  return asString(ref?.displayName) || asString(ref?.name) || '';
}
