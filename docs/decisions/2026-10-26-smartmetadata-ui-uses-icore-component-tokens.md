# SmartMetadata UI uses iPlatform @icore component tokens without a layout transplant

**Historical.** Do not implement this record. This phase is OM-only
(ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look).

- **Status:** Superseded by ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look
- **Revisions:** v1 2026-10-26 (initial) · v2 2026-10-26 (primary superseded; OM-only first)
- **Deciders:** Bernie Bai (owner)
- **Guard:** historical — successor ADR owns the live token test; this record must not be used to re-apply #37 / `@icore` tokens
- **Related:** `docs/rebuild/UI_STYLE_IPLATFORM.md`; ADR:2026-10-22-clean-room-vue-spa; ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look

## Context

The rebuilt Vue console used a generic blue (`#1d4ed8`) and radius 4. The
owner asked for ant-design-vue **component style** to match iPlatform3
`@icore` (primary `#005587`, radius 6, light surfaces) without copying
iPlatform chrome or CCL React.

## Decision

- Align tokens and ConfigProvider only. Keep AppShell, routes, and entity
  shells. Do not port IP3Layout, NaviTab, TabMenu, Bell, or `@icore`
  packages.
- CSS variables are product-owned `--sm-*` with `@icore` light values.
  Dark tokens may exist as `data-theme` CSS. Do not add a Settings
  appearance toggle until that residual is authorized.
- Compact algorithm stays off. Global Modal/Card/Table/Input polish belongs
  in the shared theme, not per-view edits.

## Consequences

Primary and radius are now iPlatform defaults. A later appearance page
would flip `data-theme` and/or ConfigProvider algorithm; it must not
rewrite IA. Changing the primary hex or importing `@icore` is a new
decision.

## Amendment (2026-10-26)

Owner authorized an OM-only 1:1 pass first. Historical #37 / `@icore`
surfaces are out of this phase
(ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look). iPlatform3 soul is
**deferred** until the OM residual matrix is largely closed. The
no-layout-transplant / no-Settings-appearance / no-@icore-import guards
still hold.
