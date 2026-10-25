/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { LineageColumnPort, LineageGraphEdge, LineageGraphModel, LineageGraphNode } from './graphModel';

export function columnLeafName(columnFqn: string): string {
  if (!columnFqn) {
    return '';
  }
  const parts = columnFqn.split('.').filter(Boolean);
  return parts[parts.length - 1] || columnFqn;
}

export function columnBelongsToNode(columnFqn: string, nodeFqn: string): boolean {
  if (!columnFqn || !nodeFqn) {
    return false;
  }
  return columnFqn === nodeFqn || columnFqn.startsWith(`${nodeFqn}.`);
}

function upsertPort(node: LineageGraphNode, columnFqn: string): void {
  if (!columnFqn || node.columns.some((column) => column.fqn === columnFqn)) {
    return;
  }
  const port: LineageColumnPort = { fqn: columnFqn, name: columnLeafName(columnFqn) };
  node.columns.push(port);
}

function nodeAcceptsColumn(node: LineageGraphNode, columnFqn: string): boolean {
  if (columnBelongsToNode(columnFqn, node.fullyQualifiedName)) {
    return true;
  }
  return !node.fullyQualifiedName;
}

export function attachColumnPorts(model: LineageGraphModel): LineageGraphModel {
  const nodes = model.nodes.map((node) => ({
    ...node,
    columns: [...node.columns],
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const edge of model.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    for (const mapping of edge.columnMappings) {
      for (const from of mapping.fromColumns) {
        if (source && nodeAcceptsColumn(source, from)) {
          upsertPort(source, from);
        } else {
          const owner = nodes.find((node) => columnBelongsToNode(from, node.fullyQualifiedName));
          if (owner) {
            upsertPort(owner, from);
          }
        }
      }
      if (mapping.toColumn) {
        if (target && nodeAcceptsColumn(target, mapping.toColumn)) {
          upsertPort(target, mapping.toColumn);
        } else {
          const owner = nodes.find((node) => columnBelongsToNode(mapping.toColumn, node.fullyQualifiedName));
          if (owner) {
            upsertPort(owner, mapping.toColumn);
          }
        }
      }
    }
  }

  return { ...model, nodes };
}

export function columnLineageEdges(model: LineageGraphModel): LineageGraphEdge[] {
  const extra: LineageGraphEdge[] = [];
  model.edges.forEach((edge) => {
    edge.columnMappings.forEach((mapping, mappingIndex) => {
      mapping.fromColumns.forEach((from, columnIndex) => {
        if (!from && !mapping.toColumn) {
          return;
        }
        extra.push({
          id: `col:${edge.id}:${mappingIndex}:${columnIndex}`,
          source: edge.source,
          target: edge.target,
          sourceHandle: from || undefined,
          targetHandle: mapping.toColumn || undefined,
          label: mapping.function || '',
          description: edge.description,
          sourceKind: edge.sourceKind,
          pipelineName: edge.pipelineName,
          columnMappings: [mapping],
          isColumnEdge: true,
        });
      });
    });
  });
  return extra;
}

export function highlightForColumn(
  model: LineageGraphModel,
  columnFqn: string,
): { nodeIds: string[]; edgeIds: string[] } {
  if (!columnFqn) {
    return { nodeIds: [], edgeIds: [] };
  }
  return {
    nodeIds: model.nodes
      .filter(
        (node) =>
          node.columns.some((column) => column.fqn === columnFqn) ||
          columnBelongsToNode(columnFqn, node.fullyQualifiedName),
      )
      .map((node) => node.id),
    edgeIds: model.edges
      .filter((edge) =>
        edge.columnMappings.some(
          (mapping) => mapping.toColumn === columnFqn || mapping.fromColumns.includes(columnFqn),
        ),
      )
      .map((edge) => edge.id),
  };
}
