# OM 1:1 style + copy — Batch 3 (2026-10-26)

Owner sequencing (authoritative):

1. **First** — complete approximation of **openmetadata-ui** original (pages,
   components, modals, all interactive details). Vue 3 + ant-design-vue
   native. Clean-room. OM primary. Do **not** blend iPlatform tokens/soul
   into this phase.
2. **Only after** this residual matrix is largely closed (later batches /
   separate PR) — layer **iPlatform3 shadow/soul** (feel/brand accents),
   without undoing OM IA or becoming a literal IP3Layout clone.

**This phase is OM-only.** Approximate the in-repo **openmetadata-ui** console
with Vue 3 + ant-design-vue official native APIs. Clean-room: recreate
look/feel; do not copy React/TSX/CSS. Keep IA and routes.

**iPlatform3 shadow/soul is deferred.** Do not re-apply historical #37
primary (`#005587`), `@icore` surfaces, or iPlatform tokens.

ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look.

Batch 3 is **not** a claim of full 1:1. It closes remaining page-text,
explore/lineage chrome, list overflow, and form-helper residuals from
Batch 2. Invented APIs / DROP / connector marketplace / MCP / profiler-DQ
authoring / Appearance / SSO / Persona / inbox stay residual.

## What Batch 1 did (already on main)

Global OM theme (`#1570ef`), antdv polish, first-pass shell/CRUD copy.
See git `#38`.

## What Batch 2 did (already on main)

Highest-impact copy, modal, and thin-component residuals. See git `#39`.

## What Batch 3 closed

| Surface | After (OM-faithful) |
|---|---|
| Asset tabs beyond profiler/sample/quality | Lineage / activity / custom-properties / charts / features / tasks / executions / code / related / chart leads are short help, not GET tutorials |
| Collaboration / settings-system / custom-property definition leads | OM-style help; no endpoint-first English/zh |
| Settings hub residual tiles | Still honest residual labels (Appearance / Apps / SSO / Persona / inbox) — not faked |
| Connection JSON | Unsupported types still raw JSON; short OM-style helper above the payload |
| Explore cards | Denser card layout/spacing/typography via CSS tokens (still ant Card + Vue, no React port) |
| Lineage canvas | Thicker Vue Flow node chrome, edge stroke, controls (still Vue Flow, no React Flow copy) |
| List overflow ⋯ | View plus Edit (navigate to detail) where the list already has edit; Delete on services/pipelines |
| Tooltips | Overflow ⋯ and lineage depth labels |
| Empty | Still ant Empty; copy shortened (`No data` / no GET empties) |
| Create/edit forms | Remaining collaboration / connection / comment name fields use `crud.fieldRequired` + existing Cancel/ok-text |

Wiring: `src/i18n/locales/{en-US,zh-CN}.ts`, `EntityListShell`,
`SearchView`, `LineageGraph` / `LineageNode` / `LineageCanvas`,
`ServiceDetailView`, `ServiceConnectionFields`, list views that already
had edit/delete.

## Residual matrix (Batch 4+ — still OM-only)

Walk these before any iPlatform soul pass. Do not invent missing APIs.

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
| Explore cards | **Partial** — denser token layout; still not UntitledUI search-card React |
| Lineage canvas | **Partial** — thicker Vue Flow chrome; still not OM React Flow skin |
| List overflow extras | **Closed** — Edit/Delete where those actions already exist |
| Tooltips / popovers | **Partial** — overflow + lineage depth audited; not every control |
| Detail tabs | **Open** — ant Tabs (denser ink); not UntitledUI underline weight |
| Empty / skeleton | **Open** — ant Empty/Spin + short copy; not OM illustrated empties |
| Confirm delete | **Open** — ant Modal.confirm (tighter); no Dialog compound |
| Drawers | **Open** — token-aligned; few drawers exist |
| Date pickers | **Open** — unused on most pages |
| Icons | **Open** — `@ant-design/icons-vue`, not UntitledUI glyphs |

### Modal / form gaps

| Surface | Status |
|---|---|
| Connection JSON read-only | **Helper closed**; unsupported types stay raw JSON (no invented connectors) |
| Some edit forms | **Partial** — create-name / required collab fields wired; not every optional control has OM helper text |

### IA / features explicitly residual

DROP, connector marketplace, MCP console, profiler job config, appearance
theme PUT, notification inbox, persona switcher.

### Deferred after this matrix is largely closed

iPlatform3 shadow/soul (feel/brand accents only). Must not undo OM IA or
become a literal IP3Layout clone.

## How to verify

```bash
cd smartmetadata-ui
npm test
npm run build
```

Root: `make verify-rebuild` (Job A: `ui-test` then `ui-build`).

Manual: login → Explore (denser cards, hover brand tint) → open an asset
Lineage / Activity / Custom Properties tab (short help, no GET tutorial)
→ Users list ⋯ Edit → Services list ⋯ Delete (confirm) → unsupported
service Connection tab (JSON + helper) → toggle locale. Primary buttons
must be `#1570ef`. Residual Settings tiles stay labeled residual.
