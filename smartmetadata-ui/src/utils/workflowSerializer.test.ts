/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { WorkflowDefinitionFull } from '@/types/governance';
import { deserializeWorkflow } from './workflowSerializer';

/**
 * Official WorkflowSerializer.deserializeWorkflow, exercised on a definition
 * shaped like a real governance workflow (approve → set → end), plus the
 * seed_workflow edge: a definition with no trigger must deserialize without
 * crashing, falling back to the default event-based trigger.
 */
function approvalFixture(): WorkflowDefinitionFull {
  return {
    name: 'approve-glossary-term',
    displayName: 'Approve Glossary Term',
    description: 'Approve a glossary term change',
    type: 'eventBasedEntity',
    trigger: {
      type: 'eventBasedEntity',
      config: {
        entityTypes: ['glossaryTerm'],
        events: ['Created', 'Updated'],
      },
    },
    nodes: [
      { type: 'startEvent', subType: 'startEvent', name: 'start', displayName: 'start' },
      {
        type: 'userTask',
        subType: 'userApprovalTask',
        name: 'userApprovalTask_1',
        displayName: 'Approve',
        config: {
          approvalThreshold: 1,
          rejectionThreshold: 1,
          assignees: { addReviewers: true, addOwners: false, candidates: [] },
        },
      },
      {
        type: 'automatedTask',
        subType: 'setEntityAttributeTask',
        name: 'setEntityAttributeTask_1',
        displayName: 'Set tags',
        input: ['relatedEntity', 'updatedBy'],
        inputNamespaceMap: {
          relatedEntity: 'global',
          updatedBy: 'userApprovalTask_1',
        },
        config: { fieldName: 'tags', fieldValue: '["PII.Sensitive"]' },
      },
      { type: 'endEvent', subType: 'endEvent', name: 'endEvent_1', displayName: 'End' },
    ],
    edges: [
      { from: 'start', to: 'userApprovalTask_1' },
      { from: 'userApprovalTask_1', to: 'setEntityAttributeTask_1', condition: 'approve' },
      { from: 'userApprovalTask_1', to: 'endEvent_1', condition: 'reject' },
      { from: 'setEntityAttributeTask_1', to: 'endEvent_1' },
    ],
  };
}

describe('deserializeWorkflow', () => {
  it('converts backend nodes to flow nodes with BFS positions', () => {
    const { nodes, edges, metadata } = deserializeWorkflow(approvalFixture());

    expect(nodes).toHaveLength(4);
    expect(metadata.name).toBe('approve-glossary-term');
    expect(metadata.displayName).toBe('Approve Glossary Term');
    expect(metadata.trigger.type).toBe('eventBasedEntity');

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const start = byId.get('start');
    expect(start?.type).toBe('startEvent');
    expect(start?.position).toEqual({ x: 0, y: 0 });
    expect(start?.data.label).toBe('start');

    const approval = byId.get('userApprovalTask_1');
    expect(approval?.type).toBe('userTask');
    expect(approval?.position.x).toBe(350);
    expect(approval?.data.subType).toBe('userApprovalTask');
    expect(approval?.data.action).toBe('Approve');

    const setNode = byId.get('setEntityAttributeTask_1');
    expect(setNode?.type).toBe('automatedTask');
    expect(setNode?.position.x).toBe(700);
    expect(setNode?.data.config).toEqual({
      fieldName: 'tags',
      fieldValue: '["PII.Sensitive"]',
    });

    const end = byId.get('endEvent_1');
    expect(end?.type).toBe('endEvent');
    expect(end?.position.x).toBe(700);
  });

  it('maps edge conditions to labels with themed label backgrounds', () => {
    const { edges } = deserializeWorkflow(approvalFixture());

    expect(edges).toHaveLength(4);
    const approveEdge = edges.find(
      (e) => e.source === 'userApprovalTask_1' && e.target === 'setEntityAttributeTask_1',
    );
    expect(approveEdge?.label).toBe('approve');
    expect(approveEdge?.type).toBe('straight');
    expect(approveEdge?.data?.condition).toBe('approve');
    expect(approveEdge?.data?.conditions).toEqual([
      { field: 'result', operator: 'equals', value: 'approve' },
    ]);
    expect(approveEdge?.style?.strokeWidth).toBe(2);
    expect(approveEdge?.labelBgStyle).toMatchObject({ fillOpacity: 1 });

    const rejectEdge = edges.find(
      (e) => e.source === 'userApprovalTask_1' && e.target === 'endEvent_1',
    );
    expect(rejectEdge?.label).toBe('reject');

    const plainEdge = edges.find(
      (e) => e.source === 'start' && e.target === 'userApprovalTask_1',
    );
    expect(plainEdge?.label).toBe('');
    expect(plainEdge?.data).toBeUndefined();
  });

  it('keeps a valid predecessor updatedBy reference as-is', () => {
    const { nodes } = deserializeWorkflow(approvalFixture());
    const setNode = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(setNode?.data.inputNamespaceMap?.updatedBy).toBe(
      'userApprovalTask_1',
    );
  });

  it('migrates a global updatedBy to the predecessor user task', () => {
    const definition = approvalFixture();
    const setNode = definition.nodes?.find(
      (n) => n.subType === 'setEntityAttributeTask',
    );
    if (setNode) {
      setNode.inputNamespaceMap = {
        relatedEntity: 'global',
        updatedBy: 'global',
      };
    }
    const { nodes } = deserializeWorkflow(definition);
    const migrated = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(migrated?.data.inputNamespaceMap?.updatedBy).toBe(
      'userApprovalTask_1',
    );
  });

  it('migrates updatedBy to global when no predecessor user task exists', () => {
    const definition = approvalFixture();
    definition.nodes = definition.nodes?.filter(
      (n) => n.subType !== 'userApprovalTask',
    );
    definition.edges = definition.edges?.filter(
      (e) => e.from !== 'userApprovalTask_1' && e.to !== 'userApprovalTask_1',
    );
    const setNode = definition.nodes?.find(
      (n) => n.subType === 'setEntityAttributeTask',
    );
    if (setNode) {
      setNode.inputNamespaceMap = {
        relatedEntity: 'global',
        updatedBy: 'ApproveGlossaryTerm',
      };
    }
    const { nodes } = deserializeWorkflow(definition);
    const migrated = nodes.find((n) => n.id === 'setEntityAttributeTask_1');
    expect(migrated?.data.inputNamespaceMap?.updatedBy).toBe('global');
  });

  it('deserializes a definition with no trigger using the default trigger', () => {
    const definition: WorkflowDefinitionFull = {
      name: 'seed_workflow',
      description: 'Historical seed workflow without a trigger',
      nodes: [
        { type: 'startEvent', subType: 'startEvent', name: 'start', displayName: 'start' },
      ],
      edges: [],
    };
    const { nodes, edges, metadata } = deserializeWorkflow(definition);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    expect(metadata.trigger).toEqual({
      type: 'eventBasedEntity',
      config: {
        entityTypes: [],
        events: ['Created', 'Updated'],
        filter: {},
      },
    });
  });

  it('positions unvisited nodes after the BFS levels', () => {
    const definition = approvalFixture();
    definition.nodes = [
      ...(definition.nodes ?? []),
      {
        type: 'automatedTask',
        subType: 'rollbackEntityTask',
        name: 'rollbackEntityTask_1',
        displayName: 'Revert',
      },
    ];
    const { nodes } = deserializeWorkflow(definition);
    const orphan = nodes.find((n) => n.id === 'rollbackEntityTask_1');
    // BFS levels: start(0), approval(1), set+end(2). The set→end edge
    // re-queues end for level 3 (already visited, so it is not re-positioned,
    // but currentLevel still advances to 4) — unvisited nodes land after it.
    expect(orphan?.position.x).toBe(4 * 350);
  });
});
