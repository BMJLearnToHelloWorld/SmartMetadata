# SmartMetadata UI aligns component look to the in-repo OpenMetadata console

- **Status:** Accepted
- **Revisions:** v1 2026-10-26 (initial) · v2 2026-10-26 (owner sequencing)
- **Deciders:** Bernie Bai (owner)
- **Guard:** `smartmetadata-ui/src/theme/tokens.test.ts` asserts primary `#1570ef` (not `#1d4ed8`), OM surfaces, and global Table/Modal/Menu/focus polish; reviewers reject React/CSS copy from `openmetadata-ui`, Settings appearance UI, and historical #37 / `@icore` tokens in this phase
- **Related:** ADR:2026-10-22-clean-room-vue-spa; `docs/rebuild/UI_PARITY_OM_1TO1.md`

## Context

The Vue console must approximate in-repo `openmetadata-ui` (copy + component
look) without copying React. The documented OM brand is
`DEFAULT_THEME.primaryColor` / `--color-brand-600` `#1570ef`. Palette
`#1d4ed8` (`@blue-42`) is not the brand.

## Decision

Owner sequencing (authoritative):

1. **First** — complete approximation of in-repo **openmetadata-ui** (pages,
   components, modals, interactive details). Vue 3 + ant-design-vue native.
   Clean-room. OM primary. Do not blend iPlatform tokens/soul into this phase.
2. **Only after** the residual matrix in `docs/rebuild/UI_PARITY_OM_1TO1.md`
   is largely closed — a later batch / separate PR may layer **iPlatform3
   shadow/soul** (feel/brand accents) without undoing OM IA or cloning
   IP3Layout.

This phase (step 1) is **OM-only**. Visual source of truth is in-repo
OpenMetadata tokens and locale wording, recreated clean-room in Vue via
ConfigProvider `theme.token` / `algorithm` and `--sm-*` CSS. Do not copy
React/TSX/CSS.

- Primary is `#1570ef`. Do not re-apply historical #37 / `@icore` surfaces.
- Keep AppShell IA, routes, and entity shells. Light sider + header contrast
  may change look; they must not invent IP3Layout / NaviTab / DROP pages.
- Global antdv polish (Table hover, Modal mask, Form labels, Menu selected,
  focus rings, Dropdown/Drawer/Tabs) lives on the shared theme so every
  surface lifts. Page-level leftover copy is residual.

## Consequences

Callers see OM brand blue and OM canvas `#fafafa`. Appearance Settings stay
unwired. Later OM batches walk the residual matrix — this record does not
claim full 1:1. An iPlatform-soul PR is a new decision after that matrix
closes.

## Amendment (2026-10-26)

Owner restated sequencing: current Batch 1 / ongoing work is **OM-only**.
iPlatform3 soul stays deferred until the OM residual matrix is largely
closed. Docs for this phase must not frame the console as icore-first.
