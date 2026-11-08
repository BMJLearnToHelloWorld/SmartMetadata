# Ontology browser aggregate capacity guard: 2000 definitions, no silent truncation

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** W2-3 (G-18 stage 1)
- **Guard:** `ontologyAggregate.test.ts` (budget probe, mid-load guard, 404 tolerance)
- **Related:** REVIEW-W2-G18-S1.md condition 4; RULING-ontology-browser.md §4.1

## Context

The old browser page loaded one ontology's first 50 concepts. The stage-1
browser aggregates all ontologies (official
`useAllOntologyStudioModels`, pin `a3012259ca`,
`openmetadata-ui/src/main/resources/ui/src/hooks/governance/ontology/
useOntologyStudioModel.ts`). An unbounded aggregate would fetch and lay
out an arbitrarily large catalog, so official caps it and fails visibly.

## Decision

The product adopts official's budget verbatim:

- per-ontology page size 1000, at most 10 definition pages per ontology;
- at most 20 ontologies in the aggregate;
- at most 2000 definitions in the aggregate.
- Budget check first, via sequential limit:1 probes per ontology
  (concepts + properties + axioms in parallel); the summed
  `paging.total` decides. A missing total is an error, not a zero.
- During the sequential per-ontology loads, a running count throws
  `AggregateCapacityError` the moment it passes 2000 — even mid-load.
- Past the budget the page shows a capacity placeholder with
  per-ontology open actions; it never renders a truncated graph as if it
  were complete.
- An ontology deleted between the list and its definition requests (404)
  is skipped, not fatal (official `skipDeleted`).
- Scope lists (ontologies, glossaries) page at 100 with a 100-page cap
  (official `SCOPE_PAGE_SIZE` / `MAX_SCOPE_PAGES`).
- The all-glossaries scope fetches glossaries in batches of 8 with
  `Promise.allSettled`: one glossary failing must not fail the scope
  (official `fetchGraphDataFromDatabase`); graphs merge by node/edge id.

## Consequences

- Catalogs past the budget stay explorable one ontology at a time; the
  placeholder says so instead of silently dropping definitions.
- The 2000 cap also bounds the tree's full (non-windowed) render; if the
  cap ever rises, the tree must adopt official's windowed paging first.
- Live verification needs a catalog over the budget to see the
  placeholder; under it, the counts in the stats label must equal the
  API totals.
