/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type {
  Ontology,
  OntologyAxiom,
  OntologyConcept,
  OntologyExpression,
  OntologyProperty,
} from '@/types/ontology';

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
 * - utils/governance/ontology/OntologyStudioModel.utils.ts —
 *   getModelRelations / buildOntologyStudioGraph, the edge-set authority
 *   (ADR:2026-11-08-ontology-browser-edge-set).
 *
 * The Vue canvas renders this data with @antv/g6; a confirmed edge is never
 * a local-only graph mutation — the caller appends an ADD_RELATIONSHIP
 * change-set operation (see OntologyCanvasPanel), exactly the draft
 * mechanism E2 already wires through replaceOntologyChangeOperations.
 * Node dragging (G6 drag-element) only repositions nodes on the canvas;
 * positions are layout state, not ontology edits, and are never turned
 * into change-set operations.
 */

export type OntologyRelationKind =
  | 'subClassOf'
  | 'restriction'
  | 'objectProperty'
  | 'objectAssertion'
  | 'disjointWith'
  | 'equivalentClass';

export interface OntologyGraphNode {
  id: string;
  label: string;
  conceptType?: string;
  /** Owning ontology; the combo grouping and per-ontology open actions. */
  ontologyId?: string;
  ontologyFqn?: string;
  /** Display name of the owning ontology (combo label / tree sort group). */
  group?: string;
  /** Owning glossary, for glossary-scope nodes. */
  glossaryId?: string;
  fullyQualifiedName?: string;
  description?: string;
  /** No incident edge: rendered in the tree's unconnected section. */
  isolated?: boolean;
}

export interface OntologyGraphEdge {
  id: string;
  source: string;
  target: string;
  /** Relation kind (stable key for the tree builder and filters). */
  relationType: string;
  /** Display label (official getModelRelationLabel): 'isA' for subClassOf,
      the property label for restriction/objectProperty/objectAssertion. */
  label?: string;
}

export interface OntologyGraphData {
  nodes: OntologyGraphNode[];
  edges: OntologyGraphEdge[];
}

/** One ontology's working definitions, as the studio model loads them. */
export interface OntologyStudioModel {
  readonly ontology: Ontology;
  readonly concepts: readonly OntologyConcept[];
  readonly properties: readonly OntologyProperty[];
  readonly axioms: readonly OntologyAxiom[];
}

/** Named-axiom kinds that carry a display label (see RELATION_LABEL_BY_KIND). */
type NamedAxiomKind = Exclude<OntologyRelationKind, 'restriction' | 'objectProperty' | 'objectAssertion'>;

/** Official OntologyStudioModel.utils.ts: named-axiom kind mapping. */
const NAMED_AXIOM_KINDS: Partial<Record<string, NamedAxiomKind>> = {
  SUBCLASS_OF: 'subClassOf',
  DISJOINT_WITH: 'disjointWith',
  EQUIVALENT_CLASS: 'equivalentClass',
};

/** Official getModelRelationLabel: display label per named kind. */
const RELATION_LABEL_BY_KIND: Record<NamedAxiomKind, string> = {
  subClassOf: 'isA',
  disjointWith: 'disjointWith',
  equivalentClass: 'equivalentTo',
};

/** Official getIriLocalName: the IRI's last #- or /-separated segment. */
export function getIriLocalName(iri: string): string {
  const separator = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return separator >= 0 ? iri.slice(separator + 1) : iri;
}

/** Official humanizeName: camelCase/snake-case to lower-case words. */
export function humanizeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/** Official getPropertyLabel: displayName, else the humanized name. */
export function getPropertyLabel(property: OntologyProperty): string {
  return property.displayName || humanizeName(property.name);
}

/** Official getRelationPropertyLabel: property label, else humanized IRI. */
export function getRelationPropertyLabel(
  property: OntologyProperty | undefined,
  propertyIri?: string,
): string {
  if (property) {
    return getPropertyLabel(property);
  }
  return propertyIri ? humanizeName(getIriLocalName(propertyIri)) : '';
}

/**
 * Official restrictionOf: RESTRICTION expressions of an axiom whose filler
 * is a named class (the only restrictions that draw an edge).
 */
function restrictionOf(axiom: OntologyAxiom): Array<{ propertyIri: string; classIri: string }> {
  return (axiom.structuredExpressions ?? []).flatMap((expression) => {
    if (expression.kind !== 'RESTRICTION' || !expression.propertyIri) {
      return [];
    }
    const filler = expression.filler;
    if (filler?.kind !== 'NAMED_CLASS' || !filler.classIri) {
      return [];
    }
    return [{ classIri: filler.classIri, propertyIri: expression.propertyIri }];
  });
}

/** Official namedClassesOf: NAMED_CLASS expressions of an axiom. */
function namedClassesOf(axiom: OntologyAxiom): string[] {
  return (axiom.structuredExpressions ?? []).flatMap((expression: OntologyExpression) =>
    expression.kind === 'NAMED_CLASS' && expression.classIri ? [expression.classIri] : [],
  );
}

const restrictionKey = (fromId: string, propertyIri: string, toId: string): string =>
  `${fromId}|${propertyIri}|${toId}`;

export interface OntologyModelRelation {
  key: string;
  kind: OntologyRelationKind;
  fromId: string;
  toId: string;
  label: string;
}

/**
 * Official getModelRelations, ported: every concept-to-concept relation
 * the model asserts. Axiom enums are the spec values (SUBCLASS_OF,
 * OBJECT_PROPERTY_ASSERTION, …); property kind is the spec value
 * (OBJECT). Deleted axioms/properties assert nothing. A domain/range
 * pair already stated by a restriction draws no second edge.
 */
export function getModelRelations(model: OntologyStudioModel): OntologyModelRelation[] {
  const conceptByIri = new Map(model.concepts.map((concept) => [concept.iri, concept]));
  const propertyByIri = new Map(model.properties.map((property) => [property.iri, property]));
  const relations: OntologyModelRelation[] = [];
  const restrictedPairs = new Set<string>();

  for (const axiom of model.axioms) {
    const from = axiom.subjectIri ? conceptByIri.get(axiom.subjectIri) : undefined;
    if (!from || axiom.deleted) {
      continue;
    }
    if (axiom.axiomType === 'OBJECT_PROPERTY_ASSERTION' && axiom.propertyIri && axiom.targetIri) {
      const to = conceptByIri.get(axiom.targetIri);
      if (to) {
        relations.push({
          fromId: from.id,
          key: `assertion:${axiom.id}`,
          kind: 'objectAssertion',
          label: getRelationPropertyLabel(propertyByIri.get(axiom.propertyIri), axiom.propertyIri),
          toId: to.id,
        });
      }
    }
    const namedKind = axiom.axiomType ? NAMED_AXIOM_KINDS[axiom.axiomType] : undefined;
    if (namedKind) {
      namedClassesOf(axiom).forEach((classIri, index) => {
        const to = conceptByIri.get(classIri);
        if (to && to.id !== from.id) {
          relations.push({
            fromId: from.id,
            key: `axiom:${axiom.id}:${index}`,
            kind: namedKind,
            label: RELATION_LABEL_BY_KIND[namedKind],
            toId: to.id,
          });
        }
      });
    }
    if (axiom.axiomType === 'SUBCLASS_OF') {
      restrictionOf(axiom).forEach(({ classIri, propertyIri }, index) => {
        const to = conceptByIri.get(classIri);
        if (!to) {
          return;
        }
        restrictedPairs.add(restrictionKey(from.id, propertyIri, to.id));
        relations.push({
          fromId: from.id,
          key: `restriction:${axiom.id}:${index}`,
          kind: 'restriction',
          label: getRelationPropertyLabel(propertyByIri.get(propertyIri), propertyIri),
          toId: to.id,
        });
      });
    }
  }

  for (const property of model.properties) {
    if (property.kind !== 'OBJECT' || !property.iri) {
      continue;
    }
    for (const domainIri of property.domainIris ?? []) {
      const from = conceptByIri.get(domainIri);
      for (const rangeIri of property.rangeIris ?? []) {
        const to = conceptByIri.get(rangeIri);
        if (!from || !to || restrictedPairs.has(restrictionKey(from.id, property.iri, to.id))) {
          continue;
        }
        relations.push({
          fromId: from.id,
          key: `property:${property.id}:${from.id}:${to.id}`,
          kind: 'objectProperty',
          label: getRelationPropertyLabel(property, property.iri),
          toId: to.id,
        });
      }
    }
  }

  return relations;
}

/**
 * Build one ontology's graph from its full model: nodes carry the owning
 * ontology (combo grouping), edges are the official relation set plus
 * the superClasses hierarchy. The superClasses edge runs child ->
 * superclass (official direction: the subject of a subclass fact is the
 * child); it deduplicates against the axiom edge for the same fact, so a
 * model that asserts the subclass both ways still draws one edge.
 * Isolated nodes (no incident edge) are flagged for the tree's
 * unconnected section.
 */
export function buildOntologyModelGraph(model: OntologyStudioModel): OntologyGraphData {
  const group = model.ontology.displayName || model.ontology.name || undefined;
  const conceptById = new Map(model.concepts.map((concept) => [concept.id, concept]));
  const relations = getModelRelations(model);
  const edges: OntologyGraphEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (id: string, source: string, target: string, relationType: string, label: string): void => {
    if (!conceptById.has(source) || !conceptById.has(target) || source === target) {
      return;
    }
    const key = `${source}|${target}|${relationType}`;
    if (seenEdges.has(key)) {
      return;
    }
    seenEdges.add(key);
    edges.push({ id, label, relationType, source, target });
  };
  for (const relation of relations) {
    addEdge(relation.key, relation.fromId, relation.toId, relation.kind, relation.label);
  }
  for (const concept of model.concepts) {
    for (const superClass of concept.superClasses ?? []) {
      if (superClass.id) {
        addEdge(`${concept.id}->${superClass.id}:subClassOf`, concept.id, superClass.id, 'subClassOf', 'isA');
      }
    }
  }
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const nodes: OntologyGraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const concept of model.concepts) {
    if (!concept.id || nodeIds.has(concept.id)) {
      continue;
    }
    nodeIds.add(concept.id);
    nodes.push({
      conceptType: concept.conceptType,
      description: concept.description,
      fullyQualifiedName: concept.fullyQualifiedName,
      group,
      id: concept.id,
      isolated: !connected.has(concept.id),
      label: concept.displayName || concept.name || concept.fullyQualifiedName || concept.id,
      ontologyFqn: model.ontology.fullyQualifiedName || undefined,
      ontologyId: model.ontology.id || undefined,
    });
  }
  return { edges, nodes };
}

/**
 * Concepts-only graph (the studio canvas panel and glossary relations
 * callers): the model graph with no properties or axioms, so only the
 * superClasses hierarchy is drawn. Kept for the existing callers; the
 * browser aggregate uses buildOntologyModelGraph per ontology.
 */
export function buildOntologyGraphData(
  concepts: readonly OntologyConcept[],
  ontology?: Ontology,
): OntologyGraphData {
  return buildOntologyModelGraph({
    axioms: [],
    concepts,
    ontology: ontology ?? { id: '', name: '', owners: [], reviewers: [] },
    properties: [],
  });
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
 *   the pending relation; clicking the source again cancels the arm.
 * - confirmRelationType(type): consumes the pending relation and returns
 *   it, or null when nothing is pending.
 * - cancel(): clears arm + pending without emitting anything.
 *
 * The edit-mode flag is read through a getter on every transition
 * (ADR:2026-11-08-ontology-browser-canvas-stage-1): the canvas used to
 * capture it once at construction, so a studio lease that flips canEdit
 * false -> true after mount left arming silently dead. `reset()` clears
 * arm + pending; the canvas calls it when edit mode flips off.
 */
export function createGraphEditState(isEditMode: () => boolean): {
  armedFromId: () => string | null;
  pendingRelation: () => PendingGraphRelation | null;
  startArm: (fromId: string) => void;
  selectTarget: (toId: string) => void;
  cancel: () => void;
  reset: () => void;
  confirmRelationType: (relationType: string) => (PendingGraphRelation & { relationType: string }) | null;
} {
  let armedFromId: string | null = null;
  let pending: PendingGraphRelation | null = null;

  function cancel(): void {
    armedFromId = null;
    pending = null;
  }

  return {
    armedFromId: () => armedFromId,
    pendingRelation: () => pending,
    startArm(fromId: string): void {
      if (!isEditMode()) {
        return;
      }
      pending = null;
      armedFromId = fromId;
    },
    selectTarget(toId: string): void {
      if (!isEditMode() || armedFromId === null) {
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
    cancel,
    reset: cancel,
    confirmRelationType(relationType: string) {
      if (!isEditMode()) {
        return null;
      }
      const current = pending;
      pending = null;
      if (!current) {
        return null;
      }
      return { ...current, relationType };
    },
  };
}
