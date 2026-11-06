/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowFlowNode } from '@/types/governance';
import UserApprovalForm from './UserApprovalForm.vue';
import { mountWithBuilder } from '../testHarness';

/**
 * Official-shaped fixture (UserApprovalForm.tsx:88-111, userApprovalTask.json:41):
 * the approver settings live under config.assignees, never flat on config.
 * The second candidate carries no type, so the save must default it to 'user'.
 */
const APPROVAL_NODE: WorkflowFlowNode = {
  id: 'userApprovalTask_1',
  type: 'userTask',
  position: { x: 0, y: 0 },
  data: {
    name: 'userApprovalTask_1',
    label: 'Approve',
    displayName: 'Approve Glossary Term',
    description: 'Approve the term',
    subType: 'userApprovalTask',
    config: {
      approvalThreshold: 2,
      rejectionThreshold: 1,
      assignees: {
        addReviewers: true,
        addOwners: true,
        emptyAssigneeStrategy: 'assignAdmins',
        candidates: [
          { id: 'u1', type: 'user', fullyQualifiedName: 'alice', name: 'alice' },
          { id: 't1', fullyQualifiedName: 'data-team', name: 'data-team' },
        ],
      },
    },
  },
};

function approvalNode(config: Record<string, unknown>): WorkflowFlowNode {
  return {
    ...APPROVAL_NODE,
    data: {
      ...APPROVAL_NODE.data,
      config,
    },
  };
}

async function mountForm(node: WorkflowFlowNode) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const Host = defineComponent({
    setup: () =>
      () =>
        h(UserApprovalForm, {
          node,
          isEnforceMode: false,
          onSave,
          onClose,
        }),
  });
  const mounted = await mountWithBuilder(Host, {
    path: '/workflows/approve-glossary-term/workflow?mode=edit',
  });
  return { ...mounted, onSave, onClose };
}

function savedConfigOf(onSave: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = onSave.mock.calls[0];
  expect(call).toBeDefined();
  const saved = call[1] as Record<string, unknown>;
  return saved.config as Record<string, unknown>;
}

async function saveAndReadConfig(
  node: WorkflowFlowNode,
): Promise<Record<string, unknown>> {
  const mounted = await mountForm(node);
  await mounted.wrapper
    .find('[data-testid="save-node-configuration-button"]')
    .trigger('click');
  expect(mounted.onSave).toHaveBeenCalledTimes(1);
  return savedConfigOf(mounted.onSave);
}

describe('UserApprovalForm assignees shape', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('loads nested assignees and saves them back unchanged', { timeout: 15000 }, async () => {
    const mounted = await mountForm(APPROVAL_NODE);
    // Load: both approver checkboxes reflect the stored nested assignees.
    const checkboxes = mounted.wrapper.findAll('.ant-checkbox-input');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true);

    await mounted.wrapper
      .find('[data-testid="save-node-configuration-button"]')
      .trigger('click');
    expect(mounted.onSave).toHaveBeenCalledTimes(1);
    const config = savedConfigOf(mounted.onSave);

    // Save: nested under config.assignees, candidates preserved, and no flat
    // keys left at the top level.
    expect(config.assignees).toEqual({
      addReviewers: true,
      addOwners: true,
      emptyAssigneeStrategy: 'assignAdmins',
      candidates: [
        { id: 'u1', type: 'user', fullyQualifiedName: 'alice', name: 'alice' },
        { id: 't1', type: 'user', fullyQualifiedName: 'data-team', name: 'data-team' },
      ],
    });
    expect(config.addReviewers).toBeUndefined();
    expect(config.addOwners).toBeUndefined();
    expect(config.emptyAssigneeStrategy).toBeUndefined();
    expect(config.candidates).toBeUndefined();
    expect(config.approvalThreshold).toBe(2);
    expect(config.rejectionThreshold).toBe(1);
  });

  it('strips stale flat assignee keys on save', { timeout: 15000 }, async () => {
    const config = await saveAndReadConfig(
      approvalNode({
        approvalThreshold: 1,
        addReviewers: true,
        addOwners: true,
        emptyAssigneeStrategy: 'assignAdmins',
        candidates: [{ id: 'u9', type: 'user', name: 'stale' }],
      }),
    );
    expect(config.addReviewers).toBeUndefined();
    expect(config.addOwners).toBeUndefined();
    expect(config.emptyAssigneeStrategy).toBeUndefined();
    expect(config.candidates).toBeUndefined();
    // With no nested assignees stored, the save rebuilds them from defaults.
    expect(config.assignees).toEqual({
      addReviewers: true,
      addOwners: false,
      emptyAssigneeStrategy: 'none',
      candidates: [],
    });
  });

  it('defaults nested assignees when none are stored', { timeout: 15000 }, async () => {
    const config = await saveAndReadConfig(approvalNode({}));
    expect(config.assignees).toEqual({
      addReviewers: true,
      addOwners: false,
      emptyAssigneeStrategy: 'none',
      candidates: [],
    });
    expect(config.addReviewers).toBeUndefined();
    expect(config.candidates).toBeUndefined();
  });
});
