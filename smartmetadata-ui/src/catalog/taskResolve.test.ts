/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { CollaborationTask } from '@/types/collaboration';
import {
  buildResolveBody,
  getTaskResolveActions,
  isOntologyReviewTask,
  isRevisionRequest,
  isTaskOpen,
  LEGACY_APPROVE_ACTION_ID,
  needsTaskActionInput,
} from './taskResolve';

const LABELS = { approve: 'Approve', reject: 'Reject' };

function task(overrides: Partial<CollaborationTask> & { id: string }): CollaborationTask {
  return { assignees: [], comments: [], status: 'Open', ...overrides };
}

describe('taskResolve', () => {
  it('offers legacy approve/reject for an open task without transitions', () => {
    const actions = getTaskResolveActions(task({ id: 'a', type: 'RequestApproval' }), LABELS);
    expect(actions.map((action) => action.kind)).toEqual(['approve', 'reject']);
    expect(actions[0].id).toBe(LEGACY_APPROVE_ACTION_ID);
  });

  it('gives a DataAccessRequest approve no newValue sentinel, only the echoed payload', () => {
    const dar = task({
      id: 'd',
      type: 'DataAccessRequest',
      rawPayload: { resource: 'orders' },
    });
    const [approve] = getTaskResolveActions(dar, LABELS);
    const body = buildResolveBody(approve, dar);
    expect(body.resolutionType).toBe('Approved');
    expect(body.newValue).toBeUndefined();
    expect(body.payload).toEqual({ resource: 'orders' });
  });

  it('gives an approval-handler approve the approved sentinel', () => {
    const approval = task({ id: 'a', type: 'RequestApproval' });
    const [approve] = getTaskResolveActions(approval, LABELS);
    expect(buildResolveBody(approve, approval).newValue).toBe('approved');
  });

  it('offers no legacy actions for incidents or closed tasks', () => {
    expect(
      getTaskResolveActions(task({ id: 'i', category: 'Incident' }), LABELS),
    ).toEqual([]);
    expect(
      getTaskResolveActions(task({ id: 'c', status: 'Closed' }), LABELS),
    ).toEqual([]);
  });

  it('resolves through the workflow transition when one exists', () => {
    const workflow = task({
      id: 'w',
      availableTransitions: [
        {
          id: 'approve',
          label: 'Approve',
          targetStageId: 'approved',
          targetTaskStatus: 'Closed',
          resolutionType: 'Approved',
        },
      ],
    });
    const [action] = getTaskResolveActions(workflow, LABELS);
    expect(action.kind).toBe('approve');
    expect(action.transition?.id).toBe('approve');
    const body = buildResolveBody(action, workflow);
    expect(body.transitionId).toBe('approve');
    expect(body.resolutionType).toBe('Approved');
  });

  it('flags an action needing a comment as needing input', () => {
    const workflow = task({
      id: 'w',
      availableTransitions: [
        {
          id: 'reject',
          label: 'Reject',
          requiresComment: true,
          targetStageId: 'rejected',
          targetTaskStatus: 'Closed',
          resolutionType: 'Rejected',
        },
      ],
    });
    const [action] = getTaskResolveActions(workflow, LABELS);
    expect(needsTaskActionInput(workflow, action)).toBe(true);
  });

  it('classifies open, ontology-review and revision tasks', () => {
    expect(isTaskOpen(task({ id: 'o', status: 'InProgress' }))).toBe(true);
    expect(isTaskOpen(task({ id: 'c', status: 'Closed' }))).toBe(false);
    expect(
      isOntologyReviewTask(
        task({ id: 'r', type: 'RequestApproval', about: { id: 'x', type: 'ontologyRelease', name: 'x' } }),
      ),
    ).toBe(true);
    expect(
      isRevisionRequest(
        task({
          id: 'v',
          type: 'MetadataCompletion',
          rawPayload: { revision: true },
        }),
      ),
    ).toBe(true);
  });

  it('treats ManualRevoke as open and offers it legacy actions', () => {
    const manualRevoke = task({ id: 'm', status: 'ManualRevoke', type: 'RequestApproval' });
    expect(isTaskOpen(manualRevoke)).toBe(true);
    expect(getTaskResolveActions(manualRevoke, LABELS).map((action) => action.kind)).toEqual([
      'approve',
      'reject',
    ]);
  });

  it('carries the normalized description fields on a DescriptionUpdate approve', () => {
    const description = task({
      id: 'd',
      type: 'DescriptionUpdate',
      rawPayload: {
        fieldPath: 'description',
        currentDescription: 'old text',
        newDescription: 'new text',
        stale: 'kept',
      },
      suggestionPayload: { currentDescription: 'old text', newDescription: 'new text' },
    });
    const [approve] = getTaskResolveActions(description, LABELS);
    expect(buildResolveBody(approve, description).payload).toEqual({
      fieldPath: 'description',
      currentDescription: 'old text',
      newDescription: 'new text',
      stale: 'kept',
    });
  });

  it('fills missing description fields from the normalized suggestion', () => {
    const description = task({
      id: 'd',
      type: 'DescriptionUpdate',
      rawPayload: { fieldPath: 'description' },
      suggestionPayload: { currentDescription: 'old text', newDescription: 'new text' },
    });
    const [approve] = getTaskResolveActions(description, LABELS);
    expect(buildResolveBody(approve, description).payload).toEqual({
      fieldPath: 'description',
      currentDescription: 'old text',
      newDescription: 'new text',
    });
  });

  it('carries the tag fields on a TagUpdate approve', () => {
    const tags = task({
      id: 't',
      type: 'TagUpdate',
      rawPayload: {
        fieldPath: 'tags',
        currentTags: ['a', 'b'],
        tagsToAdd: ['c'],
        tagsToRemove: ['a'],
      },
      suggestionPayload: { currentTags: ['a', 'b'], tagsToAdd: ['c'], tagsToRemove: ['a'] },
    });
    const [approve] = getTaskResolveActions(tags, LABELS);
    expect(buildResolveBody(approve, tags).payload).toEqual({
      fieldPath: 'tags',
      currentTags: ['a', 'b'],
      tagsToAdd: ['c'],
      tagsToRemove: ['a'],
    });
  });

  it('derives tag add/remove from the normalized suggestion when the raw payload lacks them', () => {
    const tags = task({
      id: 't',
      type: 'TagUpdate',
      rawPayload: { fieldPath: 'tags' },
      suggestionPayload: { currentTags: ['a', 'b'], tagsToAdd: ['c'] },
    });
    const [approve] = getTaskResolveActions(tags, LABELS);
    expect(buildResolveBody(approve, tags).payload).toEqual({
      fieldPath: 'tags',
      currentTags: ['a', 'b'],
      tagsToAdd: ['c'],
      tagsToRemove: [],
    });
  });
});
