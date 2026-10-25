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
import { asRecord, asString } from '@/api/json';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

export interface ColumnMapping {
  fromColumns: string[];
  toColumn: string;
  function?: string;
}

export interface LineageGraphNode {
  id: string;
  entityType: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  isCenter: boolean;
}

export interface LineageGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  description?: string;
  sourceKind?: string;
  pipelineName?: string;
  columnMappings: ColumnMapping[];
}

export interface LineageGraphModel {
  centerId: string;
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
  columnMappings: ColumnMapping[];
  hasColumnLineage: boolean;
}

export interface PositionedLineageNode extends LineageGraphNode {
  position: { x: number; y: number };
}

export interface PositionedLineageGraph extends Omit<LineageGraphModel, 'nodes'> {
  nodes: PositionedLineageNode[];
}

const EMPTY_MODEL: LineageGraphModel = {
  centerId: '',
  nodes: [],
  edges: [],
  columnMappings: [],
  hasColumnLineage: false,
};

function endpointId(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const rec = asRecord(value);
  return rec ? asString(rec.id) : '';
}

function mapColumnMappings(value: unknown): ColumnMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const toColumn = asString(rec.toColumn);
    const fromColumns = Array.isArray(rec.fromColumns)
      ? rec.fromColumns.filter((column): column is string => typeof column === 'string' && column.length > 0)
      : [];
    if (!toColumn && fromColumns.length === 0) {
      return [];
    }
    const fn = asString(rec.function);
    return [
      {
        fromColumns,
        toColumn,
        function: fn || undefined,
      },
    ];
  });
}

function referenceFrom(value: unknown, fallbackId = ''): LineageGraphNode | null {
  const rec = asRecord(value);
  if (!rec && !fallbackId) {
    return null;
  }
  const id = (rec ? asString(rec.id) : '') || fallbackId;
  if (!id) {
    return null;
  }
  const name = rec
    ? asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName) || id
    : fallbackId;
  return {
    id,
    entityType: rec ? asString(rec.type) || asString(rec.entityType) : '',
    name,
    displayName: rec ? asString(rec.displayName) || name : name,
    fullyQualifiedName: rec ? asString(rec.fullyQualifiedName) : '',
    isCenter: false,
  };
}

function edgeLabel(edge: {
  description?: string;
  sourceKind?: string;
  pipelineName?: string;
  columnMappings: ColumnMapping[];
}): string {
  if (edge.description) {
    return edge.description;
  }
  const first = edge.columnMappings[0];
  if (first) {
    const from = first.fromColumns[0] || '';
    if (from && first.toColumn) {
      return `${from} → ${first.toColumn}`;
    }
    return first.toColumn || from;
  }
  return edge.sourceKind || edge.pipelineName || '';
}

function mapEdge(
  raw: unknown,
  index: number,
  direction: 'up' | 'down',
): LineageGraphEdge | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const source = endpointId(rec.fromEntity);
  const target = endpointId(rec.toEntity);
  if (!source || !target) {
    return null;
  }
  const details = asRecord(rec.lineageDetails);
  const columnMappings = mapColumnMappings(details?.columnsLineage);
  const pipeline = asRecord(details?.pipeline);
  const mapped = {
    description: asString(rec.description) || asString(details?.description) || undefined,
    sourceKind: asString(details?.source) || undefined,
    pipelineName: asString(pipeline?.name) || asString(pipeline?.displayName) || undefined,
    columnMappings,
  };
  return {
    id: `${direction}:${source}->${target}:${index}`,
    source,
    target,
    label: edgeLabel(mapped),
    ...mapped,
  };
}

export function mapEntityLineage(payload: unknown): LineageGraphModel {
  const root = asRecord(payload);
  const center = referenceFrom(root?.entity);
  if (!center) {
    return { ...EMPTY_MODEL };
  }
  center.isCenter = true;

  const byId = new Map<string, LineageGraphNode>();
  byId.set(center.id, center);
  for (const item of Array.isArray(root?.nodes) ? root.nodes : []) {
    const node = referenceFrom(item);
    if (node && !byId.has(node.id)) {
      byId.set(node.id, node);
    }
  }

  const edges: LineageGraphEdge[] = [];
  const upstream = Array.isArray(root?.upstreamEdges) ? root.upstreamEdges : [];
  const downstream = Array.isArray(root?.downstreamEdges) ? root.downstreamEdges : [];
  upstream.forEach((raw, index) => {
    const edge = mapEdge(raw, index, 'up');
    if (edge) {
      edges.push(edge);
    }
  });
  downstream.forEach((raw, index) => {
    const edge = mapEdge(raw, index, 'down');
    if (edge) {
      edges.push(edge);
    }
  });

  for (const edge of edges) {
    if (!byId.has(edge.source)) {
      const stub = referenceFrom(null, edge.source);
      if (stub) {
        byId.set(stub.id, stub);
      }
    }
    if (!byId.has(edge.target)) {
      const stub = referenceFrom(null, edge.target);
      if (stub) {
        byId.set(stub.id, stub);
      }
    }
  }

  const columnMappings = edges.flatMap((edge) => edge.columnMappings);
  return {
    centerId: center.id,
    nodes: [...byId.values()],
    edges,
    columnMappings,
    hasColumnLineage: columnMappings.length > 0,
  };
}

export function isLineageEmpty(model: LineageGraphModel): boolean {
  return model.edges.length === 0;
}

export function lineageNeighbors(model: LineageGraphModel): {
  upstream: LineageGraphNode[];
  downstream: LineageGraphNode[];
} {
  const incoming = new Set(
    model.edges.filter((edge) => edge.target === model.centerId).map((edge) => edge.source),
  );
  const outgoing = new Set(
    model.edges.filter((edge) => edge.source === model.centerId).map((edge) => edge.target),
  );
  return {
    upstream: model.nodes.filter((node) => incoming.has(node.id)),
    downstream: model.nodes.filter((node) => outgoing.has(node.id)),
  };
}

export function layoutLineageGraph(model: LineageGraphModel): PositionedLineageGraph {
  if (model.nodes.length === 0) {
    return { ...model, nodes: [] };
  }

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 120, marginx: 16, marginy: 16 });
  for (const node of model.nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of model.edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const laid = graph.node(node.id);
      return {
        ...node,
        position: {
          x: (laid?.x ?? 0) - NODE_WIDTH / 2,
          y: (laid?.y ?? 0) - NODE_HEIGHT / 2,
        },
      };
    }),
  };
}
