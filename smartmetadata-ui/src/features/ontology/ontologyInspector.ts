/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { OntologyConcept, OntologyProperty } from '@/types/ontology';
import type {
  OntologyConceptPropertyRow,
  OntologyConceptRelationRow,
} from '@/types/ontologyDataGraph';
import {
  getPropertyLabel,
  getRelationPropertyLabel,
  type OntologyModelRelation,
  type OntologyStudioModel,
} from './ontologyGraph';

/**
 * Concept-inspector rows (official
 * utils/governance/ontology/OntologyStudioModel.utils.ts:
 * getConceptAncestors / getConceptPropertyRows / getConceptRelationRows),
 * ported against the product's relation shape (fromId/toId + kind/label,
 * see ontologyGraph.ts getModelRelations) instead of pin's
 * relation.from/to concept objects.
 *
 * - Ancestors: named superclasses, nearest first, without repeats or
 *   cycles (BFS over subClassOf relations, child -> parent).
 * - Property rows: data properties whose domain is the concept, then
 *   those it inherits from its superclasses; a property listed once.
 *   Pin matches on `property.domain?.includes(concept.iri)`; the product
 *   carries the full IRI arrays as domainIris (types/ontology.ts), so the
 *   match runs on domainIris with the single-string domain as fallback.
 * - Relation rows: every model relation touching the concept, with the
 *   other endpoint and the direction (outgoing = concept is the source).
 */

/**
 * Official getConceptAncestors. Pin's relations carry the parent concept
 * objects; the product's carry ids only, so the model's concepts are
 * passed for the lookup (an id with no concept in the model is skipped —
 * the model is the concept's whole world here).
 */
export function getConceptAncestors(
  relations: readonly OntologyModelRelation[],
  conceptId: string,
  concepts: readonly OntologyConcept[],
): OntologyConcept[] {
  const conceptById = new Map(concepts.map((item) => [item.id, item]));
  return getConceptAncestorIds(relations, conceptId).flatMap((id) => {
    const concept = conceptById.get(id);
    return concept ? [concept] : [];
  });
}

export function getConceptAncestorIds(
  relations: readonly OntologyModelRelation[],
  conceptId: string,
): string[] {
  const parentsOf = new Map<string, string[]>();
  relations
    .filter((relation) => relation.kind === 'subClassOf')
    .forEach((relation) => {
      parentsOf.set(relation.fromId, [...(parentsOf.get(relation.fromId) ?? []), relation.toId]);
    });
  const ancestors: string[] = [];
  const visited = new Set([conceptId]);
  let frontier = parentsOf.get(conceptId) ?? [];
  while (frontier.length > 0) {
    const next: string[] = [];
    frontier.forEach((parent) => {
      if (visited.has(parent)) {
        return;
      }
      visited.add(parent);
      ancestors.push(parent);
      next.push(...(parentsOf.get(parent) ?? []));
    });
    frontier = next;
  }
  return ancestors;
}

/** Official getDatatypeLabel (OntologyStudioModel.utils.ts). */
export function getDatatypeLabel(property: OntologyProperty): string {
  if (property.range) {
    return property.range;
  }
  const rangeIri = property.rangeIris?.[0];
  if (rangeIri) {
    return rangeIri.split(/[#/]/).pop() ?? rangeIri;
  }
  return '';
}

/** Official getConceptPropertyRows. */
export function getConceptPropertyRows(
  model: OntologyStudioModel,
  relations: readonly OntologyModelRelation[],
  concept: OntologyConcept,
): OntologyConceptPropertyRow[] {
  const dataProperties = model.properties.filter(
    (property) => property.kind === 'Data' && !property.deleted,
  );
  const domainMatches = (property: OntologyProperty, iri: string | undefined): boolean => {
    if (!iri) {
      return false;
    }
    if (property.domainIris?.length) {
      return property.domainIris.includes(iri);
    }
    return property.domain === iri;
  };
  const conceptById = new Map(model.concepts.map((item) => [item.id, item]));
  const own = dataProperties
    .filter((property) => domainMatches(property, concept.iri))
    .map((property) => ({
      datatype: getDatatypeLabel(property),
      property: {
        id: property.id,
        name: property.name,
        displayName: property.displayName,
        iri: property.iri,
        datatype: getDatatypeLabel(property),
      },
    }));
  const listed = new Set(own.map((row) => row.property.id));
  const inherited = getConceptAncestorIds(relations, concept.id).flatMap((ancestorId) => {
    const ancestor = conceptById.get(ancestorId);
    if (!ancestor) {
      return [];
    }
    return dataProperties
      .filter((property) => domainMatches(property, ancestor.iri) && !listed.has(property.id))
      .map((property) => {
        listed.add(property.id);
        return {
          datatype: getDatatypeLabel(property),
          inheritedFrom: {
            id: ancestor.id,
            name: ancestor.name,
            displayName: ancestor.displayName,
          },
          property: {
            id: property.id,
            name: property.name,
            displayName: property.displayName,
            iri: property.iri,
            datatype: getDatatypeLabel(property),
          },
        };
      });
  });
  return [...own, ...inherited];
}

/** Official getConceptRelationRows. */
export function getConceptRelationRows(
  relations: readonly OntologyModelRelation[],
  conceptId: string,
): OntologyConceptRelationRow[] {
  return relations.flatMap((relation): OntologyConceptRelationRow[] => {
    if (relation.fromId === conceptId) {
      return [
        {
          direction: 'outgoing',
          other: { id: relation.toId, name: relation.toId },
          relation: { key: relation.key, kind: relation.kind, label: relation.label },
        },
      ];
    }
    return relation.toId === conceptId
      ? [
          {
            direction: 'incoming',
            other: { id: relation.fromId, name: relation.fromId },
            relation: { key: relation.key, kind: relation.kind, label: relation.label },
          },
        ]
      : [];
  });
}

/** Display label for a relation row's other endpoint (concept lookup). */
export function relationRowLabel(
  row: OntologyConceptRelationRow,
  concepts: readonly OntologyConcept[],
): string {
  const concept = concepts.find((item) => item.id === row.other.id);
  return concept?.displayName || concept?.name || row.other.name;
}

/** Official getModelRelationLabel for a model relation (label passthrough). */
export function getModelRelationLabel(relation: OntologyModelRelation): string {
  return relation.label;
}

export { getPropertyLabel, getRelationPropertyLabel };
