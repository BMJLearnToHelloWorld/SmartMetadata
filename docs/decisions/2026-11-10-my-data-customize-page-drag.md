# The customize-page drag is self-built (B-5 (b)), grid-layout-plus is the named fallback

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Wave 3 G-stages review (G-11 stage D, APPROVE + 14 conditions)
- **Guard:** `src/features/home/CustomizeMyData.test.ts` (drag reflows the layout live; save/reset/leave flows) + live drag verification at deploy time
- **Related:** `docs/decisions/2026-11-07-my-data-layout-normalization-five-params.md`, `docs/decisions/2026-11-08-my-data-greeting-header-home-hero-merge.md`

## Context

The official customize page lays the persona home page out with `react-grid-layout` (RGL): 2 columns, uniform widget height 3, no resize, a drag handle per widget (`.drag-widget-icon`), `verticalCompact`, `preventCollision=false`, `compactType="horizontal"`, and a live reflow on every drag. The product has no grid library and no RGL equivalent in its dependency tree. The Wave 3 review decided B-5 in-review: (b) a self-built light drag, with `grid-layout-plus` as the named fallback if the self-built drag cannot match RGL behaviour in the batch's own spike.

## Decision

Stage D ships the self-built drag:

- The editor grid is a plain 2-column CSS grid (`grid-auto-rows: 133.33px`, gap 16px). The only draggable node is the card's `.drag-widget-icon` handle (pointer-only, not focusable). A `dragover` computes the target cell from the pointer position against the grid rect and reflows live through `getLayoutUpdateHandler` — the same handler pin's grid feeds (map the new coordinates, force `w` constrained and `h: 3`, then repack with the placeholder at the end). There is no row clamp: a far drag is normalized by the repack, not by an RGL-style `maxRows` (placeholder `y + 3`).
- No resize: every widget is uniform `h: 3`, exactly as pin's `getWidgetHeight` returns 3 for every widget name.
- The spike verdict is the batch's own unit tests (`landingPageEditor.test.ts`: placement, add/remove/placeholder/repack, the placeholder-position preservation quirk asserted as-is) plus the editor drag test (`CustomizeMyData.test.ts`: a drag swaps the two widgets' columns through the live reflow). Live verification of a real pointer drag is still owed at deploy time; if it shows the self-built drag cannot match RGL behaviour, the fallback is `grid-layout-plus`, and the switch — and why — is recorded in a new revision of this record.

Everything else in the editor follows pin exactly: save writes the filtered layout (`getUniqueFilteredLayout`, placeholder never persisted) via `savePersonaDocument` (PATCH when the document has an id, POST otherwise); reset restores the default layout, clears the header colour, and saves with NO page argument, which removes the LandingPage entry; leaving with unsaved changes asks first (Save and exit / Discard / Cancel) via `onBeforeRouteLeave` + `beforeunload`; save errors stay on the page. The page save swallows errors (toast only); the app-layout save throws — pin's asymmetry, preserved.

## Consequences

- The editor adds no new dependency. The drag behaviour is defined by `landingPageEditor.ts`, which is ported function-for-function from pin's `CustomizableLandingPagePureUtils.ts`, so the layout math is testable without a browser.
- Known deltas from RGL, accepted in this batch: no resize handle; reflow is repack-based (a drag to a far row collapses back when the widgets still fit one row) instead of RGL's collision push; no `maxRows` clamp. If any of these proves wrong in live use, the fallback above applies.
- Residuals recorded in this batch:
  - **R-W3G11D-1** (header colour): pin has NO production home-page consumer for the saved header colour — stage D writes it and previews it in the editor modal (official behaviour). Tinting the home header would be a product invention needing its own ADR; it is not done.
  - **R-W3G11D-2** (picker list): pin fetches KnowledgePanel seed docs and filters through the registry allowlist; the product's registry IS the allowlist, so the modal lists `MY_DATA_WIDGET_OPTIONS` directly — same 13 entries, no network round-trip.
  - **R-W3G11D-3** (modal sidebar): pin's modal lists each widget FQN in a sidebar as a scroll-to item; the product modal is two tabs with a plain 13-item list.
  - **R-W3G11D-4** (collapse toggle): pin says the whole header strip is the collapse control; the product toggles from the chevron button + title area only, so clicks on header controls (e.g. the Total Assets range select in `#extra`) are never swallowed.
  - **R-W3G11D-5** (list mode): the view model keeps pin's exact `y = index` for list mode; the renderer auto-places list cells (`gridRow: span h`), so no cumulative-y rewrite is needed.
  - **Fragment-root widgets**: `CuratedAssetsWidget` and `KnowledgeCenterWidget` render a fragment root (card + modal beside it), so the edit-view/collapse props cannot fall through to their cards — they declare and forward them explicitly. The other 11 widgets are single-root and use the fallthrough chain. A regression test pins the forwarding for both.
  - **CuratedAssets `isEditView`**: the widget's older `isEditView` prop was never set by any caller; the editor signals edit mode with `editView`. The widget now reads `editView` first, `isEditView` as fallback (both are boolean props, so an absent one reads `false` — `??` would never fall through, hence `||`).
- Live verification owed (does not block this batch): persona with a saved LandingPage document + non-admin account (customize entry hidden for non-admin/non-persona; the editor route must forbid), first-time user (`isFirstTimeUser=true`) + returning user, data-assets limit at/over the soft limit for the banner, fixtures with ≥2 addable widgets, a CuratedAssets multi-instance case, an empty layout (placeholder-only save), and a live pointer drag.
