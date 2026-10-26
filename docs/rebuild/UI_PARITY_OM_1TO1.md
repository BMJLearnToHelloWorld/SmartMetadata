# OM 1:1 style + copy — Batch 2 (2026-10-26)

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

Batch 2 is **not** a claim of full 1:1. It closes the highest-impact copy,
modal, and thin-component residuals from Batch 1. Invented APIs / DROP /
connector marketplace / MCP / profiler-DQ authoring / Appearance / SSO /
Persona / inbox stay residual.

## What Batch 1 did (already on main)

Global OM theme (`#1570ef`), antdv polish, first-pass shell/CRUD copy.
See git `#38`.

## What Batch 2 closed

| Surface | After (OM-faithful) |
|---|---|
| Explore lead / facet helper | Marketing-shorter Discover copy + filter helper; no `GET /search/query` |
| Asset tab leads | Profiler / Sample Data / Quality are short help, not API tutorials |
| Insights / KPI / pipeline | Warehouse-style leads; KPI empty matches OM `message.no-kpi`; app analytics stay residual |
| Lineage home | Residual platform-map sentence removed |
| Admin / governance / quality / ingestion list leads | OM-style help text; no endpoint-first English/zh |
| Login lead | Auth mention only — no Base64 / `POST /users/login` tutorial |
| Settings hub residual tiles | Still honest residual labels (Appearance / Apps / SSO / Persona / inbox) |
| Create/edit modals | `ok-text` + `cancel-text` (Save/Cancel or Create/Cancel) on CRUD shells |
| Validation | `crud.fieldRequired` = OM `label.field-required`; wired on Users/Teams/Bots and other create name fields |
| Incident resolve | Ack → Acknowledged / 已确认; Resolved → Resolved / 已解决 |
| Entity list row actions | Overflow ⋯ Dropdown with View (name click still works) |
| Detail tabs | Denser underline / 3px ink bar via token + CSS (still ant Tabs) |
| Empty states | OM `No data` + short hint; Explore `No data assets found` |
| Charts | ECharts series remapped to OM categorical tokens (`#1570ef` first) |
| Confirm delete | Tighter `Modal.confirm` padding via CSS |

Wiring: `src/i18n/locales/{en-US,zh-CN}.ts`, `EntityListShell`,
`formRules.ts`, `incidentStatus.ts`, `theme/tokens.ts`, `styles/theme.css`,
`features/charts/option.ts`.

## Residual matrix (Batch 3+ — still OM-only)

Walk these before any iPlatform soul pass. Do not invent missing APIs.

### Page text still off OM

| Area | Gap |
|---|---|
| Asset tabs beyond profiler/sample/quality | Lineage / activity / custom-properties / charts / features / tasks / executions / code leads can still mention GET or payload shape |
| Insights chart warehouse | Live snapshots only; no invented page-view / DAU warehouse |
| Settings hub residual tiles | Appearance / Apps / SSO / Persona / inbox stay residual text (do not fake) |
| Collaboration / settings-system / custom-property definition leads | Still more API-honest than OM marketing pages |
| Connection JSON read-only | Unsupported service types stay raw JSON |

### Component look / interaction still thinner than OM

| Surface | Gap |
|---|---|
| Explore cards | Not UntitledUI search cards; ant Card + table/list |
| Lineage canvas | Vue Flow chrome, not OM React Flow skin |
| Detail tabs | ant Tabs (now denser ink); not UntitledUI underline weight |
| Empty / skeleton | ant Empty/Spin + short copy; not OM illustrated empties |
| Confirm delete | ant Modal.confirm (tighter); no Dialog compound |
| Tooltips / popovers | Token-aligned; placement/copy not audited per control |
| Drawers | Token-aligned; few drawers exist |
| Date pickers | Unused on most pages |
| Icons | `@ant-design/icons-vue`, not UntitledUI glyphs |
| List overflow extras | View only; Edit/Delete stay on detail pages |

### Modal / form gaps

| Surface | Gap |
|---|---|
| Connection JSON read-only | Unsupported service types stay raw JSON |
| Some edit forms | Required rules on create-name fields; not every optional control has OM helper text |

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

Manual: login → Explore → open an asset Quality tab → open Users Create
modal (Save/Cancel, required Name) → Incidents detail (Acknowledged) →
toggle locale. Primary buttons must be `#1570ef`. Table rows hover
`#fafafa`. Selected nav is brand-tint on a light sider. List rows expose
a ⋯ menu with View.
