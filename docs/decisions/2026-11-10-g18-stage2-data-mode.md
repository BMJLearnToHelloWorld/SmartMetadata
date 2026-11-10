# G-18 stage 2: ontology data mode is a state machine with a card renderer

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Wave 3 review REVIEW-W3-G-STAGES.md §2.4 (G-18 stage 2, APPROVE + 16 conditions)
- **Guard:** `OntologyNativeDataMode.test.ts` + `OntologyDataGraph.test.ts` (targeted); live verification owed (see residuals)
- **Related:** ADR:2026-11-10-g18-stage2-inspector-rail; `~/workspace/work/wave3-g18-s2-logs/DESIGN.md` (D1, D2, D7, D10)

## Context

Pin's ontology data mode is not a view over the model graph: it is a separate
fetching machine (`useOntologyNativeDataGraph`, 590 lines) that pages clusters,
bindings and topology one request at a time, chained on the `loaded` context of
the previous page, with explicit 400-invalid / 412-stale handling, and a
separate card-based renderer (`OntologyDataGraph`, 1728 lines, no G6). The
glossary scope has its own data endpoint (`GET /glossaryTerms/ontology/data`)
with seed paging (12), asset preview (4), connected-term limit (48) and edge
limit (100). Approximating this as "the model graph with assets attached"
would silently drop the paging contract, the stale/invalid recovery paths and
the lineage-join rendering the review conditioned stage 2 on.

## Decision

- **Native data mode is a state machine** (`useNativeOntologyDataGraph.ts`):
  one request at a time; clustersPlan / reloadPlan paging chained on `loaded`;
  topology drained via `after`; stale (412) → ONE auto-reload per generation
  then fail `RELOAD`; invalid (400) → one plan restart then fail `RELOAD`;
  restore targets survive reloads; binding-write reload keeps the graph;
  retry is by failure kind (`stale` vs `unavailable`).
- **Glossary data mode pages seeds** (`loadDataModeTerms` in
  `OntologyExplorerView.vue`): `limit: 12, offset`, asset preview 4,
  connected-term limit 48, edge limit 100; pages merge into one graph
  (dedup by node/edge id). Tagged-with load-more fetches
  `getGlossaryTermAssets(termId, size, offset)` with `size = min(100,
  max(1, 6))` and numeric `offset` (the endpoint has no `after` cursor);
  asset nodes reuse `ontologyAssetNode` (bare asset id) and tagged-with
  edges reuse the builder's exact id (`{assetId}|{termId}|tagged-with`,
  asset → term, `edgeKind: 'assetBinding'`).
- **Renderer is card-based, no G6** (`OntologyDataGraph.vue`): clusters as
  cards, asset rows, lineage chips; one shared edge per card pair from a pure
  `lineageConnectors` computed (rows when both endpoints render, else cards);
  collapsed preview 3 (glossary) / 4 (native); native rows scroll at
  max-h 256; connector positions come from measured DOM rects via
  ResizeObserver.
- **Health summary** (`getOntologySummary`, `GET
  /glossaryTerms/ontology/summary`): glossary scopes compose the endpoint
  summary; on endpoint failure the panel falls back to health derived from
  the model graph and hydrates only isolated terms whose label is still
  their id, via `getGlossaryTermsByIds`. Native scopes always derive health
  from the graph.
- **Graph settings** are exactly layout (Hierarchical | Circular) + edge
  labels, mounted only in the single-glossary scope toolbar; Hierarchical
  → dagre TB, Circular → circular; layout change remounts the canvas,
  label-only change syncs element styles. No settings UI in the
  all-glossaries scope (pin has none), but the state still applies there.
- **Data pagination card** renders below the data graph (flow layout), not
  as pin's absolute bottom-left overlay — the product graph has no overlay
  container. Non-global glossary scope only.

## Consequences

- The data mode cannot drift into a model-graph view: the machine and the
  renderer are separate modules with their own tests.
- The summary/data-graph field mapping is taken from pin's spec JSONs
  (ontologySummary.json, ontologyDataGraph.json) and is **not yet
  live-verified** — recorded as residual R-W3G18-S2-2; live verification
  must run before the mapping is trusted.
- The 412/400 recovery paths are unit-tested against mocked statuses, not
  against a live server — residual R-W3G18-S2-3.
