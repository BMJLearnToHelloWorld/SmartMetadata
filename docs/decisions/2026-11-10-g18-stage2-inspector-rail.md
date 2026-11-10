# G-18 stage 2: inspector rail, selection, and studio preselect

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Wave 3 review REVIEW-W3-G-STAGES.md §2.4 (G-18 stage 2, APPROVE + 16 conditions)
- **Guard:** `OntologyExplorerView.test.ts` (stage-1 cases still pass) + targeted inspector tests; live verification owed (see residuals)
- **Related:** ADR:2026-11-10-g18-stage2-data-mode; `~/workspace/work/wave3-g18-s2-logs/DESIGN.md` (D3, D4, D5, D6, D8, D9)

## Context

Stage 1 left the explorer as a single-surface graph: an edge click showed a
two-line stub card, a concept click opened the stage-1 detail tables, and
there was no health view, no inspector, no edge detail and no settings.
Pin puts all of these in one 320px right rail beside the graph (floating
bottom-right in the glossary scope), driven by a single selection, with the
concept inspector's Edit action gated on `useEntityPermissions` and
deep-linking to the studio.

## Decision

- **One rail, one selection** (`OntologyExplorerView.vue`): the graph is a
  flex row with a 320px right rail; exactly one of health / concept
  inspector / authoring inspector / entity panel / relation details is
  shown. The rail is hidden, not unmounted, when nothing is selected — the
  health panel is floating (absolute bottom-right) in glossary scopes and
  in the rail in native scopes. Panels are mutually exclusive by computed
  flags (`showHealth`, `showConceptInspector`, `showAuthoringInspector`,
  `showEntityPanel`).
- **Selection is a single funnel** (`onSelectNode`): selecting a node loads
  its details (full concept via `getOntologyConcept`, full term via
  `getGlossaryTerm`) under a generation token; a load failure leaves the
  inspector hidden silently — selection itself never fails. Deselecting
  clears the edge and vice versa. Edge ids follow pin exactly
  (`relation.id`; parent edges `parent-{parentId}-{termId}`; dedup on the
  sorted pair + relationType).
- **Concept inspector Edit is permission-gated** with the shared
  `useEntityPermissions('ontologyConcept')` from G-23 stage 4 (consumed,
  not rebuilt), fail-closed; Edit navigates to the studio with
  `?ontology=<id>`. The studio reads `route.query.ontology` on mount and
  preselects it when it is in the loaded page. There is no `?concept=`
  support — that is stage 3 (residual R-W3G18-S2-6).
- **No draft system in the product**: a node with `isDraft` falls back to
  the entity panel instead of the authoring inspector.
- **Authoring inspector** relationships come from graph edges, mappings
  from the full term, data assets via offset-paged
  `listGlossaryTermAssets` (total from the response paging). **Entity
  panel** covers data-asset nodes and single-glossary term nodes.
  **Relation details** are read-only (Source / Target / Provenance /
  Status / Created by / Created at); the inference sub-panel mounts only
  for inferred edges, gated on RDF status — an RDF failure makes the
  explanation unavailable, never a panel failure.
- **Double-click**: glossary-term nodes navigate to the term detail route
  (`governance-term`); concept nodes open the stage-1 concept detail
  (retained alongside the inspector, D4). Data-asset nodes in the native
  data mode navigate directly (pin's native-surface behavior); in the
  glossary data mode they open the entity panel.
- **Search is hidden in data mode** (pin hides it there too); the stage-1
  dblclick concept-detail card and its four tables are retained.

## Consequences

- The rail never shows two panels at once and never shows an empty 320px
  column: `showRail` excludes the floating glossary health panel.
- The inspector Edit path depends on the studio honoring `?ontology=`; if
  the query id is not in the loaded page the studio falls back to the first
  ontology, as before.
- Stage-1 live acceptance is still owed (≥2 ontologies with concepts +
  superClasses, ≥1 glossary with terms + relations, non-admin account for
  the E-D6 two-role check) — residual R-W3G18-S2-1. The inspector, health
  panel and data mode are likewise not live-verified — residuals
  R-W3G18-S2-2 / R-W3G18-S2-3.
- Out of scope, unchanged: the "Ontology Studio" label (A13), the extra
  sparql-playground menu entry (B2), the ai-context menu entry (B4).
