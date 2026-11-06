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
import type {
  WorkflowDefinitionFull,
  WorkflowFlowNode,
} from '@/types/governance';
import {
  convertBackendToDisplayTriggerType,
  convertDisplayToBackendTriggerType,
  createNodeData,
  getDisplayLabelFromSubType,
  getInitialNodeConfig,
  getLabelFromSubType,
  getNodeConfiguration,
  getNodeName,
  getNodeTitle,
  getSubTypeFromLabel,
  getTypeFromSubType,
  getWorkflowNodeTestId,
  isStartNode,
  resetNodeIdCounter,
  shouldShowConnectionModal,
} from './workflowNodeUtils';

function flowNode(
  id: string,
  type: WorkflowFlowNode['type'],
  data: Record<string, unknown>,
): WorkflowFlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      label: id,
      subType: (data.subType as WorkflowFlowNode['data']['subType']) ?? 'startEvent',
      ...data,
    },
  };
}

describe('node label/type lookups', () => {
  it('maps subtypes to labels, display labels and types', () => {
    expect(getLabelFromSubType('checkEntityAttributesTask')).toBe('Check Condition');
    expect(getDisplayLabelFromSubType('checkEntityAttributesTask')).toBe('Check');
    expect(getTypeFromSubType('userApprovalTask')).toBe('userTask');
    expect(getTypeFromSubType('sinkTask')).toBe('automatedTask');
    expect(getDisplayLabelFromSubType(undefined)).toBe('TASK');
    expect(getSubTypeFromLabel('Set Action')).toBe('setEntityAttributeTask');
    expect(getSubTypeFromLabel('Unknown label')).toBe(
      'checkEntityAttributesTask',
    );
  });

  it('converts trigger types both ways', () => {
    expect(convertDisplayToBackendTriggerType('Event Based')).toBe(
      'eventBasedEntity',
    );
    expect(convertDisplayToBackendTriggerType('Periodic Batch')).toBe(
      'periodicBatchEntity',
    );
    expect(convertBackendToDisplayTriggerType('eventBasedEntity')).toBe(
      'Event Based',
    );
    expect(convertBackendToDisplayTriggerType('periodicBatchEntity')).toBe(
      'Periodic Batch',
    );
  });

  it('creates node data from a palette label', () => {
    resetNodeIdCounter();
    const data = createNodeData('Set Action', 'automatedTask', 'automatedTask_1');
    expect(data.subType).toBe('setEntityAttributeTask');
    expect(data.type).toBe('automatedTask');
    expect(data.displayName).toBe('Set Action');
  });
});

describe('getNodeName', () => {
  it('returns start for the start event', () => {
    expect(getNodeName('startEvent', 'start', [])).toBe('start');
  });

  it('preserves an existing node name', () => {
    const nodes = [
      flowNode('userApprovalTask_1', 'userTask', {
        subType: 'userApprovalTask',
      }),
    ].map((n) => ({ ...n.data, id: n.id }));
    expect(
      getNodeName('userApprovalTask', 'userApprovalTask_1', nodes),
    ).toBe('userApprovalTask_1');
  });

  it('generates the next free numbered name', () => {
    const nodes = [
      flowNode('setEntityAttributeTask_1', 'automatedTask', {
        subType: 'setEntityAttributeTask',
      }),
      flowNode('setEntityAttributeTask_2', 'automatedTask', {
        subType: 'setEntityAttributeTask',
      }),
    ].map((n) => ({ ...n.data, id: n.id }));
    expect(
      getNodeName('setEntityAttributeTask', 'new-node', nodes),
    ).toBe('setEntityAttributeTask_3');
  });
});

describe('shouldShowConnectionModal', () => {
  it('never shows for start sources or never-show subtypes', () => {
    const start = flowNode('start', 'startEvent', { subType: 'startEvent' });
    const target = flowNode('endEvent_1', 'endEvent', { subType: 'endEvent' });
    expect(shouldShowConnectionModal(start, target)).toBe(false);
    const setter = flowNode('setEntityAttributeTask_1', 'automatedTask', {
      subType: 'setEntityAttributeTask',
    });
    expect(shouldShowConnectionModal(setter, target)).toBe(false);
  });

  it('always shows for conditional sources', () => {
    const checker = flowNode('checkEntityAttributesTask_1', 'automatedTask', {
      subType: 'checkEntityAttributesTask',
    });
    const target = flowNode('endEvent_1', 'endEvent', { subType: 'endEvent' });
    expect(shouldShowConnectionModal(checker, target)).toBe(true);
  });

  it('does not show for other sources', () => {
    const sink = flowNode('sinkTask_1', 'automatedTask', {
      subType: 'sinkTask',
    });
    const target = flowNode('endEvent_1', 'endEvent', { subType: 'endEvent' });
    expect(shouldShowConnectionModal(sink, target)).toBe(false);
  });
});

describe('getWorkflowNodeTestId', () => {
  it('builds the official canvas node test id verbatim', () => {
    // The lowercasing runs first, so the camelCase split is a no-op —
    // the slug is the lowercased subtype, exactly as official renders it.
    expect(getWorkflowNodeTestId('checkEntityAttributesTask')).toBe(
      'workflow-checkentityattributestask-node',
    );
    expect(getWorkflowNodeTestId('userApprovalTask')).toBe(
      'workflow-userapprovaltask-node',
    );
    expect(getWorkflowNodeTestId(undefined)).toBe('workflow--node');
  });
});

describe('getNodeTitle / isStartNode', () => {
  it('titles the start node and task nodes', () => {
    expect(getNodeTitle(null)).toBe('Node Configuration');
    const start = flowNode('start', 'startEvent', { subType: 'startEvent' });
    expect(isStartNode(start)).toBe(true);
    expect(getNodeTitle(start)).toBe('Start Node Configuration');
    const checker = flowNode('checkEntityAttributesTask_1', 'automatedTask', {
      subType: 'checkEntityAttributesTask',
    });
    expect(getNodeTitle(checker)).toBe('Check Condition Configuration');
  });
});

describe('getInitialNodeConfig', () => {
  it('carries a saved/edited node config verbatim', () => {
    const node = flowNode('start', 'startEvent', {
      subType: 'startEvent',
      lastSaved: '2026-11-06T00:00:00.000Z',
      dataAssets: ['table'],
      triggerType: 'Event Based',
      eventType: ['Created'],
      batchSize: 25,
    });
    const config = getInitialNodeConfig(node, null);
    expect(config.dataAssets).toEqual(['table']);
    expect(config.eventType).toEqual(['Created']);
    expect(config.batchSize).toBe(25);
  });

  it('derives the start-node config from the definition trigger', () => {
    const node = flowNode('start', 'startEvent', { subType: 'startEvent' });
    const definition: WorkflowDefinitionFull = {
      name: 'w',
      displayName: 'W',
      description: 'd',
      trigger: {
        type: 'periodicBatchEntity',
        config: {
          entityTypes: ['table'],
          schedule: { scheduleTimeline: 'Custom', cronExpression: '0 0 * * *' },
          batchSize: 200,
        },
      },
    };
    const config = getInitialNodeConfig(node, definition, {
      name: 'w',
      displayName: 'W',
      description: 'd',
    });
    expect(config.triggerType).toBe('Periodic Batch');
    expect(config.scheduleType).toBe('Scheduled');
    expect(config.cronExpression).toBe('0 0 * * *');
    expect(config.batchSize).toBe(200);
    expect(config.dataAssets).toEqual(['table']);
  });

  it('falls back to generic defaults for a brand-new node', () => {
    const node = flowNode('x', 'automatedTask', {
      subType: 'setEntityAttributeTask',
      displayName: 'Set',
    });
    const config = getInitialNodeConfig(node, null);
    expect(config.triggerType).toBe('Event Based');
    expect(config.eventType).toEqual(['Created', 'Updated']);
    expect(config.batchSize).toBe(100);
  });
});

describe('getNodeConfiguration', () => {
  it('configures IO, branches and namespace for an approval task', () => {
    const approval = {
      ...flowNode('userApprovalTask_1', 'userTask', {
        subType: 'userApprovalTask',
        displayName: 'Approve',
        config: {
          approvalThreshold: 2,
          assignees: { addReviewers: true },
        },
      }).data,
      id: 'userApprovalTask_1',
    };
    const config = getNodeConfiguration(
      'userTask',
      'userApprovalTask',
      approval,
      [approval],
      [],
    );
    expect(config.name).toBe('userApprovalTask_1');
    expect(config.input).toEqual(['relatedEntity']);
    expect(config.output).toEqual(['updatedBy']);
    expect(config.branches).toEqual(['true', 'false']);
    expect(config.config?.approvalThreshold).toBe(2);
    expect(
      (config.config?.assignees as Record<string, unknown>).addReviewers,
    ).toBe(true);
  });

  it('gives check tasks a single input and result output', () => {
    const check = {
      ...flowNode('checkEntityAttributesTask_1', 'automatedTask', {
        subType: 'checkEntityAttributesTask',
        displayName: 'Check',
        config: { rules: '{"and":[]}' },
      }).data,
      id: 'checkEntityAttributesTask_1',
    };
    const config = getNodeConfiguration(
      'automatedTask',
      'checkEntityAttributesTask',
      check,
      [check],
      [],
    );
    expect(config.input).toEqual(['relatedEntity']);
    expect(config.output).toEqual(['result']);
    expect(config.branches).toEqual(['true', 'false']);
    expect(config.config).toEqual({ rules: '{"and":[]}' });
  });
});
