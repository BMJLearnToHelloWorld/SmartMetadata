/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  WorkflowBackendEdge,
  WorkflowBackendNode,
  WorkflowDefinitionFull,
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowNodeData,
  WorkflowNodeType,
} from '@/types/governance';
import {
  getWorkflowConditionTheme,
  WORKFLOW_EDGE_THEME,
} from './workflowEdgeTheme';

/**
 * Official WorkflowSerializer (pin a3012259ca), ported 1:1. Backend
 * definition → flow nodes/edges: node id = backend node name, positions are
 * computed at load (BFS layout, 350×150); the definition stores no positions.
 * Edge condition strings map to labels (true/false/approve/reject, else the
 * raw condition); conditional edges get strokeWidth 2 + themed label.
 */

function getUINodeType(
  backendType: string,
  backendSubType: string,
): WorkflowNodeType {
  if (backendType === 'startEvent' || backendSubType === 'startEvent') {
    return 'startEvent';
  }
  if (backendType === 'endEvent' || backendSubType === 'endEvent') {
    return 'endEvent';
  }
  if (backendType === 'automatedTask') {
    // Every known automated-task subtype maps to the same UI node type, so no
    // subtype dispatch is needed here.
    return 'automatedTask';
  }
  if (backendType === 'userTask') {
    return 'userTask';
  }
  return 'automatedTask';
}

interface NodePosition {
  x: number;
  y: number;
}

function generateNodePositions(
  nodes: WorkflowBackendNode[],
  edges: WorkflowBackendEdge[],
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const visited = new Set<string>();
  // Find start nodes
  const startNodes = nodes.filter(
    (node) => node.type === 'startEvent' || node.subType === 'startEvent',
  );
  const adjacencyList = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!adjacencyList.has(edge.from)) {
      adjacencyList.set(edge.from, []);
    }
    const existingEdges = adjacencyList.get(edge.from);
    if (existingEdges) {
      existingEdges.push(edge.to);
    }
  });
  const HORIZONTAL_SPACING = 350;
  const VERTICAL_SPACING = 150;
  let currentLevel = 0;
  let nodesInCurrentLevel: string[] = [];
  if (startNodes.length > 0) {
    nodesInCurrentLevel = startNodes.map((node) => node.name);
  } else {
    nodesInCurrentLevel = [nodes[0]?.name].filter(Boolean) as string[];
  }
  while (nodesInCurrentLevel.length > 0) {
    const nextLevelNodes: string[] = [];
    nodesInCurrentLevel.forEach((nodeName, index) => {
      if (!visited.has(nodeName)) {
        const x = currentLevel * HORIZONTAL_SPACING;
        const y =
          (index - (nodesInCurrentLevel.length - 1) / 2) * VERTICAL_SPACING;
        positions.set(nodeName, { x, y });
        visited.add(nodeName);
        // Add children to next level
        const children = adjacencyList.get(nodeName) || [];
        children.forEach((child) => {
          if (!visited.has(child) && !nextLevelNodes.includes(child)) {
            nextLevelNodes.push(child);
          }
        });
      }
    });
    nodesInCurrentLevel = nextLevelNodes;
    currentLevel++;
  }
  // Position any remaining unvisited nodes
  nodes.forEach((node, index) => {
    if (!positions.has(node.name)) {
      positions.set(node.name, {
        x: currentLevel * HORIZONTAL_SPACING,
        y: index * VERTICAL_SPACING,
      });
    }
  });
  return positions;
}

function convertBackendNodeToFlow(
  backendNode: WorkflowBackendNode,
  position: NodePosition,
): WorkflowFlowNode {
  const nodeType = getUINodeType(backendNode.type, backendNode.subType);
  return {
    id: backendNode.name,
    type: nodeType,
    position,
    data: {
      name: backendNode.name,
      label: backendNode.displayName || backendNode.name,
      displayName: backendNode.displayName,
      description: backendNode.description,
      subType: backendNode.subType,
      action: backendNode.displayName || backendNode.name,
      config: backendNode.config,
      input: backendNode.input,
      inputNamespaceMap: backendNode.inputNamespaceMap,
      output: backendNode.output,
      branches: backendNode.branches,
    } as WorkflowNodeData,
  };
}

function convertBackendEdgeToFlow(
  backendEdge: WorkflowBackendEdge,
  index: number,
): WorkflowFlowEdge {
  const condition = backendEdge.condition;
  const isConditional = condition && condition.trim() !== '';
  const isTrue = condition === 'true';
  const isFalse = condition === 'false';
  const isApprove = condition === 'approve';
  const isReject = condition === 'reject';
  let edgeStyle: Record<string, unknown> = {};
  let labelStyle: Record<string, unknown> = {};
  let labelBgStyle: Record<string, unknown> = {};
  let label = '';
  if (isConditional) {
    if (isTrue) {
      label = 'TRUE';
    } else if (isFalse) {
      label = 'FALSE';
    } else if (isApprove) {
      label = 'approve';
    } else if (isReject) {
      label = 'reject';
    } else {
      label = condition;
    }
    edgeStyle = { strokeWidth: 2 };
    const { backgroundColor, labelColor } =
      getWorkflowConditionTheme(condition);
    labelStyle = {
      color: labelColor,
      fontSize: '14px',
      fontWeight: 600,
      letterSpacing: '1px',
      cursor: 'pointer',
    };
    labelBgStyle = {
      fill: backgroundColor,
      fillOpacity: 1,
      stroke: WORKFLOW_EDGE_THEME.labelBorder,
      strokeWidth: 2,
      rx: 5,
      ry: 5,
    };
  }
  return {
    id: `${backendEdge.from}-${backendEdge.to}-${index}`,
    source: backendEdge.from,
    target: backendEdge.to,
    type: 'straight',
    label,
    markerEnd: {
      type: 'arrowclosed',
      width: 16,
      height: 16,
      color: WORKFLOW_EDGE_THEME.edge,
    },
    style: {
      stroke: WORKFLOW_EDGE_THEME.edge,
      strokeWidth: 2,
      ...edgeStyle,
    },
    labelStyle,
    labelBgStyle,
    labelBgPadding: [4, 8],
    data: isConditional
      ? {
          conditions: [
            {
              field: 'result',
              operator: 'equals',
              value: isTrue || isFalse ? condition.toUpperCase() : condition,
            },
          ],
          condition,
        }
      : undefined,
  };
}

function findAllPredecessors(
  targetId: string,
  edges: WorkflowBackendEdge[],
): string[] {
  const predecessors = new Set<string>();
  const visited = new Set<string>();
  // Build reverse adjacency list (who points to whom)
  const reverseAdjList = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!reverseAdjList.has(edge.to)) {
      reverseAdjList.set(edge.to, []);
    }
    reverseAdjList.get(edge.to)?.push(edge.from);
  });
  // BFS backwards from target
  const queue = [targetId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    const parents = reverseAdjList.get(currentId) || [];
    for (const parent of parents) {
      predecessors.add(parent);
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }
  return Array.from(predecessors);
}

function isEligibleForInputNamespaceMigration(
  node: WorkflowBackendNode,
): boolean {
  return (
    (node.subType === 'setEntityAttributeTask' ||
      node.subType === 'rollbackEntityTask') &&
    Boolean(node.input?.includes('updatedBy'))
  );
}

function shouldMigrateUpdatedBy(
  currentUpdatedBy: string | undefined,
  allPredecessors: string[],
  nodes: WorkflowBackendNode[],
): boolean {
  const isKnownGlobalUpdatedBy =
    currentUpdatedBy === 'global' ||
    currentUpdatedBy === 'ApproveGlossaryTerm' ||
    currentUpdatedBy === 'ApprovalForUpdates';
  const isMissingUpdatedByReference = Boolean(
    currentUpdatedBy &&
      (!nodes.some((n) => n.name === currentUpdatedBy) ||
        !allPredecessors.includes(currentUpdatedBy)),
  );
  return isKnownGlobalUpdatedBy || isMissingUpdatedByReference;
}

function resolveMigratedNode(
  node: WorkflowBackendNode,
  allPredecessors: string[],
  userTasks: WorkflowBackendNode[],
): WorkflowBackendNode {
  // Only use a user task that is actually a predecessor (comes before this node)
  const predecessorUserTask = userTasks.find((userTask) =>
    allPredecessors.includes(userTask.name),
  );
  if (predecessorUserTask) {
    return {
      ...node,
      inputNamespaceMap: {
        ...node.inputNamespaceMap,
        updatedBy: predecessorUserTask.name, // Use the actual node name from the workflow
      },
    };
  }
  // If no predecessor user task exists, set to 'global'
  return {
    ...node,
    inputNamespaceMap: {
      ...node.inputNamespaceMap,
      updatedBy: 'global',
    },
  };
}

function migrateWorkflowInputNamespaceMap(
  nodes: WorkflowBackendNode[],
  edges: WorkflowBackendEdge[],
): WorkflowBackendNode[] {
  const userTasks = nodes.filter((n) => n.subType === 'userApprovalTask');
  return nodes.map((node) => {
    if (!isEligibleForInputNamespaceMigration(node)) {
      return node;
    }
    const currentUpdatedBy = node.inputNamespaceMap?.updatedBy;
    const allPredecessors = findAllPredecessors(node.name, edges);
    if (!shouldMigrateUpdatedBy(currentUpdatedBy, allPredecessors, nodes)) {
      return node;
    }
    return resolveMigratedNode(node, allPredecessors, userTasks);
  });
}

export interface DeserializedWorkflow {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  metadata: {
    name: string;
    displayName: string;
    description: string;
    trigger: Record<string, unknown>;
  };
}

export function deserializeWorkflow(
  workflowDefinition: WorkflowDefinitionFull,
): DeserializedWorkflow {
  let backendNodes = (workflowDefinition.nodes || []) as WorkflowBackendNode[];
  const backendEdges = (workflowDefinition.edges || []) as WorkflowBackendEdge[];
  // Migrate inputNamespaceMap to fix updatedBy references
  backendNodes = migrateWorkflowInputNamespaceMap(backendNodes, backendEdges);
  // Generate positions for all nodes
  const positions = generateNodePositions(backendNodes, backendEdges);
  // Convert nodes
  const flowNodes: WorkflowFlowNode[] = backendNodes.map((backendNode) => {
    const position = positions.get(backendNode.name) || { x: 0, y: 0 };
    return convertBackendNodeToFlow(backendNode, position);
  });
  // Convert edges
  const flowEdges: WorkflowFlowEdge[] = backendEdges.map(
    (backendEdge, index) => convertBackendEdgeToFlow(backendEdge, index),
  );
  // Extract metadata
  const trigger = workflowDefinition.trigger;
  const metadata = {
    name: workflowDefinition.name || '',
    displayName: workflowDefinition.displayName || '',
    description: workflowDefinition.description || '',
    trigger:
      trigger &&
      typeof trigger === 'object' &&
      !Array.isArray(trigger) &&
      'type' in (trigger as Record<string, unknown>)
        ? (trigger as Record<string, unknown>)
        : {
            type: 'eventBasedEntity',
            config: {
              entityTypes: [],
              events: ['Created', 'Updated'],
              filter: {},
            },
          },
  };
  return {
    nodes: flowNodes,
    edges: flowEdges,
    metadata,
  };
}
