# OM 1:1 style + copy — Batch 1 (2026-10-26)

**This phase is OM-only.** Approximate the in-repo **openmetadata-ui** console
(pages, shared components, modals, interactive details) with Vue 3 +
ant-design-vue official native APIs. Clean-room: recreate look/feel; do not
copy React/TSX/CSS. Keep IA and routes.

**iPlatform3 shadow/soul is deferred.** Do not blend `#005587`, `@icore`
surfaces, or IP3Layout chrome into this phase. A later PR may add iPlatform
feel/brand accents only after the OM residual matrix below is largely closed.

ADR:2026-10-26-smartmetadata-ui-aligns-om-console-look.

Batch 1 is **not** a claim of full 1:1. It ships a global OM theme that lifts
every ant surface, first-pass OM copy on shell/CRUD plus the worst leftover
pages, and this residual matrix for Batch 2+ continuous passes.

## What Batch 1 did

| Surface | After (OM-faithful) |
|---|---|
| Primary | `#1570ef` — OM `DEFAULT_THEME.primaryColor` / brand-600. Not palette `#1d4ed8` (`@blue-42`). |
| Hover / selected | `#175cd3` hover, `#eff8ff` selected / menu tint |
| Status | success `#039855` · warning `#DC6803` · error `#D92D20` |
| Canvas / text / border | `#fafafa` / `#181d27` / `#d5d7da` |
| Radius | control 8 · card 12 · modal 16 |
| Font / control | 14 / 32 |
| Sider / header | Light OM-style sider, brand selected pill, header 56px |
| Global antdv | Table hover+selected, Modal mask+footer, Form labels, Menu, Button hierarchy, Input/Select focus ring, Dropdown/Popover, Drawer, Tabs, Tooltip, Empty, Alert, Pagination, Breadcrumb, confirm |
| Copy | OM wording on Explore / Logout / Sign In / Search for Data Assets / Title Case CRUD; Activity, Tasks, Announcements, glossary term, tag, and connection fields now i18n |

Wiring: `src/theme/tokens.ts` (`smAntdTheme`), `src/styles/theme.css`,
`src/App.vue` ConfigProvider. AppShell / routes / EntityListShell /
EntityDetailShell **DOM stays**; only token + chrome contrast changed.

Optional `:root[data-theme="dark"]` remains a CSS hook. **No** Settings
appearance page.

## Out of scope this phase

- iPlatform soul / `#005587` / `@icore` tokens / IP3Layout / NaviTab
- DROP (Knowledge / Ontology / AI)
- Connector / MCP / profiler-DQ authoring
- Appearance Settings UI
- #18 purge
- Per-page hex or a React CSS port

## Copy first pass (measurable)

English now matches in-repo `en-us.json` on:

- `Search for Data Assets`, `Logout`, `Sign In`, `View Profile`
- `Data Products`, `Test Cases`, `Test Definitions`, `Test Suites`
- `Display Name`, `Fully Qualified Name`, `Custom Properties`, `Data Assets`

zh-CN now matches `zh-cn.json` on:

- `退出`, `登入`, `新建`, `显示名称`, `血缘关系`, `数据治理`, `术语库`, `观测`, `事件`, `提醒`, `质控测试集`

Hardcoded leftovers wired this batch: Activity, Tasks, Task detail,
Announcements, Glossary term detail, Tag detail, service connection fields.
Modals on those pages use Save / Cancel.

## Residual matrix (Batch 2+ — still OM-only)

Walk these before any iPlatform soul pass. Do not invent missing APIs.

### Page text still off OM (API-lead prose is product-owned)

| Area | Gap |
|---|---|
| Explore lead / facet helper | Still documents `GET /search/query`; OM page is marketing-shorter |
| Asset tab leads | Profiler / sample / quality still API-explaining |
| Insights / KPI / pipeline | Residual empty copy is honest; OM has chart warehouse copy |
| Lineage home | Platform-map residual sentence stays |
| Admin / governance / quality / ingestion list leads | API-first English/zh, not OM help text |
| Settings hub residual tiles | Appearance / Apps / SSO / Persona / inbox stay residual text |
| Login lead | Still explains Base64 `POST /users/login` |

### Component look / interaction still thinner than OM

| Surface | Gap |
|---|---|
| Explore cards | Not UntitledUI search cards; ant Card + table/list |
| Lineage canvas | Vue Flow chrome, not OM React Flow skin |
| Entity list row actions | No overflow ⋯ menu; actions are inline links/buttons |
| Detail tabs | ant Tabs ink bar, not UntitledUI underline weight |
| Empty / skeleton | ant Empty/Spin, not OM illustrated empties |
| Confirm delete | ant Modal.confirm density; no Dialog compound |
| Tooltips / popovers | Token-aligned; placement/copy not audited per control |
| Drawers | Token-aligned; few drawers exist |
| Date pickers | Unused on most pages |
| Charts | ECharts colors not remapped to OM categorical tokens |
| Icons | `@ant-design/icons-vue`, not UntitledUI glyphs |

### Modal / form gaps

| Surface | Gap |
|---|---|
| Create/edit on Users/Teams/Roles/… | Still default OK unless the view sets `ok-text` |
| Validation messages | Required-field strings not OM `label.field-required` set |
| Connection JSON read-only | Unsupported service types stay raw JSON |
| Incident resolve | Status enum labels (`Ack` / `Resolved`) not localized |

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

Manual: login → Explore → open an asset → open a list Create modal → toggle
locale. Primary buttons must be `#1570ef`. Table rows hover `#fafafa`.
Selected nav is brand-tint on a light sider.
