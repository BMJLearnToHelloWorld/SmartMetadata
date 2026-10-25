# UI parity batch 2 step 1 — Lineage canvas thickening

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture and
interaction intent. No CCL React source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This batch thickens lineage only. No CRUD, no Collate-only Knowledge /
Ontology / AI pages.

## Official IA that this batch follows

Read-only paths (approaches, not source):

| Official surface | Path | Intent borrowed |
|---|---|---|
| Platform entry | `pages/PlatformLineage/PlatformLineage.tsx` | `/lineage` is a canvas-oriented entry: search an asset, navigate to `/lineage/{type}/{fqn}`. Type+FQN remains a fallback, not the primary chrome. |
| Entity tab | `components/Lineage/EntityLineageTab/EntityLineageTab.tsx` | Asset Lineage tab embeds the **same** graph host as the full page. |
| Canvas chrome | `components/Entity/EntityLineage/LineageControlButtons/*`, `CustomControls.component.tsx` | MiniMap, pan/zoom/fit, find-node-on-canvas, depth, fullscreen. |
| Node cards | `LineageNodeLabelV1.tsx` | Entity-type chip, display name, service/path breadcrumb, mapped-column count. |
| Column ports | `NodeChildren/*`, `EntityLineage.interface.ts` `isColumnLineage` | Column handles/edges only when the API already returned mappings. |

Intentionally **not** copied: React Flow widgets, Collate store, edit-lineage,
Impact Analysis table mode, time filter, PNG export, load-more, platform-wide
service graph (`getPlatformLineage`).

## What the product had

`LineageHomeView` = type+FQN form. `LineageView` + `LineageGraph` = Vue Flow +
dagre, fixed 560px, nodes not draggable, no MiniMap, column mappings only as a
table. Asset Lineage tab = neighbor tables only.

## Gap closed

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Platform entry | Search-entity select on an empty canvas | `LineageEntitySearch` uses existing `GET /v1/search/query`; empty dashed canvas; type+FQN stays as a secondary collapse | No platform-wide service/domain graph (product does not call `getPlatformLineage`) |
| Graph chrome | MiniMap + remaining viewport + drag | `@vue-flow/minimap` (MIT), `calc(100vh - …)` / tab 420px, nodes draggable, Controls kept, reset-layout re-runs dagre | No load-more (would need extra lineage count/expand APIs) |
| Node cards | Type, name, breadcrumb | Type chip, display name, `service / db / schema` path, truncated FQN | Official SVG glyphs / DQ badges skipped (no extra fetches) |
| Asset tab | Same `Lineage` host | `LineageCanvas` (same fetch + `LineageGraph`) at depth default 1, configurable 0–3; link to full page | Neighbor-only table removed — graph is the tab |
| Column lineage | Expandable ports + column edges | Ports and dashed handle-to-handle edges **only** for `lineageDetails.columnsLineage`; row click highlights those nodes/edges; table remains | No full table schema on a node (would need per-node entity GET). No column-lineage edit |
| Toolbar | Find node, depth, fullscreen | Canvas node select, existing 0–3 depth clamp, fullscreen overlay | Impact Analysis, time filter, PNG export skipped (not cheap on existing APIs) |
| i18n | Official catalogs | `lineage.*` keys in zh-CN / en-US | Other CRUD pages still English |

No new Java/Python endpoints.

## Residual (do not fake)

| Gap | Why it stays |
|---|---|
| Platform-wide service lineage on empty `/lineage` | Official calls a search-backed platform lineage API this product does not expose/use |
| Load-more nodes per layer | Official uses `nodesPerLayer` + extra expand calls; GET depth 0–3 is the honest cap |
| Impact Analysis table / time filter / PNG export | Explicitly out of this step; no product client for the first two |
| Full column list on every node | Lineage GET returns mappings, not each table’s schema |
| Edit lineage / pipeline edge editor | No create/patch lineage wiring in this batch |
| Knowledge / Ontology / AI lineage layers | Collate-only **DROP** |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Open Lineage. Confirm search-to-open + empty canvas, not a bare FQN form.
2. Search a table (or use Open by type and FQN) and land on the graph.
3. Confirm MiniMap, drag, find-node, depth 0–3, fullscreen.
4. If `columnsLineage` is present, expand “mapped columns” and confirm dashed
   column edges; click a mapping row to highlight. If absent, no fake ports.
5. Open a table → Lineage tab: same graph, link to the full page.
