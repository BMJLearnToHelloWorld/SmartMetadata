# SmartMetadata UI uses iPlatform @icore component tokens without a layout transplant

- **Status:** Accepted
- **Revisions:** v1 2026-10-26 (initial)
- **Deciders:** Bernie Bai (owner)
- **Guard:** `smartmetadata-ui/src/theme/tokens.test.ts` asserts primary `#005587`, radius `6`, and `--sm-*` CSS; reviewers reject IP3Layout / NaviTab / @icore package imports and Settings appearance UI
- **Related:** `docs/rebuild/UI_STYLE_IPLATFORM.md`; ADR:2026-10-22-clean-room-vue-spa

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
