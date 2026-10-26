# SmartMetadata UI layers iPlatform soul accents on the OM console without changing primary or IA

- **Status:** Accepted
- **Revisions:** v1 2026-10-26 (initial)
- **Deciders:** Bernie Bai (owner)
- **Guard:** `smartmetadata-ui/src/theme/tokens.test.ts` asserts primary `#1570ef` (not `#005587`), radius `6`, canvas `#f0f2f5`, raised shadows, denser Form/Card/Table, and no `@icore` / IP3Layout / AppShell IA rewrite
- **Related:** ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look; ADR:2026-10-26-smartmetadata-ui-uses-icore-component-tokens; `docs/rebuild/UI_IP3_SOUL.md`

## Context

OM Batches 1–4 (`#38`–`#41`) approximated in-repo openmetadata-ui copy and
chrome, including primary `#1570ef` and radius 8/12/16. That closed the
actionable OM residual matrix. Historical #37 had applied iPlatform
`#005587` + radius 6, then OM batches overrode the primary. The owner
authorized step 2: restore **soul accents** that complement OM, not undo
OM copy/chrome or revert to Collate primary.

## Decision

- Keep OM primary `#1570ef`, hover/selected/status, text, sider/header IA,
  routes, and Batch 4 tabs/empty/confirm/tooltip chrome.
- Layer iPlatform-inspired feel only: radius 6, quiet card + raised overlay
  shadows, denser Modal/Card/Table/Form padding, neutrals
  (`#f0f2f5` canvas, `#f7f8fa` elevated, `#f0f0f0` border).
- Do not import `@icore`, do not transplant IP3Layout / NaviTab, do not
  invent Appearance PUT / SSO / Persona / inbox / DROP / connectors.

## Consequences

Callers see OM brand blue on a cooler iPlatform-like canvas with tighter
ant chrome. Reverting primary to `#005587` or changing nav structure is a
new decision. Appearance Settings stay unwired.
