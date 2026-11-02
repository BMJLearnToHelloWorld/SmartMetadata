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
import type { CatalogPipelineStatus, PipelineTask } from '@/types/api';

export const TASK_NODE_WIDTH = 220;
export const TASK_NODE_HEIGHT = 72;

/**
 * Task execution-status colours, as data. A task node looks its status up
 * here; an unknown status maps to nothing (no invented colour). This is the
 * Stage 7 closure of the Stage 3 DAG decision: the pipeline task graph keeps
 * its own node model (it is not merged into the lineage graph), and its
 * status rendering is table-driven rather than a switch pile.
 */
export const TASK_STATUS_COLORS: Record<string, string> = {
  Successful: 'green',
  Failed: 'red',
  Pending: 'gold',
  Skipped: 'default',
};

export interface PipelineTaskGraphNode {
  id: string;
  name: string;
  displayName: string;
  taskType?: string;
  description?: string;
  executionStatus?: string;
}

export interface PipelineTaskGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface PipelineTaskGraphModel {
  nodes: PipelineTaskGraphNode[];
  edges: PipelineTaskGraphEdge[];
}

export interface PositionedPipelineTaskNode extends PipelineTaskGraphNode {
  position: { x: number; y: number };
}

export interface PositionedPipelineTaskGraph {
  nodes: PositionedPipelineTaskNode[];
  edges: PipelineTaskGraphEdge[];
}

export function mapPipelineTaskGraph(
  tasks: PipelineTask[] | undefined,
  latest?: CatalogPipelineStatus | null,
): PipelineTaskGraphModel {
  const rows = Array.isArray(tasks) ? tasks : [];
  const statusByName = new Map(
    (latest?.taskStatus ?? [])
      .filter((item) => item.name)
      .map((item) => [item.name, item.executionStatus]),
  );
  const nodes: PipelineTaskGraphNode[] = [];
  const names = new Set<string>();
  for (const task of rows) {
    if (!task.name || names.has(task.name)) {
      continue;
    }
    names.add(task.name);
    nodes.push({
      id: task.name,
      name: task.name,
      displayName: task.displayName || task.name,
      taskType: task.taskType,
      description: task.description,
      executionStatus: statusByName.get(task.name),
    });
  }
  const edges: PipelineTaskGraphEdge[] = [];
  const seen = new Set<string>();
  for (const task of rows) {
    if (!task.name) {
      continue;
    }
    for (const downstream of task.downstreamTasks) {
      if (!downstream || downstream === task.name || !names.has(downstream)) {
        continue;
      }
      const id = `${task.name}->${downstream}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      edges.push({ id, source: task.name, target: downstream });
    }
  }
  return { nodes, edges };
}

export function isPipelineTaskGraphEmpty(model: PipelineTaskGraphModel): boolean {
  return model.nodes.length === 0;
}

export function layoutPipelineTaskGraph(model: PipelineTaskGraphModel): PositionedPipelineTaskGraph {
  if (model.nodes.length === 0) {
    return { nodes: [], edges: model.edges };
  }
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 72, marginx: 16, marginy: 16 });
  for (const node of model.nodes) {
    graph.setNode(node.id, { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT });
  }
  for (const edge of model.edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return {
    edges: model.edges,
    nodes: model.nodes.map((node) => {
      const laid = graph.node(node.id);
      return {
        ...node,
        position: {
          x: (laid?.x ?? 0) - TASK_NODE_WIDTH / 2,
          y: (laid?.y ?? 0) - TASK_NODE_HEIGHT / 2,
        },
      };
    }),
  };
}
