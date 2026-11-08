# Shared ontology canvas: read-only selection, handle, responsive size, and the construction-time edit-mode fix

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** W2-3 (G-18 stage 1)
- **Guard:** `OntologyGraphCanvas.test.ts` (flip regression, read-only selection, fit clamp) + studio regression suite
- **Related:** REVIEW-W2-G18-S1.md conditions 1, 2, 8; RULING-ontology-browser.md §4.3

## Context

The shared G6 canvas (`features/ontology/OntologyGraphCanvas.vue`) served the
studio only. Two defects blocked the browser stage 1:

1. **Construction-time capture.** `createGraphEditState(props.canEdit)` read
   `canEdit` once at setup. `OntologyCanvasPanel` mounts the canvas
   unconditionally while `canUseLease` is false at mount (lease + draft load
   async) and flips true later — but `edit.startArm` still read the captured
   false, so studio draw-to-connect was silently dead at runtime. The
   existing tests only covered static mount-time `canEdit: true/false`.
2. **No read-only behavior.** `onNodeClick` returned early when `!canEdit`,
   so a read-only click did nothing at all.

The canvas was also fixed at 900×520 with no handle, no combo grouping, no
search highlight, and no position retention across data refreshes.

## Decision

- Edit-mode is read through a getter on every state-machine transition
  (`createGraphEditState(() => props.canEdit)`; review option (b)). When
  `canEdit` flips false the canvas resets arm + pending; when it flips true
  it clears the read-only selection, so the two selection modes never
  overlap.
- Read-only selection is a separate path: node click selects
  (`select-node`), double-click opens the existing concept detail
  (`node-dblclick`), edge click selects the edge (`select-edge`, shown in
  the existing detail area as label/relationType + endpoint labels),
  canvas click clears. Edit-mode node clicks still run the arm state
  machine; read-only selection never fires in edit mode. View mode produces
  no write of any kind.
- Canvas click in edit mode cancels an armed/pending relation (selection
  clear, same as the read-only path).
- Handle (official `OntologyGraphHandle` minus export, which is stage 3):
  `fitView / zoomIn / zoomOut / runLayout / focusNode / getNodePositions`.
  `fitView` follows official `fitViewWithMinZoom` (fit, then clamp zoom to
  ≤ 1); `zoomIn/zoomOut` use `zoomBy(1.2 / 0.8, 100ms)`; zoom bounds are
  the official `MIN_ZOOM 0.001 / MAX_ZOOM 3`.
- Responsive size: the Graph is sized from the container's client size and
  a ResizeObserver keeps it in sync; the hardcoded 900×520 is gone.
  Layout stays dagre hierarchical only (stage 1).
- Node/edge/combo styles are rebuilt per product dev_ui token (#005587
  theme, token radii): concept nodes, isolated nodes (dashed, muted
  stroke), selected (primary stroke), search-dimmed (opacity). Combo boxes
  group nodes by owning ontology/glossary with a product-token stroke
  cycle. Asset/metric style branches do not exist yet: no asset or metric
  node occurs in stage 1 (data mode is stage 2), so no dead branch is
  added for them.
- Search highlight is applied through `updateNodeData`/`updateEdgeData`
  flag overrides (selected/dimmed), not a re-render: a full re-render
  would re-run the dagre layout.
- Node positions survive same-scope data refreshes: positions are saved
  before `setData` and restored with `updateNodeData` after render; a
  scope change re-runs the layout and fits the view. This is the stage-1
  approximation of official position snapshot/restore; full snapshot
  semantics remain a stage-3 residual (R-W18-6).
- The tree renders the full native index without official's windowed
  paging, because the aggregate is capped at 2000 definitions (see
  ADR:2026-11-08-ontology-browser-aggregate-capacity).
- Double-click on a glossary-scope term node does nothing in stage 1: the
  existing concept detail is ontology-concept only, and the term inspector
  is stage 2.
- Single-ontology stats reuse the graph counts (`{n} concepts ·
  {m} relations`); official returns an empty label without native stats,
  which the product has no source for.

## Consequences

- Studio arming works after the lease flips, covered by a flip regression
  test; the studio regression suite must stay green.
- The canvas API grows (highlight, scopeKey, selected ids, new emits);
  existing callers (`OntologyCanvasPanel`, glossary relations tab) are
  unaffected — they pass only graph + canEdit.
- The browser's graph and tree share one selection id; the concept detail
  still opens only from a double-click (or the existing table link).
