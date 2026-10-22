# Lineage visualization uses Vue Flow plus dagre against EntityLineage GET

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 3)
- **Guard:** `smartmetadata-ui` lineage client calls `GET /v1/lineage/{entity}/name/{fqn}`; reviewers reject imports from `openmetadata-ui` / `openmetadata-ui-core-components` and elkjs
- **Related:** `docs/rebuild/PHASE3.md`; ADR:2026-10-22-clean-room-vue-spa

## Context

Phase 3 needs an interactive upstream/downstream graph in the clean-room Vue
console. The historical React lineage canvas is Collate Community License. The
server already exposes `EntityLineage` on `LineageResource` with
`upstreamDepth` / `downstreamDepth` (0–3). elkjs is dual-licensed (EPL-2.0);
the rebuild map asked for Vue Flow and/or AntV G6, with dagre as the MIT
layout option.

## Decision

- Fetch `GET /api/v1/lineage/{entity}/name/{fqn}?upstreamDepth=&downstreamDepth=`.
  Do not use the search-backed `/getLineage` family for this page (those need a
  healthy lineage index and a different payload).
- Clamp depth to the resource bounds 0–3. Changing a depth control refetches.
- Map `entity` + `nodes` + UUID `upstreamEdges` / `downstreamEdges` in
  `smartmetadata-ui/src/lineage/graphModel.ts`. Accept either a UUID string or
  `{id}` on an edge endpoint.
- Layout left-to-right with **dagre** (`rankdir: LR`). Render with
  **@vue-flow/core** (pan/zoom, node click). No G6 in this phase.
- If `lineageDetails.columnsLineage` is present, show it as edge labels and a
  table. Do not invent a nested column-to-column canvas.
- Node click navigates to `/assets/:entityType/:fqn` when type and FQN exist.

## Consequences

Lineage UX stays Apache-friendly and independent of the CCL React graph. A
later phase can add impact analysis, edge editing, or search-lineage
pagination only with a new record. Switching to G6 or elkjs is a new decision.
