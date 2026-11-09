/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssignedResolveRequest,
  buildDomainQueryFilter,
  buildResolveRequest,
  entityNameFromFqn,
  fetchIncidentAssignees,
  INCIDENT_TRANSITION_ID,
  incidentStatusMenuOptions,
  mergeAssigneeCandidates,
  reopenResolvedIncident,
  resolveAssigneeRef,
  severityLevel,
  submitIncidentSeverity,
  submitIncidentStatusChange,
  tableFqnFromTestCaseFqn,
} from './incidentManager';

const resolveTask = vi.fn();
const createTask = vi.fn();
const createTestIncident = vi.fn();
const getTestCaseIncidentByStateId = vi.fn();
const patchTestIncident = vi.fn();
const severityPatch = vi.fn();
const postAggregateFieldOptions = vi.fn();
const getUserByName = vi.fn();
const getTeamByName = vi.fn();

vi.mock('@/api/tasks', () => ({
  resolveTask: (...args: unknown[]) => resolveTask(...args),
  createTask: (...args: unknown[]) => createTask(...args),
}));
vi.mock('@/api/testIncidents', () => ({
  createTestIncident: (...args: unknown[]) => createTestIncident(...args),
  getTestCaseIncidentByStateId: (...args: unknown[]) => getTestCaseIncidentByStateId(...args),
  patchTestIncident: (...args: unknown[]) => patchTestIncident(...args),
  severityPatch: (...args: unknown[]) => severityPatch(...args),
}));
vi.mock('@/api/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/search')>();
  return { ...actual, postAggregateFieldOptions: (...args: unknown[]) => postAggregateFieldOptions(...args) };
});
vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>();
  return { ...actual, getUserByName: (...args: unknown[]) => getUserByName(...args) };
});
vi.mock('@/api/teams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/teams')>();
  return { ...actual, getTeamByName: (...args: unknown[]) => getTeamByName(...args) };
});

const incident = {
  id: 'inc1',
  stateId: 'task-1',
  testCaseResolutionStatusType: 'New' as const,
  testCaseReference: { id: 'tc-1', name: 'row_count', fullyQualifiedName: 'svc.db.schema.orders.row_count' },
};

const assignee = { id: 'alice', name: 'alice', type: 'user', displayName: 'Alice' };

describe('incidentStatusMenuOptions', () => {
  it('offers all four from New and Ack, only Assigned/Resolved from Assigned, all four from Resolved', () => {
    expect(incidentStatusMenuOptions('New')).toEqual(['New', 'Ack', 'Assigned', 'Resolved']);
    expect(incidentStatusMenuOptions('Ack')).toEqual(['New', 'Ack', 'Assigned', 'Resolved']);
    expect(incidentStatusMenuOptions('Assigned')).toEqual(['Assigned', 'Resolved']);
    expect(incidentStatusMenuOptions('Resolved')).toEqual(['New', 'Ack', 'Assigned', 'Resolved']);
    expect(incidentStatusMenuOptions(undefined)).toEqual(['New', 'Ack', 'Assigned', 'Resolved']);
  });

  it('maps each status to its official transition id', () => {
    expect(INCIDENT_TRANSITION_ID).toEqual({
      New: 'new',
      Ack: 'ack',
      Assign: 'assign',
      Reassign: 'reassign',
      Resolve: 'resolve',
    });
  });
});

describe('buildResolveRequest / buildAssignedResolveRequest', () => {
  it('builds the open-status transitions', () => {
    expect(buildResolveRequest('New', 'New')).toEqual({ transitionId: 'new' });
    expect(buildResolveRequest('Ack', 'New')).toEqual({ transitionId: 'ack' });
    expect(buildResolveRequest('Resolved', 'New', { reason: 'FalsePositive', comment: 'Expected' })).toEqual({
      transitionId: 'resolve',
      resolutionType: 'Completed',
      comment: 'Expected',
      payload: { testCaseFailureReason: 'FalsePositive' },
    });
  });

  it('builds assign vs reassign from the current status, with a single-entity payload', () => {
    expect(buildAssignedResolveRequest('New', { assignee })).toEqual({
      transitionId: 'assign',
      payload: {
        assignees: [
          { id: 'alice', type: 'user', name: 'alice', fullyQualifiedName: 'alice', displayName: 'Alice' },
        ],
      },
    });
    expect(buildAssignedResolveRequest('Assigned', { assignee })).toEqual({
      transitionId: 'reassign',
      payload: {
        assignees: [
          { id: 'alice', type: 'user', name: 'alice', fullyQualifiedName: 'alice', displayName: 'Alice' },
        ],
      },
    });
    expect(buildAssignedResolveRequest('Ack', undefined)).toEqual({ transitionId: 'assign', payload: undefined });
  });
});

describe('submitIncidentStatusChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the task then reads the incident back by stateId', async () => {
    resolveTask.mockResolvedValue(undefined);
    getTestCaseIncidentByStateId.mockResolvedValue({ ...incident, testCaseResolutionStatusType: 'Ack' });
    const latest = await submitIncidentStatusChange(incident, 'Ack');
    expect(resolveTask).toHaveBeenCalledWith('task-1', { transitionId: 'ack' });
    expect(getTestCaseIncidentByStateId).toHaveBeenCalledWith('task-1', 1);
    expect(latest?.testCaseResolutionStatusType).toBe('Ack');
  });

  it('returns undefined without calling resolve when the row has no task', async () => {
    const latest = await submitIncidentStatusChange({ ...incident, stateId: undefined }, 'Ack');
    expect(resolveTask).not.toHaveBeenCalled();
    expect(latest).toBeUndefined();
  });

  it('throws when the resolve fails', async () => {
    resolveTask.mockRejectedValue(new Error('task closed'));
    await expect(submitIncidentStatusChange(incident, 'Ack')).rejects.toThrow('task closed');
  });
});

describe('reopenResolvedIncident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a task for target New and reads back by the new task id', async () => {
    createTask.mockResolvedValue({ id: 'task-9' });
    getTestCaseIncidentByStateId.mockResolvedValue({ ...incident, stateId: 'task-9' });
    const latest = await reopenResolvedIncident({
      testCaseFqn: 'svc.db.schema.orders.row_count',
      testCaseName: 'row_count',
      targetStatus: 'New',
      currentStateId: 'task-1',
    });
    expect(createTask).toHaveBeenCalledWith({
      name: 'Incident: row_count',
      category: 'Incident',
      type: 'TestCaseResolution',
      about: '<#E::testCase::svc.db.schema.orders.row_count>',
    });
    expect(getTestCaseIncidentByStateId).toHaveBeenCalledWith('task-9', 1);
    expect(latest?.stateId).toBe('task-9');
  });

  it('posts a reopen record for target Assigned with the assignee details', async () => {
    createTestIncident.mockResolvedValue({ ...incident, stateId: 'task-1', testCaseResolutionStatusType: 'Assigned' });
    getTestCaseIncidentByStateId.mockResolvedValue({ ...incident, stateId: 'task-1', testCaseResolutionStatusType: 'Assigned' });
    await reopenResolvedIncident({
      testCaseFqn: 'svc.db.schema.orders.row_count',
      testCaseName: 'row_count',
      targetStatus: 'Assigned',
      currentStateId: 'task-1',
      details: { assignee },
    });
    expect(createTestIncident).toHaveBeenCalledWith({
      testCaseReference: 'svc.db.schema.orders.row_count',
      testCaseResolutionStatusType: 'Assigned',
      testCaseResolutionStatusDetails: {
        assignee: { id: 'alice', type: 'user', name: 'alice', fullyQualifiedName: 'alice', displayName: 'Alice' },
      },
    });
    expect(getTestCaseIncidentByStateId).toHaveBeenCalledWith('task-1', 1);
  });

  it('posts reopen details with reason and comment for target Resolved', async () => {
    createTestIncident.mockResolvedValue({ ...incident, stateId: 'task-1' });
    getTestCaseIncidentByStateId.mockResolvedValue({ ...incident, stateId: 'task-1' });
    await reopenResolvedIncident({
      testCaseFqn: 'svc.db.schema.orders.row_count',
      testCaseName: 'row_count',
      targetStatus: 'Resolved',
      currentStateId: 'task-1',
      details: { reason: 'OutOfBounds', comment: 'Still failing' },
    });
    expect(createTestIncident).toHaveBeenCalledWith({
      testCaseReference: 'svc.db.schema.orders.row_count',
      testCaseResolutionStatusType: 'Resolved',
      testCaseResolutionStatusDetails: {
        testCaseFailureReason: 'OutOfBounds',
        testCaseFailureComment: 'Still failing',
      },
    });
  });
});

describe('submitIncidentSeverity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('patches on change and returns true', async () => {
    severityPatch.mockReturnValue([{ op: 'replace', path: '/severity', value: 'Severity3' }]);
    patchTestIncident.mockResolvedValue({ ...incident, severity: 'Severity3' });
    expect(await submitIncidentSeverity({ ...incident, severity: 'Severity2' }, 'Severity3')).toBe(true);
    expect(patchTestIncident).toHaveBeenCalledWith('inc1', [
      { op: 'replace', path: '/severity', value: 'Severity3' },
    ]);
  });

  it('skips the request when nothing changed and returns true', async () => {
    severityPatch.mockReturnValue([]);
    expect(await submitIncidentSeverity({ ...incident, severity: 'Severity2' }, 'Severity2')).toBe(true);
    expect(patchTestIncident).not.toHaveBeenCalled();
  });

  it('returns false when the patch fails', async () => {
    severityPatch.mockReturnValue([{ op: 'replace', path: '/severity', value: 'Severity3' }]);
    patchTestIncident.mockRejectedValue(new Error('patch failed'));
    expect(await submitIncidentSeverity({ ...incident, severity: 'Severity2' }, 'Severity3')).toBe(false);
  });
});

describe('FQN helpers', () => {
  it('derives the table FQN from the first four segments, quote-aware', () => {
    expect(tableFqnFromTestCaseFqn('svc.db.schema.orders.row_count')).toBe('svc.db.schema.orders');
    expect(tableFqnFromTestCaseFqn('svc.db."my.schema".orders.row_count')).toBe('svc.db."my.schema".orders');
    expect(tableFqnFromTestCaseFqn('a.b')).toBeUndefined();
    expect(tableFqnFromTestCaseFqn(undefined)).toBeUndefined();
  });

  it('takes the entity name from the last segment', () => {
    expect(entityNameFromFqn('svc.db.schema.orders.row_count')).toBe('row_count');
    expect(entityNameFromFqn('svc.db."my.schema".orders')).toBe('orders');
    expect(entityNameFromFqn(undefined)).toBeUndefined();
  });

  it('extracts the severity level digit', () => {
    expect(severityLevel('Severity3')).toBe('3');
    expect(severityLevel('Critical')).toBeUndefined();
    expect(severityLevel(undefined)).toBeUndefined();
  });
});

describe('buildDomainQueryFilter', () => {
  it('scopes to the domain FQN by term and prefix', () => {
    expect(buildDomainQueryFilter('finance')).toEqual({
      query: {
        bool: {
          must: [
            {
              bool: {
                should: [
                  { term: { 'domains.fullyQualifiedName': 'finance' } },
                  { prefix: { 'domains.fullyQualifiedName': 'finance.' } },
                ],
              },
            },
          ],
        },
      },
    });
  });

  it('matches nothing without a domain', () => {
    expect(buildDomainQueryFilter(undefined)).toEqual({ query: { match_none: {} } });
  });
});

describe('fetchIncidentAssignees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function aggregateResponse() {
    return {
      aggregations: {
        'testCaseResolutionStatusDetails.assignee.id': {
          buckets: [
            {
              key: 'bob',
              'top_hits#top': {
                hits: {
                  hits: [
                    {
                      _source: {
                        testCaseResolutionStatusDetails: {
                          assignee: { id: 'bob', name: 'bob', type: 'user', displayName: 'Bob' },
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              key: 'alice',
              'top_hits#top': {
                hits: {
                  hits: [
                    {
                      _source: {
                        testCaseResolutionStatusDetails: {
                          assignee: { id: 'alice', name: 'alice', type: 'user', displayName: 'Alice' },
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              key: 'gone',
              'top_hits#top': {
                hits: {
                  hits: [
                    {
                      _source: {
                        testCaseResolutionStatusDetails: {
                          assignee: { id: 'gone', name: 'gone', type: 'user', deleted: true },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
  }

  it('posts the official aggregate shape with deleted: null and sorts by display name', async () => {
    postAggregateFieldOptions.mockResolvedValue(aggregateResponse());
    const assignees = await fetchIncidentAssignees();
    expect(postAggregateFieldOptions).toHaveBeenCalledWith({
      index: 'testCaseResolutionStatus',
      fieldName: 'testCaseResolutionStatusDetails.assignee.id',
      fieldValue: '',
      size: 1000,
      deleted: null,
      query: undefined,
      sourceFields: ['testCaseResolutionStatusDetails.assignee'],
      topHits: { size: 1, sortField: 'timestamp', sortOrder: 'desc' },
    });
    // Deleted assignees are skipped; the rest sort by display name.
    expect(assignees.map((ref) => ref.name)).toEqual(['alice', 'bob']);
  });

  it('domain-filters the aggregate query for a non-default domain', async () => {
    postAggregateFieldOptions.mockResolvedValue({ aggregations: {} });
    await fetchIncidentAssignees('finance');
    const body = postAggregateFieldOptions.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.parse(String(body.query))).toEqual(buildDomainQueryFilter('finance'));
  });
});

describe('mergeAssigneeCandidates', () => {
  it('unions aggregate and page rows, deduplicated by type:name', () => {
    const pageRow = {
      ...incident,
      id: 'inc2',
      testCaseResolutionStatusDetails: { assignee: { id: 'carol', name: 'carol', type: 'user' } },
    };
    const merged = mergeAssigneeCandidates([assignee], [incident, pageRow]);
    expect(merged.map((ref) => ref.name)).toEqual(['alice', 'carol']);
  });

  it('keeps the aggregate entry when a page row repeats it', () => {
    const pageRow = { ...incident, testCaseResolutionStatusDetails: { assignee } };
    expect(mergeAssigneeCandidates([assignee], [pageRow])).toEqual([assignee]);
  });
});

describe('resolveAssigneeRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the user endpoint', async () => {
    getUserByName.mockResolvedValue(assignee);
    expect(await resolveAssigneeRef('alice')).toEqual({ ...assignee, fullyQualifiedName: 'alice' });
    expect(getTeamByName).not.toHaveBeenCalled();
  });

  it('falls back to the team endpoint when the user lookup fails', async () => {
    getUserByName.mockRejectedValue(new Error('no such user'));
    const team = { id: 't1', name: 'data-team', type: 'team', displayName: 'Data Team' };
    getTeamByName.mockResolvedValue(team);
    expect(await resolveAssigneeRef('data-team')).toEqual({ ...team, fullyQualifiedName: 'data-team' });
  });

  it('degrades to a user-shaped reference when both lookups fail', async () => {
    getUserByName.mockRejectedValue(new Error('no such user'));
    getTeamByName.mockRejectedValue(new Error('no such team'));
    expect(await resolveAssigneeRef('ghost')).toEqual({ id: 'ghost', name: 'ghost', type: 'user' });
  });
});
