# Lineage canvas controls follow the pin overlay model; the invented toolbar, table view and open-asset buttons are removed

- **Status:** Accepted
- **Revisions:** v1 2026-11-25 (initial)
- **Deciders:** Bai's standing standard (2026-11-21 07:36 — when the pin is clear, decide by the pin; no separate ruling needed) + B-7(c) (2026-11-19 — capabilities official lacks are cleaned out). Deep-dive verification `~/workspace/work/verify-lineage-3-questions/REPORT.md` (2026-11-25 19:35) established all three questions as pin-decidable; the parent personally re-verified the decisive citations.
- **Guard:** reviewer + lane gate (affected vitest files, `tokens.test.ts`, `referencedKeys.test.ts`, vue-tsc against the 146 baseline, vite build, this checker); every change carries its pin citation in a code comment.
- **Related:** `~/workspace/work/verify-nav-lineage-3/REPORT.md` §3 (the §3c/§3d comparison tables are this batch's scope); upstream pin `a3012259ca`.

## Context

The product's lineage canvases grew a top toolbar (lens/rail text buttons,
Reload, Reset layout, find-node), a selection bar (Drill / Show fields /
Open asset), a "View only" badge, a third Table view, and a column-lineage
table below the diagram. Pin lays the same controls out as overlays on the
canvas itself, with two views and no selection bar. The rework remodels
the canvases to the pin layout and deletes the inventions with the change;
the node-detail drawer lands in the same batch, so there is no
transitional state in which a deleted button has no equivalent.

## Decision

- **Zoom cluster (both canvases).** Pin `LineageControlButtons.tsx` +
  `EntityLineageCanvas.tsx:341-347` (bottom-right Panel) and
  `LineageMap.component.tsx:2125-2134`: minimap toggle (`toggle-mind-map`,
  `aria-pressed`, tooltip "Mind Map") | zoom-in | `zoom-level` text
  (`Math.round(zoom * 100)%`) | zoom-out | fit-screen
  (`fitView({ padding: 0.2, maxZoom: 1 })`). It replaces the generic
  vue-flow `<Controls />`; the interactive lock disappears with it —
  pin has no such switch and nodes are draggable by default. Zoom range
  0.1–2.5 (`Lineage.constants.ts:27-28`), minimap default visible
  (`EntityLineageCanvas.tsx`, `showMiniMap` initial true).
- **Rail and layers as overlays.** Pin `LineageMap.component.tsx:784-880`
  (right rail, 138px track, dots `lineage-map-band-${stop}`, only the
  active label visible, deeper stop disabled when nothing is drillable
  per `isDeeperBand` at `:418`) and `:2133-2138` (layers Panel
  bottom-left). `LineageLayers.tsx`: scene menu is a single-select lens
  (Service / Domain / Data Product, each with title + description +
  checkmark, `lineage-layer-lens-${lens}`); asset menu is the multi-select
  overlays (Column, Observability) + one-at-a-time platform views. The
  top lens/rail button groups are deleted.
- **Breadcrumbs and status as overlays.** Pin
  `LineageMap.component.tsx:880-906` (breadcrumbs Panel top-left, null
  when the trail is empty) and `:936-1000` (status Panel top-right, null
  unless nodes are hidden, sampled, or errored; truncated notice
  `lineage-map-truncated-notice`, "Showing {{count}} of {{total}}
  assets"). The top nav row and level row are deleted.
- **Page header export/config are icon-only.** Pin
  `PlatformLineage.tsx:184-265` + `LineageExportButton.tsx`: PNG-only
  export, `data-testid="export-button"`, tooltip "Export as PNG"
  (`label.export-as-type` + PNG); config gear `lineage-config` opens the
  config modal (writes the store). The text buttons are deleted.
- **Node interaction follows the pin model.** Platform canvas: a body
  click drills directly (`LineageMap.component.tsx:1896-1908`, target
  exclusion `button, input, a, .react-flow__handle, .column-container`;
  `handleDrill :1349-1362`). Entity canvas: a click opens the drawer
  (`Lineage.tsx:1599-1621`). The node name is a link-style button
  (`LineageNodeLabelV1.tsx:180-191`) that opens the drawer; the node menu
  has exactly three items (`LineageNodeMenu.tsx`: Edit upstream / Edit
  downstream / Delete). The selection bar is deleted whole: Drill →
  body click, Show fields → rail FIELD stop, Open asset → drawer-header
  link.
- **Reload, "View only", Reset layout deleted.** Pin's only manual
  refresh is the error placeholder's retry
  (`LineageMap.component.tsx:2019`, `fetchScene(request, { bypassCache:
  true })`); "view only" is a comment plus `setCanEditLineage(false)` at
  `:1114`, with no rendered text anywhere; no reset-layout control exists
  in pin. The `canEditLineage=false` enforcement logic is kept — only the
  visible badge text is removed. The error retry is kept (the product
  error state retains its retry entry point).
- **Find-node moves to the entity tab header.** Pin
  `LineageSearchSelect.tsx`: options are all canvas nodes plus their
  columns (a column option shows node name › column name); node select
  opens the drawer and centers the node (`ZOOM_TRANSITION_DURATION`
  800); column select selects that column; the component returns null on
  the platform canvas (`:292-294`), so the platform canvas has no
  find-node. The platform page-header entity search is a different
  feature and is untouched.
- **Entity tab header follows CustomControls.** Pin
  `CustomControls.component.tsx:535-595` (filters button
  `filters-button` + search | tabs + time filter + export + config +
  fullscreen), `:460-535` (filter expansion: depth dropdown on the impact
  tab only, quick filters, single Clear all; the time filter and quick
  filters no longer sit always visible), `:440-460` (exactly two tabs,
  Lineage / Impact Analysis; `handleTabChange :259-270` writes the `mode`
  URL param and clears all filters), `:336-345` (export: impact tab →
  CSV async; lineage tab → PNG + CSV). Depth becomes a single-value
  dropdown "Node depth: N" writing the `depth` URL param; the two
  −/number/+ steppers are deleted. Fullscreen writes the `fullscreen`
  URL param.
- **Table view deleted.** Pin `EntityLineageTab.tsx:58-59,74`: the Impact
  tab itself is `LineageTable`; `LineageTable.tsx` reads `depth` from the
  URL itself (`:151-172`) and owns its own depth options. Pin has exactly
  two views; the `lineage-edge-table` (a flat list of the diagram's edges)
  duplicates both the diagram and the Impact table.
- **Column-lineage table below the diagram deleted (item 10).**
  Verified against the pin: a `columnMappings` grep over
  `EntityLineageCanvas.tsx` and `Lineage.tsx` returns zero hits — pin
  puts column mappings in the node cards and in `LineageTable`'s
  column-level view, and has no standalone column-mapping table below
  the canvas. Removed per B-7(c).
- **Node-detail drawer.** Pin `LineageOverlays.tsx:111-130`: a 576px
  slideout (`data-testid="lineage-entity-panel"`) rendering the entity
  summary panel in side-drawer mode; the drawer header renders the
  entity name as a detail-page link (`EntityTitleSection.tsx:177-182`,
  `data-testid="entity-link"`). The product has no `EntitySummaryPanel`,
  so the body is a compact summary fetched from the entity detail
  endpoint; a failed fetch only drops the summary, never the name/link.

## Deliberate deviations (product-shell adaptations, not pin behavior)

- Opening the filters does not force fullscreen (pin's
  `toggleFilterSelection` side-effect is deliberately not ported — the
  expansion renders inline with room).
- Fullscreen covers the viewport, not the content column: the product
  shell has no `.page-layout-v1-center` equivalent, so pin's
  `useFullScreenBounds` column measurement has nothing to measure.
- The open-full-page link is kept as tab/page navigation glue; it has no
  pin equivalent.
- Scene-menu items carry no icons, consistent with the product's
  icon-less asset menu.
- The search shows all options without pin's pagination.
- Find-node centers on the node center, not pin's top-left rendered
  position.
- The export chooser is a dropdown menu, not pin's export modal.
- The minimap toggle uses antd `PictureOutlined` for pin's map glyph;
  the zoom-cluster icons are the product's ant-design set.

## Consequences

- The deleted controls have no transitional state: the drawer (the
  "Open asset" equivalent) and the rail FIELD stop (the "Show fields"
  equivalent) land in the same batch as the deletions.
- URL shape is pin-shaped: `mode` (diagram / impact_analysis), `depth`,
  `fullscreen`, `dir`, `currentPage`, `pageSize` — the removed `table`
  mode no longer parses to a view.
- Two i18n keys were restored after the cleanup accidentally removed
  them while still referenced (`lineage.focus`, `lineage.fullscreen`,
  `lineage.exitFullscreen` in en-US); `referencedKeys.test.ts` guards
  against a repeat.
