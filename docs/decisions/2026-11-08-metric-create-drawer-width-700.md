# Metric create drawer uses the product form width (700), not the official 670

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 G-12 drawer batch
- **Guard:** reviewer (no test asserts a pixel width); `components/shared/presentation.test.ts` (the `form` tier stays 700 and no 670 tier is added)
- **Related:** REVIEW-W2-G12-DRAWER.md condition 8; upstream pin `a3012259ca` (`useMetricCreateDrawer.tsx`: width 670); `components/shared/presentation.ts` (`DRAWER_WIDTHS.form = 700`, from AddCustomProperty)

## Context

Official `useMetricCreateDrawer` opens the create drawer at width
670. The product's drawer widths are a closed data table
(`DRAWER_WIDTHS`): `feed` and `form` (700, sourced from the
AddCustomProperty panel). Drawer width is visual sizing, and the
dual standard puts visuals under the product's own style, not the
official's — so the drawer takes the existing product tier instead
of adding a one-off 670 tier for a single caller.

## Decision

- The metric create drawer renders through `SmDrawer` with
  `widthKey="form"` (700). No 670 tier is added to `DRAWER_WIDTHS`.
- The 30px difference from the official 670 is a product-style
  deviation, recorded here. Implementation notes and PR text must
  not claim the width matches the official.
- The drawer's non-visual behaviour follows the official exactly:
  mask click / Escape do not close it (`maskClosable` / `keyboard`
  props on `SmDrawer`, both defaulting to the Ant behaviour for
  existing callers), the save button is disabled until the intake
  form loads, and success navigates to the new metric's detail page.

## Consequences

- One drawer width tier serves every form panel; no per-caller width
  drift.
- If the product later re-tiers its form drawers, this drawer follows
  the tier — it carries no width of its own to update.
