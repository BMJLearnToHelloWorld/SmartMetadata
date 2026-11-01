/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Graph-derived impact analysis. The official impact tab is backed by a
 * per-entity-count export API that does not exist on the product lineage
 * API, so this module derives impact strictly from the already-fetched
 * graph model: breadth-first traversal from the center node, in the
 * chosen direction. Rows are never invented: a node or column mapping
 * appears only if it is in the model, and fields the model does not
 * carry (owners, domains, tags, tier, glossary terms) are omitted
 * rather than faked.
 */
import type { ColumnMapping, LineageGraphModel, LineageGraphNode } from './graphModel';

export type ImpactDirection = 'upstream' | 'downstream';
export type ImpactLevel = 'entity' | 'column';

export interface ImpactDirectionOption {
  value: ImpactDirection;
  labelKey: string;
}

export const IMPACT_DIRECTIONS: ImpactDirectionOption[] = [
  { value: 'upstream', labelKey: 'lineage.impactUpstream' },
  { value: 'downstream', labelKey: 'lineage.impactDownstream' },
];

export interface ImpactLevelOption {
  value: ImpactLevel;
  labelKey: string;
}

export const IMPACT_LEVELS: ImpactLevelOption[] = [
  { value: 'entity', labelKey: 'lineage.impactEntityLevel' },
  { value: 'column', labelKey: 'lineage.impactColumnLevel' },
];

export interface ImpactEntityRow {
  key: string;
  name: string;
  displayName: string;
  fullyQualifiedName: string;
  entityType: string;
  /** '' only for the center row used by CSV export; impact rows always carry a direction. */
  direction: ImpactDirection | '';
  depth: number;
  fromEntity: string;
  toEntity: string;
}

export interface ImpactColumnRow {
  key: string;
  fromColumns: string;
  toColumn: string;
  function?: string;
  direction: ImpactDirection;
  depth: number;
  fromEntity: string;
  toEntity: string;
}

interface TraversedEdge {
  from: string;
  to: string;
  depth: number;
  columnMappings: ColumnMapping[];
}

function traverse(model: LineageGraphModel, direction: ImpactDirection): TraversedEdge[] {
  const visited = new Set<string>([model.centerId]);
  const frontier: { id: string; depth: number }[] = [{ id: model.centerId, depth: 0 }];
  const walked: TraversedEdge[] = [];
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (!current) {
      break;
    }
    const nextEdges =
      direction === 'upstream'
        ? model.edges.filter((edge) => edge.target === current.id)
        : model.edges.filter((edge) => edge.source === current.id);
    for (const edge of nextEdges) {
      const nextId = direction === 'upstream' ? edge.source : edge.target;
      if (visited.has(nextId)) {
        continue;
      }
      visited.add(nextId);
      walked.push({
        from: edge.source,
        to: edge.target,
        depth: current.depth + 1,
        columnMappings: edge.columnMappings,
      });
      frontier.push({ id: nextId, depth: current.depth + 1 });
    }
  }
  return walked;
}

function nodeById(model: LineageGraphModel, id: string): LineageGraphNode | undefined {
  return model.nodes.find((node) => node.id === id);
}

export function impactEntityRows(model: LineageGraphModel, direction: ImpactDirection): ImpactEntityRow[] {
  return traverse(model, direction).map((edge) => {
    const nodeId = direction === 'upstream' ? edge.from : edge.to;
    const node = nodeById(model, nodeId);
    return {
      key: `${direction}:${edge.from}->${edge.to}`,
      name: node?.name ?? nodeId,
      displayName: node?.displayName ?? node?.name ?? nodeId,
      fullyQualifiedName: node?.fullyQualifiedName ?? nodeId,
      entityType: node?.entityType ?? '',
      direction,
      depth: edge.depth,
      fromEntity: edge.from,
      toEntity: edge.to,
    };
  });
}

export function impactColumnRows(model: LineageGraphModel, direction: ImpactDirection): ImpactColumnRow[] {
  return traverse(model, direction).flatMap((edge) =>
    edge.columnMappings.map((mapping, index) => ({
      key: `${direction}:${edge.from}->${edge.to}:${index}`,
      fromColumns: mapping.fromColumns.join(', '),
      toColumn: mapping.toColumn,
      function: mapping.function,
      direction,
      depth: edge.depth,
      fromEntity: edge.from,
      toEntity: edge.to,
    })),
  );
}

/** CSV columns: the official LINEAGE_EXPORT_HEADERS subset the product model can fill. */
export const LINEAGE_EXPORT_COLUMNS = [
  { key: 'displayName', title: 'Display Name' },
  { key: 'name', title: 'Name' },
  { key: 'fullyQualifiedName', title: 'Fully Qualified Name' },
  { key: 'entityType', title: 'Entity Type' },
  { key: 'direction', title: 'Direction' },
  { key: 'depth', title: 'Level' },
] as const;

export function impactRowsToCsv(rows: ImpactEntityRow[]): string {
  const escape = (value: unknown): string => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = LINEAGE_EXPORT_COLUMNS.map((column) => column.title).join(',');
  const lines = rows.map((row) =>
    LINEAGE_EXPORT_COLUMNS.map((column) => escape(row[column.key])).join(','),
  );
  return [header, ...lines].join('\n');
}
