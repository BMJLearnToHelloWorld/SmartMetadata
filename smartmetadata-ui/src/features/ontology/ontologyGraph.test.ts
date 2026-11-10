/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildOntologyGraphData,
  buildOntologyModelGraph,
  createGraphEditState,
  getModelRelations,
  HIERARCHICAL_RELATION_NAMES,
  type OntologyStudioModel,
} from './ontologyGraph';
import type { OntologyAxiom, OntologyConcept, OntologyProperty } from '@/types/ontology';

function concept(partial: Partial<OntologyConcept>): OntologyConcept {
  return {
    id: 'c1',
    name: 'Concept',
    owners: [],
    ...partial,
  } as OntologyConcept;
}

function property(partial: Partial<OntologyProperty>): OntologyProperty {
  return {
    id: 'p1',
    name: 'hasOrder',
    owners: [],
    ...partial,
  } as OntologyProperty;
}

function axiom(partial: Partial<OntologyAxiom>): OntologyAxiom {
  return {
    id: 'ax1',
    name: 'Axiom',
    owners: [],
    ...partial,
  } as OntologyAxiom;
}

function model(partial: Partial<OntologyStudioModel>): OntologyStudioModel {
  return {
    ontology: {
      id: 'o1',
      name: 'sales',
      displayName: 'Sales',
      fullyQualifiedName: 'sales',
      owners: [],
      reviewers: [],
    },
    concepts: [],
    properties: [],
    axioms: [],
    ...partial,
  };
}

const CUSTOMER_IRI = 'https://example.com/sales#Customer';
const PARTY_IRI = 'https://example.com/sales#Party';
const ORDER_IRI = 'https://example.com/sales#Order';
const HAS_ORDER_IRI = 'https://example.com/sales#hasOrder';

describe('buildOntologyGraphData', () => {
  it('maps superClasses to subClassOf edges from child to superclass and skips id-less refs', () => {
    const data = buildOntologyGraphData([
      concept({ id: 'child', name: 'Child', superClasses: [{ id: 'parent', name: 'Parent' }, { name: 'NoId' }] }),
      concept({ id: 'parent', name: 'Parent', displayName: 'Parent Display' }),
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['child', 'parent']);
    expect(data.nodes[1]?.label).toBe('Parent Display');
    // Official direction (ADR:2026-11-08-ontology-browser-edge-set): the
    // subClassOf edge runs from the subclass to the superclass, matching
    // getModelRelations and the studio draw-to-connect semantics. The
    // previous product direction (superclass -> subclass) was inverted.
    expect(data.edges).toEqual([
      { edgeKind: 'ontology', id: 'child->parent:subClassOf', label: 'isA', source: 'child', target: 'parent', relationType: 'subClassOf' },
    ]);
  });

  it('collapses duplicate super-class edges', () => {
    // The parent concept is a node here: an edge to a super-class that is
    // not a loaded concept draws nothing (official getModelRelations
    // resolves targets by IRI and skips unresolvable ones).
    const data = buildOntologyGraphData([
      concept({ id: 'child', name: 'Child', superClasses: [{ id: 'p', name: 'P' }, { id: 'p', name: 'P' }] }),
      concept({ id: 'p', name: 'P' }),
    ]);
    expect(data.edges).toHaveLength(1);
  });

  it('draws no edge for a super-class that is not a loaded concept', () => {
    const data = buildOntologyGraphData([
      concept({ id: 'child', name: 'Child', superClasses: [{ id: 'ghost', name: 'Ghost' }] }),
    ]);
    expect(data.edges).toEqual([]);
    expect(data.nodes[0]?.isolated).toBe(true);
  });
});

describe('getModelRelations', () => {
  const customer = concept({ id: 'c1', name: 'Customer', iri: CUSTOMER_IRI });
  const party = concept({ id: 'c2', name: 'Party', iri: PARTY_IRI });
  const order = concept({ id: 'c3', name: 'Order', iri: ORDER_IRI });

  it('derives named-axiom edges (subClassOf, disjointWith, equivalentClass) from IRI expressions', () => {
    const relations = getModelRelations(
      model({
        concepts: [customer, party, order],
        axioms: [
          axiom({
            id: 'ax-sub',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: PARTY_IRI }],
          }),
          axiom({
            id: 'ax-dis',
            axiomType: 'DISJOINT_WITH',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: ORDER_IRI }],
          }),
          axiom({
            id: 'ax-eq',
            axiomType: 'EQUIVALENT_CLASS',
            subjectIri: PARTY_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: ORDER_IRI }],
          }),
        ],
      }),
    );
    expect(relations).toEqual([
      { fromId: 'c1', key: 'axiom:ax-sub:0', kind: 'subClassOf', label: 'isA', toId: 'c2' },
      { fromId: 'c1', key: 'axiom:ax-dis:0', kind: 'disjointWith', label: 'disjointWith', toId: 'c3' },
      { fromId: 'c2', key: 'axiom:ax-eq:0', kind: 'equivalentClass', label: 'equivalentTo', toId: 'c3' },
    ]);
  });

  it('skips self-named classes, missing subjects/targets, and deleted axioms', () => {
    const relations = getModelRelations(
      model({
        concepts: [customer, party],
        axioms: [
          axiom({
            id: 'ax-self',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: CUSTOMER_IRI }],
          }),
          axiom({
            id: 'ax-gone-subject',
            axiomType: 'SUBCLASS_OF',
            subjectIri: 'https://example.com/sales#Ghost',
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: PARTY_IRI }],
          }),
          axiom({
            id: 'ax-gone-target',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: 'https://example.com/sales#Ghost' }],
          }),
          axiom({
            id: 'ax-deleted',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: PARTY_IRI }],
            deleted: true,
          }),
        ],
      }),
    );
    expect(relations).toEqual([]);
  });

  it('derives object-assertion edges with the property label', () => {
    const relations = getModelRelations(
      model({
        concepts: [customer, order],
        properties: [property({ id: 'p1', name: 'hasOrder', displayName: 'Has order', kind: 'OBJECT', iri: HAS_ORDER_IRI })],
        axioms: [
          axiom({
            id: 'ax-assert',
            axiomType: 'OBJECT_PROPERTY_ASSERTION',
            subjectIri: CUSTOMER_IRI,
            propertyIri: HAS_ORDER_IRI,
            targetIri: ORDER_IRI,
          }),
        ],
      }),
    );
    expect(relations).toEqual([
      { fromId: 'c1', key: 'assertion:ax-assert', kind: 'objectAssertion', label: 'Has order', toId: 'c3' },
    ]);
  });

  it('derives restriction edges and suppresses the domain/range pair they already state', () => {
    const hasOrder = property({
      id: 'p1',
      name: 'hasOrder',
      kind: 'OBJECT',
      iri: HAS_ORDER_IRI,
      domainIris: [CUSTOMER_IRI],
      rangeIris: [ORDER_IRI],
    });
    const relations = getModelRelations(
      model({
        concepts: [customer, order],
        properties: [hasOrder],
        axioms: [
          axiom({
            id: 'ax-restr',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [
              {
                kind: 'RESTRICTION',
                propertyIri: HAS_ORDER_IRI,
                restrictionKind: 'SOME',
                filler: { kind: 'NAMED_CLASS', classIri: ORDER_IRI },
              },
            ],
          }),
        ],
      }),
    );
    expect(relations).toEqual([
      { fromId: 'c1', key: 'restriction:ax-restr:0', kind: 'restriction', label: 'has order', toId: 'c3' },
    ]);
  });

  it('derives objectProperty edges from domain/range pairs with a humanized IRI label', () => {
    const relations = getModelRelations(
      model({
        concepts: [customer, order],
        properties: [
          property({
            id: 'p1',
            name: 'hasOrder',
            kind: 'OBJECT',
            iri: HAS_ORDER_IRI,
            domainIris: [CUSTOMER_IRI],
            rangeIris: [ORDER_IRI],
          }),
        ],
      }),
    );
    expect(relations).toEqual([
      { fromId: 'c1', key: 'property:p1:c1:c3', kind: 'objectProperty', label: 'has order', toId: 'c3' },
    ]);
  });

  it('ignores data properties and domain/range IRIs with no concept', () => {
    const relations = getModelRelations(
      model({
        concepts: [customer, order],
        properties: [
          property({
            id: 'p-data',
            name: 'age',
            kind: 'DATA',
            iri: 'https://example.com/sales#age',
            domainIris: [CUSTOMER_IRI],
            rangeIris: ['http://www.w3.org/2001/XMLSchema#integer'],
          }),
          property({
            id: 'p-ghost',
            name: 'ghostLink',
            kind: 'OBJECT',
            iri: 'https://example.com/sales#ghostLink',
            domainIris: ['https://example.com/sales#Ghost'],
            rangeIris: [ORDER_IRI],
          }),
        ],
      }),
    );
    expect(relations).toEqual([]);
  });
});

describe('buildOntologyModelGraph', () => {
  it('carries ontology ownership on nodes and flags isolated concepts', () => {
    const data = buildOntologyModelGraph(
      model({
        concepts: [
          concept({ id: 'c1', name: 'Customer', iri: CUSTOMER_IRI }),
          concept({ id: 'c2', name: 'Party', iri: PARTY_IRI }),
          concept({ id: 'c3', name: 'Lonely', iri: 'https://example.com/sales#Lonely' }),
        ],
        axioms: [
          axiom({
            id: 'ax-sub',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: PARTY_IRI }],
          }),
        ],
      }),
    );
    expect(data.nodes).toEqual([
      {
        conceptType: undefined,
        description: undefined,
        fullyQualifiedName: undefined,
        group: 'Sales',
        id: 'c1',
        isolated: false,
        label: 'Customer',
        ontologyFqn: 'sales',
        ontologyId: 'o1',
        originalLabel: 'Customer',
        type: 'ontologyConcept',
      },
      {
        conceptType: undefined,
        description: undefined,
        fullyQualifiedName: undefined,
        group: 'Sales',
        id: 'c2',
        isolated: false,
        label: 'Party',
        ontologyFqn: 'sales',
        ontologyId: 'o1',
        originalLabel: 'Party',
        type: 'ontologyConcept',
      },
      {
        conceptType: undefined,
        description: undefined,
        fullyQualifiedName: undefined,
        group: 'Sales',
        id: 'c3',
        isolated: true,
        label: 'Lonely',
        ontologyFqn: 'sales',
        ontologyId: 'o1',
        originalLabel: 'Lonely',
        type: 'ontologyConcept',
      },
    ]);
    expect(data.edges).toEqual([
      { edgeKind: 'ontology', id: 'axiom:ax-sub:0', label: 'isA', relationType: 'subClassOf', source: 'c1', target: 'c2' },
    ]);
  });

  it('collapses a superClasses edge into the axiom edge for the same fact', () => {
    const data = buildOntologyModelGraph(
      model({
        concepts: [
          concept({ id: 'c1', name: 'Customer', iri: CUSTOMER_IRI, superClasses: [{ id: 'c2', name: 'Party' }] }),
          concept({ id: 'c2', name: 'Party', iri: PARTY_IRI }),
        ],
        axioms: [
          axiom({
            id: 'ax-sub',
            axiomType: 'SUBCLASS_OF',
            subjectIri: CUSTOMER_IRI,
            structuredExpressions: [{ kind: 'NAMED_CLASS', classIri: PARTY_IRI }],
          }),
        ],
      }),
    );
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toEqual({
      edgeKind: 'ontology',
      id: 'axiom:ax-sub:0',
      label: 'isA',
      relationType: 'subClassOf',
      source: 'c1',
      target: 'c2',
    });
  });
});

describe('createGraphEditState', () => {
  it('arms, pends, and confirms a relation; self-click cancels', () => {
    const edit = createGraphEditState(() => true);
    edit.startArm('a');
    expect(edit.armedFromId()).toBe('a');
    edit.selectTarget('a');
    expect(edit.pendingRelation()).toBeNull();
    edit.startArm('a');
    edit.selectTarget('b');
    expect(edit.pendingRelation()).toEqual({ fromId: 'a', toId: 'b' });
    expect(edit.confirmRelationType('subClassOf')).toEqual({ fromId: 'a', toId: 'b', relationType: 'subClassOf' });
    expect(edit.pendingRelation()).toBeNull();
    expect(edit.confirmRelationType('isA')).toBeNull();
  });

  it('does not arm when edit mode is off and offers the official hierarchical names', () => {
    const edit = createGraphEditState(() => false);
    edit.startArm('a');
    expect(edit.armedFromId()).toBeNull();
    expect(HIERARCHICAL_RELATION_NAMES).toContain('subClassOf');
    expect(HIERARCHICAL_RELATION_NAMES).toHaveLength(9);
  });

  it('reads edit mode through the getter: a false -> true flip arms afterwards', () => {
    let mode = false;
    const edit = createGraphEditState(() => mode);
    edit.startArm('a');
    expect(edit.armedFromId()).toBeNull();
    mode = true;
    edit.startArm('a');
    expect(edit.armedFromId()).toBe('a');
    mode = false;
    edit.selectTarget('b');
    expect(edit.pendingRelation()).toBeNull();
    mode = true;
    edit.selectTarget('b');
    expect(edit.pendingRelation()).toEqual({ fromId: 'a', toId: 'b' });
  });

  it('reset clears arm and pending', () => {
    const edit = createGraphEditState(() => true);
    edit.startArm('a');
    edit.selectTarget('b');
    edit.reset();
    expect(edit.armedFromId()).toBeNull();
    expect(edit.pendingRelation()).toBeNull();
  });
});
