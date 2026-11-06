/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dagre from 'dagre';
import { Position } from '@vue-flow/core';
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '@/types/governance';

/**
 * Official WorkflowLayout (pin a3012259ca), ported onto the product's
 * existing `dagre` dependency (same as src/lineage/graphModel.ts). The
 * official package is @dagrejs/dagre; the product already ships `dagre`
 * ^0.8.5 with the same graphlib API, so no new dependency is added.
 * Node size 264×100, rankdir LR, nodesep 100, ranksep 150, edgesep 40.
 */
const NODE_WIDTH = 264;
const NODE_HEIGHT = 100;

export function applyFlowchartLayout(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  if (nodes.length === 0) {
    return { nodes, edges };
  }
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 100,
    ranksep: 150,
    edgesep: 40,
  });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
  return { nodes: layoutedNodes, edges };
}
