/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { OntologyGraphData, OntologyGraphNode } from './ontologyGraph';
import { normalizeSearchText } from './ontologySearchHighlight';

/**
 * Native tree index (official components/OntologyExplorer/
 * OntologyStudio.utils.ts: buildNativeTreeIndex / buildParentMap /
 * nativeTreeRoots, Vue port). The tree renders from the same graph model
 * as the canvas (E-D5): hierarchy from sub/superClass edges, isolated
 * concepts listed separately, one row per node.
 *
 * Stage-1 simplification, recorded here rather than hidden: official
 * renders the index through windowed pages (NATIVE_TREE_WINDOW_SIZE);
 * the product renders the full index because the aggregate is capped at
 * 2000 definitions (ADR:2026-11-08-ontology-browser-aggregate-capacity),
 * so no window is needed.
 */
export interface OntologyTreeIndex {
  nodes: ReadonlyMap<string, OntologyGraphNode>;
  parents: ReadonlyMap<string, readonly string[]>;
  children: ReadonlyMap<string, readonly string[]>;
  roots: readonly string[];
  relationCounts: ReadonlyMap<string, number>;
  /** Nodes with no incident edge (relationCount === 0). */
  isolatedIds: readonly string[];
}

export interface OntologyTreeRow {
  node: OntologyGraphNode;
  depth: number;
  parentCount: number;
  relationCount: number;
  isIsolated: boolean;
}

/** Official normalizeRelationType: lower-case, alphanumerics only. */
function normalizeRelationType(relationType: string): string {
  return relationType.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Official buildParentMap: hierarchical relation names by edge direction.
 * The inverse of a child-to-parent relation points from the parent, so it
 * must not make the parent a child.
 */
const PARENT_TO_CHILD_RELATIONS = new Set(['parentof', 'narrower', 'haspart', 'superclassof']);
const CHILD_TO_PARENT_RELATIONS = new Set(['broader', 'isa', 'subclassof']);

function buildParentMap(
  graphData: OntologyGraphData,
  termIds: Set<string>,
  hierarchicalRelationNames: readonly string[],
): Map<string, Set<string>> {
  const parentMap = new Map<string, Set<string>>();
  const hierarchicalTypes = new Set(hierarchicalRelationNames.map(normalizeRelationType));
  const addParent = (childId: string, parentId: string): void => {
    const parents = parentMap.get(childId) ?? new Set<string>();
    parents.add(parentId);
    parentMap.set(childId, parents);
  };
  for (const edge of graphData.edges) {
    if (!termIds.has(edge.source) || !termIds.has(edge.target)) {
      continue;
    }
    const relationType = normalizeRelationType(edge.relationType);
    if (PARENT_TO_CHILD_RELATIONS.has(relationType)) {
      addParent(edge.target, edge.source);
    } else if (CHILD_TO_PARENT_RELATIONS.has(relationType) || hierarchicalTypes.has(relationType)) {
      addParent(edge.source, edge.target);
    }
  }
  return parentMap;
}

function visitNativeTree(
  id: string,
  children: ReadonlyMap<string, readonly string[]>,
  visited: Set<string>,
  finished: string[],
): void {
  const stack = [{ id, next: 0 }];
  visited.add(id);
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const child = children.get(frame.id)?.[frame.next++];
    if (child === undefined) {
      finished.push(frame.id);
      stack.pop();
    } else if (!visited.has(child)) {
      visited.add(child);
      stack.push({ id: child, next: 0 });
    }
  }
}

function nativeTreeComponent(
  id: string,
  number: number,
  parents: ReadonlyMap<string, readonly string[]>,
  component: Map<string, number>,
  compare: (a: string, b: string) => number,
): string {
  const pending = [id];
  let representative = id;
  component.set(id, number);
  for (let position = 0; position < pending.length; position++) {
    const current = pending[position]!;
    if (compare(current, representative) < 0) {
      representative = current;
    }
    for (const parent of parents.get(current) ?? []) {
      if (!component.has(parent)) {
        component.set(parent, number);
        pending.push(parent);
      }
    }
  }
  return representative;
}

function nativeTreeRoots(
  nodes: ReadonlyMap<string, OntologyGraphNode>,
  parents: ReadonlyMap<string, readonly string[]>,
  children: ReadonlyMap<string, readonly string[]>,
  compare: (a: string, b: string) => number,
): string[] {
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const id of nodes.keys()) {
    if (!visited.has(id)) {
      visitNativeTree(id, children, visited, finished);
    }
  }
  const component = new Map<string, number>();
  const representatives: string[] = [];
  for (const id of finished.reverse()) {
    if (!component.has(id)) {
      representatives.push(nativeTreeComponent(id, representatives.length, parents, component, compare));
    }
  }
  const incoming = new Set<number | undefined>();
  parents.forEach((owners, child) =>
    owners.forEach((parent) => {
      if (component.get(child) !== component.get(parent)) {
        incoming.add(component.get(child));
      }
    }),
  );
  const roots = [...nodes.keys()].filter((id) => !parents.get(id)?.length);
  const rootIds = new Set(roots);
  return [
    ...roots,
    ...representatives
      .filter((id, number) => !incoming.has(number) && !rootIds.has(id))
      .sort(compare),
  ];
}

/**
 * Official buildNativeTreeIndex: terms sorted by (group, label, id);
 * parents restricted to the same group (same ontology / same glossary);
 * children derived from parents; roots from nativeTreeRoots (a parent
 * cycle still yields a representative root instead of vanishing);
 * relationCounts count incident edges, deduplicated by edge id.
 */
export function buildOntologyTreeIndex(
  graphData: OntologyGraphData | null,
  hierarchicalRelationNames: readonly string[] = [],
): OntologyTreeIndex {
  const terms = (graphData?.nodes ?? []).slice().sort(
    (left, right) =>
      (left.group ?? '').localeCompare(right.group ?? '') ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
  const nodes = new Map(terms.map((node) => [node.id, node]));
  const ids = new Set(nodes.keys());
  const parentMap = graphData ? buildParentMap(graphData, ids, hierarchicalRelationNames) : new Map<string, Set<string>>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const rank = new Map(terms.map((node, position) => [node.id, position]));
  const compare = (left: string, right: string): number => (rank.get(left) ?? 0) - (rank.get(right) ?? 0);
  for (const node of terms) {
    parents.set(
      node.id,
      [...(parentMap.get(node.id) ?? [])]
        .filter((id) => {
          const parent = nodes.get(id);
          return (
            parent &&
            (parent.glossaryId ?? parent.group) === (node.glossaryId ?? node.group)
          );
        })
        .sort(compare),
    );
    children.set(node.id, []);
  }
  for (const [child, owners] of parents) {
    for (const parent of owners) {
      children.get(parent)?.push(child);
    }
  }
  const roots = nativeTreeRoots(nodes, parents, children, compare);
  const relationCounts = new Map<string, number>();
  const seenEdgeIds = new Set<string>();
  for (const edge of graphData?.edges ?? []) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      continue;
    }
    if (edge.id) {
      if (seenEdgeIds.has(edge.id)) {
        continue;
      }
      seenEdgeIds.add(edge.id);
    }
    relationCounts.set(edge.source, (relationCounts.get(edge.source) ?? 0) + 1);
    relationCounts.set(edge.target, (relationCounts.get(edge.target) ?? 0) + 1);
  }
  const isolatedIds = terms
    .filter((node) => (relationCounts.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  return { children, isolatedIds, nodes, parents, relationCounts, roots };
}

/**
 * Depth-ordered rows for the tree view: each root's subtree follows it,
 * depth counts ancestors inside the group, and rows on a parent cycle
 * that hang from no root are still listed (official orderAsTree).
 */
export function orderTreeRows(index: OntologyTreeIndex): OntologyTreeRow[] {
  const rows: OntologyTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (id: string, depth: number): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const node = index.nodes.get(id);
    if (!node) {
      return;
    }
    const relationCount = index.relationCounts.get(id) ?? 0;
    rows.push({
      depth,
      isIsolated: relationCount === 0,
      node,
      parentCount: index.parents.get(id)?.length ?? 0,
      relationCount,
    });
    for (const child of index.children.get(id) ?? []) {
      visit(child, depth + 1);
    }
  };
  for (const root of index.roots) {
    visit(root, 0);
  }
  for (const id of index.nodes.keys()) {
    if (!visited.has(id)) {
      visit(id, 0);
    }
  }
  return rows;
}

/**
 * Search filter for the tree: visible ids are the matches (id/label/FQN/
 * description, NFD-normalized substring) plus their ancestor chains, so
 * the hierarchy stays navigable. Children of a match are not
 * auto-included; the tree keeps its expand/collapse state for them.
 */
export function filterTreeIndexForSearch(index: OntologyTreeIndex, rawQuery: string): Set<string> {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query) {
    return new Set(index.nodes.keys());
  }
  const matches = new Set<string>();
  const textMatches = (value: string | undefined): boolean =>
    !!value && normalizeSearchText(value).includes(query);
  for (const node of index.nodes.values()) {
    if (
      textMatches(node.id) ||
      textMatches(node.label) ||
      textMatches(node.fullyQualifiedName) ||
      textMatches(node.description)
    ) {
      matches.add(node.id);
    }
  }
  const visible = new Set<string>(matches);
  const queue = [...matches];
  while (queue.length) {
    const id = queue.pop()!;
    for (const parent of index.parents.get(id) ?? []) {
      if (!visible.has(parent)) {
        visible.add(parent);
        queue.push(parent);
      }
    }
  }
  return visible;
}
