/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString } from '@/api/json';
import { attachColumnPorts } from './columnPorts';
import type { ElkExtendedEdge, ElkNode, LayoutOptions } from './elkLayout';
import { lineagePathLabel, lineageServiceName, truncateLineageFqn } from './nodeChrome';

export const NODE_WIDTH = 260;
export const NODE_HEADER_HEIGHT = 78;
export const COLUMN_ROW_HEIGHT = 24;

export interface ColumnMapping {
  fromColumns: string[];
  toColumn: string;
  function?: string;
}

export interface LineageColumnPort {
  fqn: string;
  name: string;
}

export interface LineageGraphNode {
  id: string;
  entityType: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  isCenter: boolean;
  serviceName: string;
  pathLabel: string;
  truncatedFqn: string;
  columns: LineageColumnPort[];
  /**
   * Children counts from the search response (`NodeInformation.paging`:
   * `entityUpstreamCount` / `entityDownstreamCount`). Pin's node expand
   * handles use them to know a fetched leaf still has children; traversal
   * responses carry no paging, so those nodes report 0. Optional: callers
   * that build nodes without a search response (e.g. impact-panel fixtures)
   * omit them and readers treat a missing count as 0.
   */
  upstreamCount?: number;
  downstreamCount?: number;
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
  sourceHandle?: string;
  targetHandle?: string;
  isColumnEdge?: boolean;
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
  const fullyQualifiedName = rec ? asString(rec.fullyQualifiedName) : '';
  return {
    id,
    entityType: rec ? asString(rec.type) || asString(rec.entityType) : '',
    name,
    displayName: rec ? asString(rec.displayName) || name : name,
    fullyQualifiedName,
    isCenter: false,
    serviceName: lineageServiceName(fullyQualifiedName),
    pathLabel: lineagePathLabel(fullyQualifiedName),
    truncatedFqn: truncateLineageFqn(fullyQualifiedName),
    columns: [],
    upstreamCount: 0,
    downstreamCount: 0,
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
  return attachColumnPorts({
    centerId: center.id,
    nodes: [...byId.values()],
    edges,
    columnMappings,
    hasColumnLineage: columnMappings.length > 0,
  });
}

function mapSearchEdge(
  raw: unknown,
  index: number,
  direction: 'up' | 'down',
): LineageGraphEdge | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  // EsLineageData endpoints carry {id, fullyQualifiedName, type}; the id
  // is what node ids are built from, so endpointId's string-or-{id}
  // reading applies unchanged.
  const source = endpointId(rec.fromEntity);
  const target = endpointId(rec.toEntity);
  if (!source || !target) {
    return null;
  }
  // Search edges carry columns + pipeline at top level (not nested under
  // lineageDetails like traversal edges); column entries share the
  // {fromColumns, toColumn, function} shape, so the same mapper applies.
  const columnMappings = mapColumnMappings(rec.columns);
  const pipeline = asRecord(rec.pipeline);
  const pipelineName =
    asString(pipeline?.name) || asString(pipeline?.displayName) || asString(rec.pipeline) || undefined;
  const mapped = {
    description: asString(rec.description) || undefined,
    sourceKind: undefined,
    pipelineName,
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

/**
 * Adapt a SearchLineageResult (GET /v1/lineage/getLineage) to the graph
 * model. Nodes arrive as a map keyed by FQN whose values hold the ES
 * entity map (NodeInformation.entity) + nodeDepth; edges arrive as
 * upstream/downstream maps of EsLineageData. The center is the node
 * whose FQN matches the requested entity, falling back to the nodeDepth-0
 * node, then the first node — the search response carries no single
 * root.entity the way EntityLineage does.
 */
export function mapSearchLineage(payload: unknown, centerFqn: string): LineageGraphModel {
  const root = asRecord(payload);
  const nodesMap = asRecord(root?.nodes);
  const byId = new Map<string, LineageGraphNode>();
  let center: LineageGraphNode | null = null;
  let depthZero: LineageGraphNode | null = null;
  if (nodesMap) {
    for (const [key, item] of Object.entries(nodesMap)) {
      const info = asRecord(item);
      const node = referenceFrom(info?.entity);
      if (!node) {
        continue;
      }
      // The ES entity map may omit fullyQualifiedName; the map key IS the
      // FQN, so it fills the gap for center matching and display.
      if (!node.fullyQualifiedName) {
        node.fullyQualifiedName = key;
        node.pathLabel = lineagePathLabel(key);
        node.truncatedFqn = truncateLineageFqn(key);
        node.serviceName = lineageServiceName(key);
      }
      // Paging counts (see LineageGraphNode): a fetched leaf with a
      // nonzero count still has children the server did not return.
      const paging = asRecord(info?.paging);
      const upCount = paging?.entityUpstreamCount;
      const downCount = paging?.entityDownstreamCount;
      node.upstreamCount = typeof upCount === 'number' && upCount > 0 ? upCount : 0;
      node.downstreamCount = typeof downCount === 'number' && downCount > 0 ? downCount : 0;
      if (!byId.has(node.id)) {
        byId.set(node.id, node);
      }
      const depth = asRecord(item)?.nodeDepth;
      if (typeof depth === 'number' && depth === 0 && !depthZero) {
        depthZero = node;
      }
      if (!center && (key === centerFqn || node.fullyQualifiedName === centerFqn)) {
        center = node;
      }
    }
  }
  if (!center) {
    center = depthZero ?? [...byId.values()][0] ?? null;
  }
  if (!center) {
    return { ...EMPTY_MODEL };
  }
  center.isCenter = true;

  const edges: LineageGraphEdge[] = [];
  const upstream = asRecord(root?.upstreamEdges);
  const downstream = asRecord(root?.downstreamEdges);
  if (upstream) {
    Object.values(upstream).forEach((raw, index) => {
      const edge = mapSearchEdge(raw, index, 'up');
      if (edge) {
        edges.push(edge);
      }
    });
  }
  if (downstream) {
    Object.values(downstream).forEach((raw, index) => {
      const edge = mapSearchEdge(raw, index, 'down');
      if (edge) {
        edges.push(edge);
      }
    });
  }

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
  return attachColumnPorts({
    centerId: center.id,
    nodes: [...byId.values()],
    edges,
    columnMappings,
    hasColumnLineage: columnMappings.length > 0,
  });
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

export function lineageNodeSize(
  node: LineageGraphNode,
  expandedNodeIds?: ReadonlySet<string>,
): { width: number; height: number } {
  const expanded = expandedNodeIds?.has(node.id) && node.columns.length > 0;
  return {
    width: NODE_WIDTH,
    height: NODE_HEADER_HEIGHT + (expanded ? node.columns.length * COLUMN_ROW_HEIGHT + 8 : 0),
  };
}

export function lineageNodeNeighbors(
  model: LineageGraphModel,
  nodeId: string,
): { hasUpstream: boolean; hasDownstream: boolean } {
  return {
    hasUpstream: model.edges.some((edge) => edge.target === nodeId),
    hasDownstream: model.edges.some((edge) => edge.source === nodeId),
  };
}

/**
 * Which side of the center a node sits on, for pin's expand/collapse
 * handle visibility (CustomNodeV1 `getHandleVisibility`: collapse is offered
 * to upstream nodes / the root on the upstream side, and downstream nodes /
 * the root on the downstream side). BFS distances from the center decide;
 * a node reachable both ways takes the nearer side, an unreached node is
 * 'other'.
 */
export function lineageNodeSide(
  model: LineageGraphModel,
  nodeId: string,
): 'upstream' | 'downstream' | 'center' | 'other' {
  if (nodeId === model.centerId) {
    return 'center';
  }
  const distances = new Map<string, { side: 'upstream' | 'downstream'; depth: number }>();
  const walk = (side: 'upstream' | 'downstream'): void => {
    const queue: { id: string; depth: number }[] = [{ id: model.centerId, depth: 0 }];
    const seen = new Set<string>([model.centerId]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const next =
        side === 'downstream'
          ? model.edges.filter((edge) => edge.source === current.id).map((edge) => edge.target)
          : model.edges.filter((edge) => edge.target === current.id).map((edge) => edge.source);
      for (const id of next) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        const depth = current.depth + 1;
        const prev = distances.get(id);
        if (!prev || depth < prev.depth) {
          distances.set(id, { side, depth });
        }
        queue.push({ id, depth });
      }
    }
  };
  walk('downstream');
  walk('upstream');
  return distances.get(nodeId)?.side ?? 'other';
}

/**
 * Merge a load-on-expand fetch into the current graph, mirroring pin
 * `loadChildNodesHandler` (Lineage.tsx:1083-1160): nodes keyed by id (the
 * fresh fetch wins for a shared id), edges deduplicated by endpoint pair
 * with column mappings unioned, the base center kept. Column ports are
 * re-derived from the merged edges.
 */
export function mergeLineageModels(
  base: LineageGraphModel,
  extra: LineageGraphModel,
): LineageGraphModel {
  const byId = new Map<string, LineageGraphNode>();
  for (const node of base.nodes) {
    byId.set(node.id, { ...node, columns: [...node.columns] });
  }
  for (const node of extra.nodes) {
    byId.set(node.id, { ...node, isCenter: node.id === base.centerId, columns: [...node.columns] });
  }

  const edgesByPair = new Map<string, LineageGraphEdge>();
  for (const edge of [...base.edges, ...extra.edges]) {
    const key = `${edge.source}->${edge.target}`;
    const existing = edgesByPair.get(key);
    if (!existing) {
      edgesByPair.set(key, { ...edge, columnMappings: [...edge.columnMappings] });
      continue;
    }
    const seen = new Set(existing.columnMappings.map((mapping) => JSON.stringify(mapping)));
    for (const mapping of edge.columnMappings) {
      if (!seen.has(JSON.stringify(mapping))) {
        seen.add(JSON.stringify(mapping));
        existing.columnMappings.push(mapping);
      }
    }
  }

  const edges = [...edgesByPair.values()];
  const columnMappings = edges.flatMap((edge) => edge.columnMappings);
  return attachColumnPorts({
    centerId: base.centerId,
    nodes: [...byId.values()],
    edges,
    columnMappings,
    hasColumnLineage: columnMappings.length > 0,
  });
}

/**
 * Collapse a node in one direction, mirroring pin `onNodeCollapse`
 * (Lineage.tsx:1968-2015): every node reachable from the node in that
 * direction is removed with its incident edges. A reachable node survives
 * when it still has another path into the remaining graph (an edge from/to
 * a node outside the reachable set and outside the collapsed node), and the
 * center node is never removed.
 */
export function collapseLineageModel(
  model: LineageGraphModel,
  nodeId: string,
  direction: 'upstream' | 'downstream',
): LineageGraphModel {
  const step = (current: string): string[] =>
    direction === 'downstream'
      ? model.edges.filter((edge) => edge.source === current).map((edge) => edge.target)
      : model.edges.filter((edge) => edge.target === current).map((edge) => edge.source);

  const reachable = new Set<string>();
  const queue = step(nodeId);
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || next === nodeId || reachable.has(next)) {
      continue;
    }
    reachable.add(next);
    queue.push(...step(next));
  }

  const removed = new Set<string>();
  for (const id of reachable) {
    if (id === model.centerId) {
      continue;
    }
    // Another path into the remaining graph: any edge to or from a node
    // that is neither reachable nor the collapsed node. (Pin removes the
    // whole connected set; keeping a node that is still attached elsewhere
    // avoids dropping a shared node out from under its other parent.)
    const hasOtherPath = model.edges.some((edge) => {
      if (edge.source === id) {
        return edge.target !== nodeId && !reachable.has(edge.target);
      }
      if (edge.target === id) {
        return edge.source !== nodeId && !reachable.has(edge.source);
      }
      return false;
    });
    if (!hasOtherPath) {
      removed.add(id);
    }
  }

  const nodes = model.nodes.filter((node) => !removed.has(node.id));
  const edges = model.edges.filter(
    (edge) => !removed.has(edge.source) && !removed.has(edge.target),
  );
  const columnMappings = edges.flatMap((edge) => edge.columnMappings);
  return attachColumnPorts({
    centerId: model.centerId,
    nodes,
    edges,
    columnMappings,
    hasColumnLineage: columnMappings.length > 0,
  });
}

/**
 * DQ node ids from a `getDataQualityLineage` payload: the product server
 * returns `{ nodes: [{ id, fullyQualifiedName, ... }], edges: [...] }`
 * (LineageResource.java:610; RootCauseAnalysisTool.java: buildUpstreamAnalysis
 * reads the same `nodes` list). A map-shaped `nodes` is tolerated.
 */
export function extractDqNodeIds(payload: unknown): string[] {
  const root = asRecord(payload);
  const raw = root?.nodes;
  const items = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const ids: string[] = [];
  for (const item of items) {
    const id = endpointId(item);
    if (id) {
      ids.push(id);
    }
  }
  return [...new Set(ids)];
}

/**
 * DQ highlight, mirroring pin Lineage.tsx:2139-2151: the highlighted edges
 * are all downstream edges of each DQ node (transitive, following
 * source → target), and the highlighted nodes are the DQ nodes present in
 * the graph. The graph's own node/edge ids are entity UUIDs, the same id
 * space the DQ payload uses.
 */
export function dqHighlight(
  model: LineageGraphModel,
  dqNodeIds: readonly string[],
): { nodeIds: string[]; edgeIds: string[] } {
  const wanted = new Set(dqNodeIds);
  const nodeIds = model.nodes.filter((node) => wanted.has(node.id)).map((node) => node.id);
  const edgeIds = new Set<string>();
  const visited = new Set<string>(nodeIds);
  const queue = [...nodeIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const edge of model.edges) {
      if (edge.source !== current || edgeIds.has(edge.id)) {
        continue;
      }
      edgeIds.add(edge.id);
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return { nodeIds, edgeIds: [...edgeIds] };
}

/**
 * Lay the graph out with ELK (pin `getELKLayoutedElements`,
 * `utils/Lineage/Layout/ElkLayoutUtils.ts`, a3012259ca): nodes are sized
 * with `lineageNodeSize`, edges are mapped to ELK source/target pairs, and
 * positions come back from the layered layout flowing right.
 *
 * Async like pin: the ELK engine is loaded lazily behind a dynamic import
 * (pin's lazy boundary — elkjs is ~1.37 MB and this is the only module
 * that needs it), so callers await the positioned graph instead of
 * reading it from a computed. On layout failure the error is logged and
 * the graph comes back empty (no nodes, no edges), as pin does.
 */
export async function layoutLineageGraph(
  model: LineageGraphModel,
  expandedNodeIds?: ReadonlySet<string>,
  layoutOptions?: LayoutOptions,
): Promise<PositionedLineageGraph> {
  if (model.nodes.length === 0) {
    return { ...model, nodes: [] };
  }

  try {
    const { ELKLayout } = await import('./elkLayout');
    const elkNodes: ElkNode[] = model.nodes.map((node) => {
      const size = lineageNodeSize(node, expandedNodeIds);
      return { id: node.id, width: size.width, height: size.height };
    });
    const elkEdges: ElkExtendedEdge[] = model.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    }));
    const layoutedGraph = await ELKLayout.layoutGraph(elkNodes, elkEdges, layoutOptions);
    const layoutedMap = new Map(
      (layoutedGraph.children ?? []).map((node) => [node.id, node]),
    );
    return {
      ...model,
      nodes: model.nodes.map((node) => {
        const laid = layoutedMap.get(node.id);
        return {
          ...node,
          position: { x: laid?.x ?? 0, y: laid?.y ?? 0 },
        };
      }),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error occurred while layouting graph:', error);

    return { ...model, nodes: [], edges: [] };
  }
}
