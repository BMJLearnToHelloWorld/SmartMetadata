# Ontology browser edge set follows official getModelRelations, plus superClasses

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** W2-3 (G-18 stage 1)
- **Guard:** `ontologyGraph.test.ts` (edge-kind coverage) + `OntologyGraphCanvas.test.ts`
- **Related:** REVIEW-W2-G18-S1.md condition 3; RULING-ontology-browser.md §4.2

## Context

The product graph builder only drew `superClasses` edges. Official
`getModelRelations` (pin `a3012259ca`,
`openmetadata-ui/src/main/resources/ui/src/utils/governance/ontology/
OntologyStudioModel.utils.ts`, from line 212) derives the edge set from
the model:

- named axioms: `SUBCLASS_OF → subClassOf`, `DISJOINT_WITH →
  disjointWith`, `EQUIVALENT_CLASS → equivalentClass`, one edge per
  `NAMED_CLASS` expression, target resolved by IRI;
- `OBJECT_PROPERTY_ASSERTION` axioms: `objectAssertion` edges
  (subject → target IRI, key `assertion:<axiom id>`);
- `SUBCLASS_OF` axioms with `RESTRICTION` expressions whose filler is a
  named class: `restriction` edges (key `restriction:<axiom id>:<index>`);
- object properties (`kind: OBJECT`): `objectProperty` edges for every
  domain × range IRI pair **not** already stated by a restriction
  (dedup key `from|propertyIri|to`, key
  `property:<property id>:<from id>:<to id>`).

Edge labels are official `getModelRelationLabel`: `isA` for subClassOf,
`disjointWith`, `equivalentTo`, and the property label (displayName or
humanized IRI local name) for restriction/objectProperty/objectAssertion.
Deleted axioms and properties assert nothing. Enum values are the spec
values (`SUBCLASS_OF`, `OBJECT`, `NAMED_CLASS`, `RESTRICTION`), not the
camelCase forms some product fixtures used.

## Decision

The stage-1 edge set is the official set above, plus the product's
`superClasses` hierarchy (official reads hierarchy from axioms only, but
the product also carries it as concept fields, and an axiom-free model
would otherwise draw no hierarchy at all):

- `subClassOf`, `restriction`, `objectProperty`, `objectAssertion`,
  `disjointWith`, `equivalentClass`.
- A `superClasses` edge and the axiom edge for the same subclass fact
  collapse into one edge (dedup key `source|target|kind`).
- Direction is official: a `subClassOf` edge runs from the subclass
  (subject) to the superclass. The previous product direction
  (superclass → subclass) was inverted against both official
  `getModelRelations` and the studio's own draw-to-connect semantics
  (armed node = subclass, target = superclass), and is corrected in this
  batch; the existing unit test is retargeted at the same strength.
- `relationType` on an edge is the stable kind; `label` is the display
  label. The tree builder keys off the kind (see the native tree index).
- To feed the builder, the API mapper keeps the structured data the old
  mapper dropped: `OntologyAxiom.structuredExpressions` (typed OWL class
  expressions) and `deleted`, `OntologyProperty.domainIris/rangeIris`
  (full IRI arrays; the single-string `domain`/`range` stay as the
  table's display values). Domain/range resolve by IRI only — a
  display-name domain never draws an edge.

## Consequences

- Graphs now show axiom and property edges the old builder never drew;
  models without axioms still show hierarchy via `superClasses`.
- The `superClasses` direction change is a behavior correction, not a
  regression: any caller reading edge direction (tree builder, canvas
  confirm flow) now agrees with official.
- Asset projection edges (`tagged-with`) are data mode and stay out of
  stage 1; `getOntologySummary` / `getOntologyDataGraph` clients are not
  written (stage 2).
