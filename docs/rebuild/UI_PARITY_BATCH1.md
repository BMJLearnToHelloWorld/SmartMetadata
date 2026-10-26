# UI parity batch 1 — AppShell, Explore/search, asset detail

Authorized UI parity on the Vue 3 console (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture and
field names. No CCL React source was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

**Phase A** (merged as `728e87e81e`, PR #24): AppShell / nav IA / density /
zh-CN+en-US i18n.

**Phase B** (this document's remaining Explore + asset work): deepen
`SearchView` and `AssetDetailView` using Apache `GET /v1/search/query` and
entity GET fields the product already calls. No new backend endpoints.

## What official / CCL chrome has (read-only contrast)

Taken from `openmetadata-ui/.../constants/LeftSidebar.constants.ts`
`SIDEBAR_LIST` plus Explore / entity-detail IA (names only):

| Official surface | Kind |
|---|---|
| Home / My Data | Left-nav top item |
| Explore | Left-nav top item; facet rail + result cards |
| Explore facets | Terms aggregations from `searchSettings.json` (`entityType`, `serviceType`, `service.displayName.keyword`, `database.name.keyword`, `databaseSchema.name.keyword`, `tags.tagFQN`, `ownerDisplayName`, `domains.displayName.keyword`, `tier.tagFQN`, plus classification/glossary/certification) |
| Explore cards | Entity-type chip, display name, FQN, description, service/db/schema, owners, tags, tier |
| Asset detail tabs | Overview / Schema / Lineage / Data Quality (plus activity, custom properties, profiler/sample) |
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
**Lineage** + six submenus. Header 64px, content margin 24px, sider
`collapsed-width="0"`. No locale switcher.

`SearchView.vue`: thin English table, `include_aggregations: false`, no
filters, no pagination, no entity-type chrome.

`AssetDetailView.vue`: one stacked card (descriptions + schema + activity +
conversations + DQ + profiler/sample + custom properties). Table/topic GET
requested `owners,tags,columns,domains,extension` only.

## Gap closed

### Phase A (PR #24)

| Item | Change |
|---|---|
| Explore label | Nav item is **Explore** (route name stays `search`) |
| Official-like IA | Explore and Lineage are top-level siblings; quality CRUD sits under **Observability** |
| Density | 48px header, 13px body, 36px menu rows, 16px content margin, sider 220→64 |
| i18n | vue-i18n, `en-US` + `zh-CN`, persist `sm.locale.v1` |
| Collate-only | Still **DROP**: Home, Insights, Marketplace overview, Ontology, Knowledge, persona AI |

### Phase B (this PR)

| Item | Official (reference) | Product now | Residual |
|---|---|---|---|
| Explore facets | Left rail from search aggregations | Facet checkboxes from `include_aggregations` buckets: entityType, serviceType, service, database, schema, tags, owner, domain, tier. Lucene `q=` AND/OR. Query-string filters. Hidden when a bucket list is empty. | `classificationTags` / `glossaryTags` / `certification` unused (tag FQN already covers classification+glossary; certification is not a product surface) |
| Explore cards | Dense cards, entity-type chip | Cards with type chip, name, FQN, description, service/db/schema, owners, tags, tier; unwired types stay listed | Batch 2/3 wired 13 catalog types (`UI_PARITY_BATCH2_ASSETS_PIPELINE.md`, `UI_PARITY_BATCH3_ASSETS.md`). `query` and other leftovers still residual |
| Explore pagination | Paged results | `page` + size 20 on `GET /v1/search/query` | Advanced sort / saved searches not wired (no product client) |
| Header search | Keeps Explore context | Preserves facet query params; resets page | Help / persona still absent |
| Asset tabs | Overview / Schema / Lineage / Quality | Same four, plus Activity and Custom properties (already shipped APIs) | No Collate profiler-run, no Knowledge, no Ontology |
| Asset overview fields | Service, database, schema, table type | Table GET now asks `service,database,databaseSchema,tableType`; topic asks `service,messageSchema,partitions` | Followers / usage / certification skipped |
| Asset lineage tab | Embedded graph | Neighbors from existing `GET /v1/lineage/{type}/name/{fqn}` (depth 1) + button to the full graph page | Depth controls stay on `/lineage/...` |
| Asset quality tab | Tests + profiler + sample | Same existing clients, now under the Quality tab | Profiler **run** still residual (`jobs.py` raises) |
| Explore/asset i18n | Full catalogs | `explore.*` and `asset.*` keys in zh-CN / en-US | Catalog CRUD lists later got `crud.*` keys in batch 2/3; collaboration pages still mixed English |

No new Java/Python endpoints. Search still uses documented Lucene `q=` on
`dataAsset`. Entity GET field lists stay Apache table/topic collections.

## Residual gaps (intentionally later)

| Gap | Why it stays |
|---|---|
| Collaboration Card+Table chrome | Out of Phase B; still not in Batch3 inventory (`UI_PARITY_BATCH3_HOLISTIC.md`) |
| No Home / My Data landing | **Closed** — `/my-data` is the post-login default (`MyDataView`). Persona customize / Knowledge / curated-assets stay residual |
| Insights / KPI | Snapshots + pipeline in `UI_PARITY_BATCH2_CHARTS.md`; KPI tab in `UI_PARITY_BATCH3_KPI.md`. App analytics / KPI write residual |
| Official Marketplace landing | Domains + data products already under Governance |
| Settings as one landing page | Closed in batch 2 step 3 (`UI_PARITY_BATCH2_CHROME.md`); Policies + custom-property defs in `UI_PARITY_BATCH3_SETTINGS.md` |
| Collaboration in the left nav | Official feed lives in the AppBar; product routes stay listed |
| Ingestion under Settings | Official nests services in Settings; product keeps an Ingestion section |
| Icon set | Ant Design icons, not official SVG glyphs |
| Help menu / persona switcher | No product APIs wired; persona landing skipped in Phase 9 |
| Additional locales | Only zh-CN / en-US authorized |
| Non-table/topic asset detail GETs | Closed for the 13 wired types in batch 2 step 5 + batch 3.2. Remaining types stay `asset.unwired` |
| Semantic / NLQ search | Collate AI; **DROP** |
| Certification / Data Insights facets | Not a product surface |

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

1. Open Explore. Confirm facet rail from aggregations and denser cards
   (entity-type chip, service/db/schema, owners, tags).
2. Toggle Entity type = table. URL gets `entityType=table`; results use
   Lucene `q=` (`entityType:table`). Header search keeps that filter.
3. Open a table. Tabs: Overview / Schema / Lineage / Quality (+ Activity,
   Custom properties). Overview shows service/database/schema/tableType
   when the GET returns them. Lineage tab lists depth-1 neighbors.
4. Topic detail: Schema fields + sample messages; no invented profiler.
5. After batch 2/3, dashboard / pipeline / chart / … load a slim GET.
   `query` (or any still-unwired type) still shows residual copy.
