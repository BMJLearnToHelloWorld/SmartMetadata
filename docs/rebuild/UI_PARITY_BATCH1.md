# UI parity batch 1 — AppShell, nav IA, layout density, zh/en i18n

Phase A of the authorized UI parity work. **Explore/search and asset-detail
deepening are out of scope** and stay a later PR.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

Official console (`openmetadata-ui/`) is **reference-only** for information
architecture. Product console is a Vue 3 rebuild in `smartmetadata-ui/`. No
CCL React source was copied.

## What official / CCL chrome has (read-only contrast)

Taken from `openmetadata-ui/.../constants/LeftSidebar.constants.ts`
`SIDEBAR_LIST` plus the top AppBar (names only):

| Official surface | Kind |
|---|---|
| Home / My Data | Left-nav top item |
| Explore | Left-nav top item |
| Lineage | Left-nav top item |
| Observability → Data Quality, Incident Manager, Alerts, Test Library | Nested |
| Insights / Data Insight | Left-nav item |
| Data Marketplace → Overview, Domains, Data Products | Nested |
| Govern → Glossary, Ontology Studio, Classification, Metrics, Column bulk, Workflows | Nested |
| Knowledge / Context Center (+ AI context, articles, …) | Collate-only |
| Settings (single item → settings landing) | Footer / sider extra |
| Top bar: global search, help, persona, user menu | AppBar |
| i18n catalogs (`en-us.json`, `zh-cn.json`, …) | CCL React |

Layout: icon-first sider that collapses to icons (not gone), compact item
height, dense header (~48px), content flush to the chrome.

## What the product had before this batch

`AppShell.vue` (Phase 1–9): dark sider, English hard-coded **Search** +
**Lineage** + six submenus (Governance, Quality, Observability, Ingestion,
Collaboration, Admin). Header 64px, content margin 24px, sider
`collapsed-width="0"` (nav disappears on small screens). No locale switcher.

## Gap closed in this PR

| Item | Change |
|---|---|
| Explore label | Nav item is **Explore** (route name stays `search`) |
| Official-like IA | Explore and Lineage are top-level siblings; quality CRUD sits under **Observability** with incidents/alerts |
| Grouping of existing routes | Governance / Ingestion / Collaboration / Admin unchanged in membership |
| Density | 48px header, 13px body, 36px menu rows, 16px content margin, sider 220→64 (icons remain) |
| i18n | vue-i18n, `en-US` + `zh-CN`, switcher on login + header, persist `sm.locale.v1` |
| Ant Design locale | `ConfigProvider` follows the same locale |
| Collate-only | Still **DROP**: Home landing, Insights, Marketplace overview, Ontology Studio, Knowledge Center, persona AI widgets |

## Residual gaps (intentionally later)

| Gap | Why it stays |
|---|---|
| Explore/search page still a thin table | Phase B (separate run) |
| Asset detail still a single stacked card | Phase B |
| Inner CRUD page strings still English | Not chrome; do not expand this PR |
| No Home / My Data landing | No product route; do not invent |
| Insights / KPI | Documented product gap (`PARITY.md`) |
| Official Marketplace landing | Domains + data products already under Governance |
| Settings as one landing page | Product already has `/admin/settings` plus users/teams/roles/bots |
| Collaboration in the left nav | Official feed lives in the AppBar; product routes stay listed because they exist |
| Ingestion under Settings | Official nests services in Settings; product keeps an Ingestion section for existing routes |
| Icon set | Ant Design icons, not official SVG glyphs |
| Help menu / persona switcher | No product APIs wired; persona landing skipped in Phase 9 |
| Additional locales | Only zh-CN / en-US authorized |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`. Offline matrix still
`make verify-rebuild`.

Manual (against an already-running slim server; this PR does not redeploy):

1. Open the console, confirm left nav shows Explore (not Search) and that
   test definitions/cases/suites sit under Observability.
2. Collapse the sider — icons remain (width 64).
3. Switch language on login and in the header; reload — preference survives
   (`localStorage.sm.locale.v1`).
4. Log in; header search still routes to `/search?q=`.
