/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { OntologyConcept } from '@/types/ontology';

/**
 * G6 graph data + draw-to-connect edit state for the ontology canvas.
 *
 * Official prototypes (openmetadata-ui, in-tree reference):
 * - components/OntologyExplorer/OntologyGraphG6.tsx — the G6 canvas itself,
 *   fed by useGraphDataBuilder + useOntologyGraph (node/edge lists, layout,
 *   fit/zoom/export handles).
 * - components/OntologyExplorer/hooks/useOntologyGraphEdit.ts — the
 *   draw-to-connect gesture state machine: arm a source node, pick a target,
 *   confirm a relation type, then onCreateRelation(fromId, toId, type).
 * - components/OntologyExplorer/utils/relationshipTypeUtils.ts — the
 *   hierarchical relation names offered for a new edge.
 *
 * The Vue canvas renders this data with @antv/g6; a confirmed edge is never
 * a local-only graph mutation — the caller appends an ADD_RELATIONSHIP
 * change-set operation (see OntologyCanvasPanel), exactly the draft
 * mechanism E2 already wires through replaceOntologyChangeOperations.
 * Node dragging (G6 drag-element) only repositions nodes on the canvas;
 * positions are layout state, not ontology edits, and are never turned
 * into change-set operations.
 */

export interface OntologyGraphNode {
  id: string;
  label: string;
  conceptType?: string;
}

export interface OntologyGraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
}

export interface OntologyGraphData {
  nodes: OntologyGraphNode[];
  edges: OntologyGraphEdge[];
}

/** Hierarchical relation names, verbatim from official relationshipTypeUtils. */
export const HIERARCHICAL_RELATION_NAMES: readonly string[] = [
  'broader',
  'childOf',
  'hasPart',
  'isA',
  'narrower',
  'parentOf',
  'partOf',
  'subClassOf',
  'typeOf',
];

/**
 * Concepts -> G6 data. A concept's superClasses are hierarchy edges:
 * super -> concept with relationType 'subClassOf' (the concept is a
 * sub-class of each super class). Concepts without an id are skipped;
 * super-class refs without an id are skipped; duplicate edges collapse.
 */
export function buildOntologyGraphData(concepts: readonly OntologyConcept[]): OntologyGraphData {
  const nodes: OntologyGraphNode[] = [];
  const edges: OntologyGraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const concept of concepts) {
    if (!concept.id) {
      continue;
    }
    nodes.push({
      id: concept.id,
      label: concept.displayName || concept.name,
      conceptType: concept.conceptType,
    });
    for (const superClass of concept.superClasses ?? []) {
      if (!superClass.id) {
        continue;
      }
      const edgeId = `${superClass.id}->${concept.id}:subClassOf`;
      if (seenEdges.has(edgeId)) {
        continue;
      }
      seenEdges.add(edgeId);
      edges.push({ id: edgeId, source: superClass.id, target: concept.id, relationType: 'subClassOf' });
    }
  }
  return { nodes, edges };
}

export interface PendingGraphRelation {
  fromId: string;
  toId: string;
}

/**
 * Draw-to-connect state machine (port of official useOntologyGraphEdit,
 * pointer geometry removed: the Vue canvas arms on node click instead of
 * a port drag, because G6 node clicks are the reliable Vue-side signal).
 * - startArm(fromId): arm a source node (edit mode only).
 * - selectTarget(toId): with a source armed and a different target, opens
 *   the pending relation; clicking the source again cancels.
 * - confirmRelationType(type): consumes the pending relation and returns
 *   it, or null when nothing is pending.
 * - cancel(): clears arm + pending without emitting anything.
 */
export function createGraphEditState(isEditMode: boolean): {
  armedFromId: () => string | null;
  pendingRelation: () => PendingGraphRelation | null;
  startArm: (fromId: string) => void;
  selectTarget: (toId: string) => void;
  cancel: () => void;
  confirmRelationType: (relationType: string) => (PendingGraphRelation & { relationType: string }) | null;
} {
  let armedFromId: string | null = null;
  let pending: PendingGraphRelation | null = null;

  return {
    armedFromId: () => armedFromId,
    pendingRelation: () => pending,
    startArm(fromId: string): void {
      if (!isEditMode) {
        return;
      }
      pending = null;
      armedFromId = fromId;
    },
    selectTarget(toId: string): void {
      if (armedFromId === null) {
        return;
      }
      if (toId === armedFromId) {
        armedFromId = null;
        pending = null;
        return;
      }
      pending = { fromId: armedFromId, toId };
      armedFromId = null;
    },
    cancel(): void {
      armedFromId = null;
      pending = null;
    },
    confirmRelationType(relationType: string) {
      const current = pending;
      pending = null;
      if (!current) {
        return null;
      }
      return { ...current, relationType };
    },
  };
}
