# OM 1:1 style + copy — Batch 4 (2026-10-26)

Owner sequencing (authoritative):

1. **First** — complete approximation of **openmetadata-ui** original (pages,
   components, modals, all interactive details). Vue 3 + ant-design-vue
   native. Clean-room. OM primary. Do **not** blend iPlatform tokens/soul
   into this phase.
2. **After** this residual matrix is largely closed — layer **iPlatform3
   shadow/soul** (feel/brand accents), without undoing OM IA or becoming a
   literal IP3Layout clone. **Done** in `docs/rebuild/UI_IP3_SOUL.md`
   (ADR:2026-10-26-smartmetadata-ui-layers-ip3-soul-on-om). Primary stays
   `#1570ef`.

**OM Batches 1–4 remain the IA / copy / chrome SoT.** Approximate the
in-repo **openmetadata-ui** console with Vue 3 + ant-design-vue official
native APIs. Clean-room: recreate look/feel; do not copy React/TSX/CSS.
Keep IA and routes.

**iPlatform3 shadow/soul is layered** (radius 6, shadows, denser ant
chrome, iPlatform-inspired neutrals). Do **not** re-apply historical #37
primary (`#005587`) or transplant `@icore` / IP3Layout.

ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look.

Batch 4 is **not** a claim of full 1:1. It closes remaining visual/interaction
chrome residuals from Batch 3 (tabs ink, empty/spin density, Modal.confirm,
audited tooltips, one more explore/lineage chrome pass, optional form
helpers). Invented APIs / DROP / connector marketplace / MCP / profiler-DQ
authoring / Appearance / SSO / Persona / inbox stay residual.

## What Batch 1 did (already on main)

Global OM theme (`#1570ef`), antdv polish, first-pass shell/CRUD copy.
See git `#38`.

## What Batch 2 did (already on main)

Highest-impact copy, modal, and thin-component residuals. See git `#39`.

## What Batch 3 did (already on main)

Page-text, explore/lineage first chrome pass, list overflow, form required
helpers. See git `#40`.

## What Batch 4 closed

| Surface | After (OM-faithful) |
|---|---|
| Detail tabs | Denser ant Tabs ink: 3px flush underline on a 2px nav rule; tighter gutter. Still ant Tabs, not UntitledUI TabList |
| Empty / Spin | Short OM empty (`No data` / `just give it a spin!`) + denser Empty/Spin spacing. Still ant Empty; no illustrated assets |
| Confirm delete | Shared `confirmDelete` → ant `Modal.confirm` (ok-danger, tighter padding/type). No Dialog compound. Replaces `window.confirm` |
| Tooltips | List refresh/overflow, lineage depth/reload/layout/fullscreen, explore clear-filters, detail Delete. Unused controls not gold-plated |
| Explore cards | Second ant Card chrome pass: hover brand inset + name tint. Still Vue + ant Card |
| Lineage canvas | Second Vue Flow chrome pass: center header tint, thicker edges. Still Vue Flow |
| Create/edit helpers | Remaining optional displayName/description plus non-obvious optionals (password, teams/roles, parents, schedule, announcement/task FQNs) use short `Form.Item` extras |

Wiring: `src/theme/tokens.ts`, `src/styles/theme.css`,
`src/features/crud/confirmDelete.ts`, `EntityListShell` / `EntityDetailShell`,
`SearchView`, `LineageGraph` / `LineageNode` / `LineageCanvas`, service and
pipeline delete sites, create/edit forms that already had optional fields.

## Residual matrix (still OM-only inventables)

Soul is layered (`docs/rebuild/UI_IP3_SOUL.md`). Remaining rows are
invented-API / DROP residuals — do not fake them.

### Page text still off OM

| Area | Status |
|---|---|
| Asset tabs beyond profiler/sample/quality | **Closed** in Batch 3 |
| Collaboration / settings-system / custom-property definition leads | **Closed** in Batch 3 |
| Connection JSON read-only | **Helper closed**; payload remains raw JSON for unsupported types |
| Insights chart warehouse | **Open** — live snapshots only; no invented page-view / DAU warehouse |
| Settings hub residual tiles | **Open by design** — Appearance / Apps / SSO / Persona / inbox stay residual text (do not fake) |

### Component look / interaction still thinner than OM

| Surface | Status |
|---|---|
| Explore cards | **Partial** — second chrome pass (hover inset/name tint); still not UntitledUI search-card React |
| Lineage canvas | **Partial** — second Vue Flow chrome pass; still not OM React Flow skin |
| List overflow extras | **Closed** — Edit/Delete where those actions already exist |
| Tooltips / popovers | **Closed** for audited chrome (list, lineage, explore filters, detail delete). Unused controls stay unwired |
| Detail tabs | **Closed** — denser ant Tabs ink/underline; not UntitledUI TabList |
| Empty / skeleton | **Closed** — ant Empty/Spin + short OM copy + denser spacing; not OM illustrated empties. No Skeleton usage to thicken |
| Confirm delete | **Closed** — ant Modal.confirm (tighter ok-danger); no Dialog compound |
| Drawers | **Open** — token-aligned; few drawers exist |
| Date pickers | **Open** — unused on most pages |
| Icons | **Open** — `@ant-design/icons-vue`, not UntitledUI glyphs |

### Modal / form gaps

| Surface | Status |
|---|---|
| Connection JSON read-only | **Helper closed**; unsupported types stay raw JSON (no invented connectors) |
| Some edit forms | **Closed** for remaining optional create/edit fields audited in Batch 4. Required-only fields and unused advanced controls stay without tutorials |

### IA / features explicitly residual

DROP, connector marketplace, MCP console, profiler job config, appearance
theme PUT, notification inbox, persona switcher.

### Deferred after this matrix is largely closed

iPlatform3 shadow/soul — **layered** (see `docs/rebuild/UI_IP3_SOUL.md`).
Must not undo OM IA or become a literal IP3Layout clone. Primary stays
`#1570ef`.

## How to verify

```bash
cd smartmetadata-ui
npm test
npm run build
```

Root: `make verify-rebuild` (Job A: `ui-test` then `ui-build`).

Manual: login → Explore (denser cards, hover brand inset) → open an asset
with detail tabs (3px ink on a 2px rule) → Users list empty (`No data` +
spin hint) → Services list ⋯ Delete (Modal.confirm, danger OK) → lineage
depth/reload tooltips → optional create fields show short extras → toggle
locale. Primary buttons must be `#1570ef`. Residual Settings tiles stay
labeled residual. Soul pass: canvas `#f0f2f5`, radius 6, raised modal
shadow — without `#005587` or a layout transplant.
