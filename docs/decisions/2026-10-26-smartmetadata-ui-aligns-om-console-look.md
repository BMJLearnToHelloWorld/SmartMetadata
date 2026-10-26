# SmartMetadata UI aligns component look to the in-repo OpenMetadata console

- **Status:** Accepted
- **Revisions:** v1 2026-10-26 (initial)
- **Deciders:** Bernie Bai (owner)
- **Guard:** `smartmetadata-ui/src/theme/tokens.test.ts` asserts primary `#1570ef` (not `#1d4ed8`), OM surfaces, and global Table/Modal/Menu/focus polish; reviewers reject React/CSS copy from `openmetadata-ui`, Settings appearance UI, and iPlatform `#005587` / `@icore` tokens in this phase
- **Related:** ADR:2026-10-22-clean-room-vue-spa; `docs/rebuild/UI_PARITY_OM_1TO1.md`

## Context

The Vue console must approximate in-repo `openmetadata-ui` (copy + component
look) without copying React. The documented OM brand is
`DEFAULT_THEME.primaryColor` / `--color-brand-600` `#1570ef`. Palette
`#1d4ed8` (`@blue-42`) is not the brand. iPlatform3 soul is a later phase.

## Decision

- This phase is **OM-only**. Visual source of truth is in-repo OpenMetadata
  tokens and locale wording, recreated clean-room in Vue via ConfigProvider
  `theme.token` / `algorithm` and `--sm-*` CSS. Do not copy React/TSX/CSS.
- Primary is `#1570ef`. Do not blend iPlatform `#005587` or `@icore` surfaces
  into this phase.
- Keep AppShell IA, routes, and entity shells. Light sider + header contrast
  may change look; they must not invent IP3Layout / NaviTab / DROP pages.
- Global antdv polish (Table hover, Modal mask, Form labels, Menu selected,
  focus rings, Dropdown/Drawer/Tabs) lives on the shared theme so every
  surface lifts. Page-level leftover copy is residual.
- **iPlatform3 shadow/soul is deferred** until the residual matrix in
  `docs/rebuild/UI_PARITY_OM_1TO1.md` is largely closed, and then only as
  accents — not an IP3Layout clone.

## Consequences

Callers see OM brand blue and OM canvas `#fafafa`. Appearance Settings stay
unwired. Later OM batches walk the residual matrix — this record does not
claim full 1:1. An iPlatform-soul PR is a new decision after that matrix
closes.
