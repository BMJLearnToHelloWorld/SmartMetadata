/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowMetadata,
} from '@/types/governance';
import {
  buildWorkflowForSave,
  testWorkflow,
} from './workflowValidation';

/**
 * Official WorkflowValidationService.buildWorkflowForSave / testWorkflow:
 * the client build assertions, the trigger-config resolvers, git-sink
 * narrowing, Enforce-only partial decisions, and the storeStageStatus rule.
 */

function startNode(
  overrides: Record<string, unknown> = {},
): WorkflowFlowNode {
  return {
    id: 'start',
    type: 'startEvent',
    position: { x: 0, y: 0 },
    data: {
      name: 'start',
      label: 'start',
      displayName: 'start',
      subType: 'startEvent',
      triggerType: 'Event Based',
      dataAssets: ['table'],
      eventType: ['Created', 'Updated'],
      excludeFields: [],
      include: [],
      triggerFilter: '',
      scheduleType: '',
      cronExpression: '',
      batchSize: 100,
      dataAssetFilters: [],
      lastSaved: '2026-11-06T00:00:00.000Z',
      userModified: true,
      ...overrides,
    },
  };
}

function approvalNode(id = 'userApprovalTask_1'): WorkflowFlowNode {
  return {
    id,
    type: 'userTask',
    position: { x: 350, y: 0 },
    data: {
      name: id,
      label: 'Approve',
      displayName: 'Approve',
      subType: 'userApprovalTask',
      config: {
        approvalThreshold: 1,
        rejectionThreshold: 1,
        assignees: { addReviewers: true, addOwners: false, candidates: [] },
      },
    },
  };
}

function setNode(id = 'setEntityAttributeTask_1'): WorkflowFlowNode {
  return {
    id,
    type: 'automatedTask',
    position: { x: 700, y: 0 },
    data: {
      name: id,
      label: 'Set',
      displayName: 'Set',
      subType: 'setEntityAttributeTask',
      config: { fieldName: 'tags', fieldValue: '["PII.Sensitive"]' },
    },
  };
}

function endNode(id = 'endEvent_1'): WorkflowFlowNode {
  return {
    id,
    type: 'endEvent',
    position: { x: 1050, y: 0 },
    data: {
      name: id,
      label: 'End',
      displayName: 'End',
      subType: 'endEvent',
    },
  };
}

function definition(
  overrides: Partial<WorkflowDefinitionFull> = {},
): WorkflowDefinitionFull {
  return {
    name: 'approve-table',
    displayName: 'Approve Table',
    description: 'Approve table changes',
    type: 'eventBasedEntity',
    trigger: {
      type: 'eventBasedEntity',
      config: {
        entityTypes: ['table'],
        events: ['Created', 'Updated'],
      },
    },
    ...overrides,
  };
}

function metadata(
  overrides: Partial<WorkflowMetadata> = {},
): WorkflowMetadata {
  return {
    name: 'approve-table',
    displayName: 'Approve Table',
    description: 'Approve table changes',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildWorkflowForSave', () => {
  it('throws when an event-based trigger has no entity types', async () => {
    const nodes = [startNode({ dataAssets: [] })];
    await expect(
      buildWorkflowForSave(
        nodes,
        [],
        definition({
          trigger: {
            type: 'eventBasedEntity',
            config: { entityTypes: [] },
          },
        }),
        metadata(),
      ),
    ).rejects.toThrow('workflows.builder.triggerRequiresDataAssets');
  });

  it('builds the event-based trigger from a user-modified start node', async () => {
    const nodes = [startNode(), approvalNode(), setNode(), endNode()];
    const edges: WorkflowFlowEdge[] = [
      { id: 'e1', source: 'start', target: 'userApprovalTask_1' },
      {
        id: 'e2',
        source: 'userApprovalTask_1',
        target: 'setEntityAttributeTask_1',
        label: 'approve',
        data: { condition: 'approve' },
      },
      {
        id: 'e3',
        source: 'userApprovalTask_1',
        target: 'endEvent_1',
        label: 'reject',
        data: { condition: 'reject' },
      },
      { id: 'e4', source: 'setEntityAttributeTask_1', target: 'endEvent_1' },
    ];
    const saved = await buildWorkflowForSave(
      nodes,
      edges,
      definition(),
      metadata(),
    );

    expect(saved.name).toBe('approve-table');
    expect(saved.type).toBe('eventBasedEntity');
    expect(saved.trigger).toEqual({
      type: 'eventBasedEntity',
      config: {
        entityTypes: ['table'],
        events: ['Created', 'Updated'],
      },
      output: ['relatedEntity', 'updatedBy'],
    });
    expect(saved.config?.storeStageStatus).toBe(true);

    const start = saved.nodes?.find((n) => n.name === 'start');
    expect(start).toEqual({
      type: 'startEvent',
      subType: 'startEvent',
      name: 'start',
      displayName: 'start',
    });
    const set = saved.nodes?.find((n) => n.name === 'setEntityAttributeTask_1');
    expect(set?.input).toEqual(['relatedEntity', 'updatedBy']);
    expect(set?.inputNamespaceMap).toEqual({
      relatedEntity: 'global',
      updatedBy: 'userApprovalTask_1',
    });
    expect(set?.config).toEqual({
      fieldName: 'tags',
      fieldValue: '["PII.Sensitive"]',
    });
    const approval = saved.nodes?.find(
      (n) => n.name === 'userApprovalTask_1',
    );
    expect(approval?.input).toEqual(['relatedEntity']);
    expect(approval?.output).toEqual(['updatedBy']);
    expect(approval?.branches).toEqual(['true', 'false']);

    expect(saved.edges).toEqual([
      { from: 'start', to: 'userApprovalTask_1' },
      {
        from: 'userApprovalTask_1',
        to: 'setEntityAttributeTask_1',
        condition: 'approve',
      },
      { from: 'userApprovalTask_1', to: 'endEvent_1', condition: 'reject' },
      { from: 'setEntityAttributeTask_1', to: 'endEvent_1' },
    ]);
  });

  it('keeps the saved trigger when the start node was not user-modified', async () => {
    const nodes = [
      startNode({ lastSaved: undefined, userModified: undefined }),
      approvalNode(),
      endNode(),
    ];
    const saved = await buildWorkflowForSave(
      nodes,
      [
        { id: 'e1', source: 'start', target: 'userApprovalTask_1' },
        { id: 'e2', source: 'userApprovalTask_1', target: 'endEvent_1' },
      ],
      definition({
        trigger: {
          type: 'eventBasedEntity',
          config: {
            entityTypes: ['glossaryTerm'],
            events: ['Created'],
            exclude: ['description'],
          },
        },
      }),
      metadata(),
    );
    expect(saved.trigger?.config).toMatchObject({
      entityTypes: ['glossaryTerm'],
      events: ['Created'],
      exclude: ['description'],
    });
  });

  it('builds a periodic trigger with schedule, batch size and filters', async () => {
    const nodes = [
      startNode({
        triggerType: 'Periodic Batch',
        scheduleType: 'Scheduled',
        cronExpression: '0 0 * * *',
        batchSize: 50,
        dataAssetFilters: [
          { id: 1, dataAsset: 'table', filters: '{"and":[]}' },
        ],
      }),
      endNode(),
    ];
    const saved = await buildWorkflowForSave(
      nodes,
      [{ id: 'e1', source: 'start', target: 'endEvent_1' }],
      definition({
        type: 'periodicBatchEntity',
        trigger: {
          type: 'periodicBatchEntity',
          config: { entityTypes: ['table'] },
        },
      }),
      metadata(),
    );
    expect(saved.type).toBe('periodicBatchEntity');
    expect(saved.trigger?.config).toEqual({
      entityTypes: ['table'],
      schedule: { scheduleTimeline: 'Custom', cronExpression: '0 0 * * *' },
      batchSize: 50,
      filters: { table: '{"and":[]}' },
    });
    expect(saved.config?.storeStageStatus).toBe(false);
  });

  it('narrows a git-sink trigger to synced entity types', async () => {
    const sinkNode: WorkflowFlowNode = {
      id: 'sinkTask_1',
      type: 'automatedTask',
      position: { x: 700, y: 0 },
      data: {
        name: 'sinkTask_1',
        label: 'Git Sink',
        displayName: 'Git Sink',
        subType: 'sinkTask',
        config: { sinkType: 'git', outputFormat: 'yaml', sinkConfig: {} },
      },
    };
    const nodes = [
      startNode({ dataAssets: ['table', 'query'] }),
      sinkNode,
      endNode(),
    ];
    const saved = await buildWorkflowForSave(
      nodes,
      [
        { id: 'e1', source: 'start', target: 'sinkTask_1' },
        { id: 'e2', source: 'sinkTask_1', target: 'endEvent_1' },
      ],
      definition(),
      metadata(),
    );
    expect(
      (saved.trigger?.config as { entityTypes?: string[] }).entityTypes,
    ).toEqual(['table']);
  });

  it('strips partial decisions unless approval mode is Enforce', async () => {
    const withPartial = approvalNode();
    (withPartial.data.config as Record<string, unknown>).allowPartialDecisions =
      true;
    const nodes = [startNode(), withPartial, endNode()];
    const edges: WorkflowFlowEdge[] = [
      { id: 'e1', source: 'start', target: 'userApprovalTask_1' },
      { id: 'e2', source: 'userApprovalTask_1', target: 'endEvent_1' },
    ];
    const savedDefault = await buildWorkflowForSave(
      nodes,
      edges,
      definition(),
      metadata(),
    );
    const approvalDefault = savedDefault.nodes?.find(
      (n) => n.name === 'userApprovalTask_1',
    );
    expect(
      (approvalDefault?.config as Record<string, unknown> | undefined)
        ?.allowPartialDecisions,
    ).toBeUndefined();

    const savedEnforce = await buildWorkflowForSave(
      nodes,
      edges,
      definition({
        trigger: {
          type: 'eventBasedEntity',
          config: {
            entityTypes: ['table'],
            events: ['Created', 'Updated'],
            approvalMode: 'Enforce',
          },
        },
      }),
      metadata(),
    );
    // The start node was user-modified but carries no approvalMode, so the
    // saved trigger keeps the existing Enforce mode and the decision stays.
    const approvalEnforce = savedEnforce.nodes?.find(
      (n) => n.name === 'userApprovalTask_1',
    );
    expect(
      (approvalEnforce?.config as Record<string, unknown> | undefined)
        ?.allowPartialDecisions,
    ).toBe(true);
  });

  it('lowercases edge conditions except for data-completeness sources', async () => {
    const completenessNode: WorkflowFlowNode = {
      id: 'dataCompletenessTask_1',
      type: 'automatedTask',
      position: { x: 350, y: 0 },
      data: {
        name: 'dataCompletenessTask_1',
        label: 'Data Completeness',
        displayName: 'Data Completeness',
        subType: 'dataCompletenessTask',
        config: {
          fieldsToCheck: ['description'],
          qualityBands: [{ name: 'Gold', minimumScore: 90 }],
        },
      },
    };
    const nodes = [startNode(), completenessNode, endNode()];
    const edges: WorkflowFlowEdge[] = [
      { id: 'e1', source: 'start', target: 'dataCompletenessTask_1' },
      {
        id: 'e2',
        source: 'dataCompletenessTask_1',
        target: 'endEvent_1',
        label: 'Gold',
        data: { condition: 'Gold' },
      },
    ];
    const saved = await buildWorkflowForSave(
      nodes,
      edges,
      definition(),
      metadata(),
    );
    expect(saved.edges?.[1]?.condition).toBe('Gold');

    const approvalEdges: WorkflowFlowEdge[] = [
      { id: 'e1', source: 'start', target: 'userApprovalTask_1' },
      {
        id: 'e2',
        source: 'userApprovalTask_1',
        target: 'endEvent_1',
        label: 'TRUE',
        data: { condition: 'TRUE' },
      },
    ];
    const savedApproval = await buildWorkflowForSave(
      [startNode(), approvalNode(), endNode()],
      approvalEdges,
      definition(),
      metadata(),
    );
    expect(savedApproval.edges?.[1]?.condition).toBe('true');
  });

  it('drops edges whose endpoints no longer exist', async () => {
    const nodes = [startNode(), endNode()];
    const saved = await buildWorkflowForSave(
      nodes,
      [
        { id: 'e1', source: 'start', target: 'endEvent_1' },
        { id: 'e2', source: 'start', target: 'missing-node' },
      ],
      definition(),
      metadata(),
    );
    expect(saved.edges).toHaveLength(1);
    expect(saved.edges?.[0]).toEqual({ from: 'start', to: 'endEvent_1' });
  });
});

describe('testWorkflow', () => {
  it('returns the built definition when /validate succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain(
          '/v1/governance/workflowDefinitions/validate',
        );
        return jsonResponse({ message: 'Workflow is valid' });
      }),
    );
    const saved = await testWorkflow(
      [startNode(), endNode()],
      [{ id: 'e1', source: 'start', target: 'endEvent_1' }],
      definition(),
      metadata(),
    );
    expect(saved.name).toBe('approve-table');
  });

  it('throws when /validate fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'Invalid' }, 400)),
    );
    await expect(
      testWorkflow(
        [startNode(), endNode()],
        [{ id: 'e1', source: 'start', target: 'endEvent_1' }],
        definition(),
        metadata(),
      ),
    ).rejects.toThrow();
  });
});
