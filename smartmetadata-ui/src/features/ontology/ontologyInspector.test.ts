/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { OntologyConcept, OntologyProperty } from '@/types/ontology';
import {
  getConceptAncestorIds,
  getConceptAncestors,
  getConceptPropertyRows,
  getConceptRelationRows,
  getDatatypeLabel,
  relationRowLabel,
} from './ontologyInspector';
import type { OntologyModelRelation, OntologyStudioModel } from './ontologyGraph';

function concept(id: string, name: string, iri?: string): OntologyConcept {
  return {
    id,
    name,
    displayName: name,
    iri: iri ?? `https://example.com#${name}`,
    owners: [],
    superClasses: [],
    subClasses: [],
  };
}

function property(id: string, name: string, domainIris: string[], range?: string): OntologyProperty {
  return {
    id,
    name,
    displayName: name,
    iri: `https://example.com#${name}`,
    kind: 'Data',
    domainIris,
    range,
    deleted: false,
    owners: [],
  };
}

function relation(key: string, kind: OntologyModelRelation['kind'], fromId: string, toId: string): OntologyModelRelation {
  return { key, kind, fromId, toId, label: kind === 'subClassOf' ? 'isA' : kind };
}

describe('getConceptAncestorIds', () => {
  it('returns ancestors nearest first, without repeats or cycles', () => {
    const relations = [
      relation('r1', 'subClassOf', 'child', 'parent'),
      relation('r2', 'subClassOf', 'parent', 'grandparent'),
      relation('r3', 'subClassOf', 'child', 'other'),
      relation('r4', 'subClassOf', 'grandparent', 'child'),
    ];
    expect(getConceptAncestorIds(relations, 'child')).toEqual(['parent', 'other', 'grandparent']);
  });

  it('returns an empty list for a concept with no parents', () => {
    expect(getConceptAncestorIds([], 'root')).toEqual([]);
  });
});

describe('getConceptAncestors', () => {
  it('resolves ancestor ids to concepts and skips ids missing from the model', () => {
    const concepts = [concept('child', 'Child'), concept('parent', 'Parent')];
    const relations = [
      relation('r1', 'subClassOf', 'child', 'parent'),
      relation('r2', 'subClassOf', 'parent', 'missing'),
    ];
    expect(getConceptAncestors(relations, 'child', concepts).map((item) => item.id)).toEqual(['parent']);
  });
});

describe('getDatatypeLabel', () => {
  it('prefers range and falls back to the last segment of the first range IRI', () => {
    expect(getDatatypeLabel(property('p1', 'P1', [], 'string'))).toBe('string');
    const withIri = property('p2', 'P2', []);
    withIri.rangeIris = ['http://www.w3.org/2001/XMLSchema#integer'];
    expect(getDatatypeLabel(withIri)).toBe('integer');
    expect(getDatatypeLabel(property('p3', 'P3', []))).toBe('');
  });
});

describe('getConceptPropertyRows', () => {
  it('lists own properties first, then inherited ones once each', () => {
    const parent = concept('parent', 'Parent');
    const child = concept('child', 'Child');
    const model = {
      ontology: { id: 'o1', name: 'O1', owners: [] },
      concepts: [child, parent],
      properties: [
        property('p1', 'Own', [child.iri!]),
        property('p2', 'Inherited', [parent.iri!]),
        property('p3', 'Both', [child.iri!, parent.iri!]),
        property('p4', 'Other', ['https://example.com#Elsewhere']),
      ],
      axioms: [],
    } as unknown as OntologyStudioModel;
    const relations = [relation('r1', 'subClassOf', 'child', 'parent')];
    const rows = getConceptPropertyRows(model, relations, child);
    expect(rows.map((row) => row.property.id)).toEqual(['p1', 'p3', 'p2']);
    expect(rows[2]?.inheritedFrom?.id).toBe('parent');
    expect(rows[0]?.inheritedFrom).toBeUndefined();
  });
});

describe('getConceptRelationRows', () => {
  it('marks direction from the concept and names the other endpoint', () => {
    const relations = [
      relation('r1', 'subClassOf', 'child', 'parent'),
      relation('r2', 'disjointWith', 'sibling', 'child'),
      relation('r3', 'equivalentClass', 'a', 'b'),
    ];
    const rows = getConceptRelationRows(relations, 'child');
    expect(rows).toEqual([
      expect.objectContaining({ direction: 'outgoing', other: { id: 'parent', name: 'parent' } }),
      expect.objectContaining({ direction: 'incoming', other: { id: 'sibling', name: 'sibling' } }),
    ]);
  });
});

describe('relationRowLabel', () => {
  it('prefers the looked-up concept display name over the row name', () => {
    const rows = getConceptRelationRows([relation('r1', 'subClassOf', 'child', 'parent')], 'child');
    expect(relationRowLabel(rows[0]!, [concept('parent', 'Parent')])).toBe('Parent');
    expect(relationRowLabel(rows[0]!, [])).toBe('parent');
  });
});
