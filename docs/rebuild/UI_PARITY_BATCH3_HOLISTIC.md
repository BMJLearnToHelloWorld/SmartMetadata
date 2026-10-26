# UI Batch3 holistic review — READY_FOR_ALMA

Evidence-first review of planned Batch3 residuals **#32–#35** against the
official `openmetadata-ui/` reference tree and the Batch2 / Batch3 docs
under `docs/rebuild/`. Review + residual-table sync only. No new Vue
surfaces. No CCL React copy.

**Verdict: READY_FOR_ALMA**

No must-fix UI residual remains among the four planned Batch3 steps.
Leftovers below are **deferred residuals** (or DROP / out of this round),
not Alma blockers.

Reviewed tip: `origin/main` `a235899df856ef9214067135729ad185be3c25bf`
(PR #35 squash). Alma was still on Batch2 tip `3d944cd74a` until this
gate. Batch2 (#27–#31) is closed.

## Scope (do not invent)

Batch3 inventory was **four unfinished UI residuals only**:

| Step | PR | Claimed close |
|---|---|---|
| 3.1 CRUD shell pass 2 | #32 `97244c59ba` | Shared list/detail chrome on roles / domains / data-products + remaining quality / observability / ingestion lists |
| 3.2 Asset details | #33 `f947a58f64` | Slim GET + tabs for `chart` / `metric` / `dashboardDataModel` / `database` / `databaseSchema` |
| 3.3 Insights KPI | #34 `d0ec04db69` | `GET /v1/kpi` client + KPIs tab list/detail-or-Empty |
| 3.4 Settings | #35 `a235899df8` | Read-only Policies + custom property definitions; residual tiles stay text |

Owner constraint (this review): only real unfinished UI residuals vs
official IA. No gold-plate. No invented SSO / Persona / Apps / inbox /
appearance pages. DROP (Knowledge / Ontology / AI) out of scope unless
already in plan. Connector / MCP tools / profiler-DQ execution out of
this Alma gate.

Official tree is **reference-only** (`openmetadata-ui/…/pages/`,
`constants/LeftSidebar.constants.ts`, `constants/GlobalSettings.constants.ts`,
`utils/GlobalSettingsClassBase.ts`). Product is `smartmetadata-ui/`
(Vue 3). Java REST used as the Apache contract, not as a license to copy
CCL UI.

## Approach check

| Rule | Evidence | Result |
|---|---|---|
| No fake parity | Insights App analytics tab is residual `Empty` (`insights-app-analytics-empty`). Settings Apps / SSO / Persona / inbox / appearance / search-settings / profiler / admins / online-users / audit are `kind: 'residual'` text in `settings/hub.ts`, not routes. Hub test asserts residual nodes are not `<a>` and that Knowledge / Ontology copy is absent. | Pass |
| Empty when empty | Policies list Empty on `data: []` (`PoliciesListView.test.ts`). KPI tab Empty until `GET /v1/kpi` has rows; fail path also Empty, no invented rows (`InsightsView.test.ts`). Custom property type detail Empty when definitions `[]`. Database without `databaseSchemas` → `asset-related-empty`. `query` stays unwired copy. | Pass |
| No invented write UIs | `api/policies.ts` and `api/kpi.ts` are GET-only. `api/customProperties.ts` lists types + definitions; no `TypeResource.addOrUpdateProperty`. Router has no `/admin/sso`, `/admin/persona`, `/admin/apps`, appearance, inbox, or profiler-run pages. | Pass |
| Official collections only | Chart `GET /v1/charts/name/{fqn}` (`ChartResource`). Metric `/v1/metrics` (`MetricResource`). Data model `/v1/dashboard/datamodels` (`DashboardDataModelResource`). Database `/v1/databases` (`DatabaseResource`). Schema `/v1/databaseSchemas` (`DatabaseSchemaResource`). Policies `/v1/policies` (`PolicyResource`). Types `/v1/metadata/types` (`TypeResource`). KPI `/v1/kpi` (`KpiResource`). `entityRoutes.test.ts` refuses `query` / `kpi` as catalog GETs. | Pass |
| No CCL React copy | New files under `smartmetadata-ui/` carry Apache SmartMetadata headers. Official pages were read for IA only. Product chrome stays Ant Design Vue + existing `EntityListShell` / `EntityDetailShell`. | Pass |
| Goals stayed the four steps | Diff `3d944cd74a..a235899df8` is Vue list/detail chrome, five catalog GETs, KPI tab, Policies + type-definition pages, plus residual-table docs. No connector / MCP / profiler-run / Knowledge work. | Pass |

## Planned four steps (closed)

Each row is official-has / product-has / gap. Gap `closed` is not a
must-fix.

### 3.1 CRUD shell pass 2 (PR #32)

| Item | Official (reference) | Product has | Gap |
|---|---|---|---|
| Roles list/detail | Settings → Access → Roles (`User`/`Roles` pages) | `RolesListView` / `RoleDetailView` on `EntityListShell` / `EntityDetailShell`; list uses `GET /v1/roles` + existing `GET /v1/roles/search`; Overview / Users / Teams | **Closed.** No policy editor (assignment still PATCHes user/team) |
| Domains | Marketplace / Govern domains | `DomainsListView` / `DomainDetailView`; POST create + PUT update unchanged; Overview / Assets; cursor `after` | **Closed** |
| Data products | Marketplace data products | `DataProductsListView` / `DataProductDetailView`; same write clients; Overview / Assets | **Closed** |
| Test cases / definitions / suites | Observability → Data Quality / Test Library | Three list+detail pairs on the shared shells; Results tab still plots stored `testCaseResults` only | **Closed.** No run button |
| Alerts | Observability / Settings notifications | `AlertsListView` / `AlertDetailView`; webhook POST already shipped; Overview / Destinations | **Closed.** No Slack/email authoring invented |
| Incidents | Incident Manager | `IncidentsListView` / `IncidentDetailView`; status POST already shipped | **Closed chrome.** **No Next/Previous** — list client has no `after` (deferred, not must-fix) |
| Services | Settings → Services (per type) | Merged `databaseServices` + `messagingServices` table | **Closed chrome.** **No combined cursor** (two APIs; deferred) |
| Pipelines (ingestion) | AddIngestion / pipeline list | `PipelinesListView` / `PipelineDetailView`; cursor when `after` present; CLI YAML; no `/trigger` | **Closed chrome.** Trigger stays residual |

Roles search is the existing product `searchRoles` client, not a local
filter dressed as server search.

### 3.2 Chart / metric / db asset details (PR #33)

| Item | Official (reference) | Product has | Gap |
|---|---|---|---|
| `chart` | Chart details page + `/v1/charts` | `DETAIL_ENDPOINTS.chart` → `/v1/charts/name/{fqn}`; Overview `chartType` / `sourceUrl` / `service`; `dashboards` as Related; shared tail | **Closed.** No BI widget |
| `metric` | Metric details + `/v1/metrics` | `/v1/metrics/name/{fqn}`; Code tab from `metricExpression`; Overview `metricType` / `unitOfMeasurement` / `granularity` | **Closed** as Explore asset GET. Official also has a Govern **Metrics list** — not in this step (deferred) |
| `dashboardDataModel` | Data model details + `/v1/dashboard/datamodels` | Schema from `columns`; Overview `dataModelType` / `project` / `service` | **Closed** |
| `database` | Database details + `/v1/databases` | Overview + `databaseSchemas` refs; Empty when list missing | **Closed** |
| `databaseSchema` | Schema details + `/v1/databaseSchemas` | Overview + `tables` refs; Empty when list missing | **Closed** |
| Explore card | Unwired types stay listed | `isDetailWired` now true for the five; `query` still shows residual copy | **Closed** for the five leftovers from #31 |

Wired after this pass: `table`, `topic`, `dashboard`, `pipeline`,
`mlmodel`, `container`, `searchIndex`, `storedProcedure`, `chart`,
`metric`, `dashboardDataModel`, `database`, `databaseSchema`.

### 3.3 Insights KPI client + tab (PR #34)

| Item | Official (reference) | Product has | Gap |
|---|---|---|---|
| Insights KPIs tab | `DataInsightPage` + `KPIList` | Same `/insights` route; KPIs tab lists `GET /v1/kpi` (`listKpis` / `getKpiByName`, fields `owners,dataInsightChart,kpiResult`) | **Closed** read-only list/selected-detail |
| Target / current | Stored `targetValue` + `kpiResult.targetResult` | Shown only when present; `—` otherwise | **Closed.** No invented progress |
| Empty catalog | Official table empty | `insights-kpis-empty`; no demo rows | **Closed** |
| App analytics tab | Web-analytics charts | Residual Empty (`insights-app-analytics-empty`) | **Deferred** (not this step) |
| KPI write / history | `KPIPage` create/edit + `GET /v1/kpi/{name}/kpiResult` | No POST/PUT/PATCH/DELETE; no history chart | **Deferred** |

No first-class `/kpi` route. That matches the planned tab, not a missing
page from the inventory.

### 3.4 Settings Policies + custom property definitions (PR #35)

| Item | Official (reference) | Product has | Gap |
|---|---|---|---|
| Policies list | Settings → Access → Policies (`GlobalSettingsClassBase`) | Live hub link → `PoliciesListView` at `/admin/policies` via `listPolicies` | **Closed** read-only. No `/search` box (no product search client) |
| Policy detail | Policy page + rules | `PolicyDetailView` Overview / Rules / Roles / Teams from GET payload | **Closed** read-only. No editor |
| Custom property defs | Settings → Custom properties + `TypeResource` | `CustomPropertyTypesListView` + type detail; `GET /v1/metadata/types?category=entity` then `/customProperties` | **Closed** read-only. No addProperty PUT |
| Settings hub | Category cards | Policies + Custom properties are `RouterLink`s; Apps / SSO / Persona / inbox / appearance stay residual text | **Closed** for the two named leftovers |

Asset Custom properties tab still PATCHes **values** only
(`api/entities.ts`). Definition admin does not write.

## Must-fix (Alma gate)

None.

Self-check: every Batch3 inventory item has a product route + client +
Empty-when-empty test. Nothing planned is still a residual Empty or
unwired card.

## Deferred residuals (not must-fix)

These exist on official and are **not** in the four planned steps.
Documented so the next batch does not rediscover them as Alma blockers.

| Item | Official has | Product has | Gap |
|---|---|---|---|
| Collaboration list chrome | Feed / Tasks / Announcements pages | Working pages, still one-off `Card` + `Table` (`ActivityFeedView`, `TasksListView`, `AnnouncementsListView`) | Same Card+Table debt; Batch3.1 said “not named in this batch” |
| GlossaryTerm / Tag child pages | Term / tag details | Shipped child views, not on `EntityDetailShell` | Parent lists already shelled |
| Team / glossary / classification / bot / domain catalog search | Index `q=` / Explore | Users + roles keep existing search clients; others have no product `q=` | Do not invent a local filter |
| Incidents cursor | Incident Manager paging | Latest-status list, no `after` | Product client has no `after` |
| Services merged cursor | Per-type service lists | Merged database + messaging table | Two APIs; no invented pager |
| Cursor `before` | Official NextPrevious `before` | Previous walks a client `after` stack | Server often returns `after` only |
| Policy create / edit / delete | Policy write APIs + editor | GET list/detail only | Batch3.4 left authoring residual |
| Custom property definition PUT | `TypeResource.addOrUpdateProperty` | Definition list/detail GET only | i18n lead says PUT is not wired |
| KPI create / edit / delete | KPI write UI | Insights tab GET only | Read-only by plan |
| KPI history charts | `GET /v1/kpi/{name}/kpiResult` | Latest `kpiResult` fields if present | Needs a Data Insights job this UI does not start |
| App analytics | Web-analytics indexes | Residual Empty tab | No web-analytics client |
| Official Metrics **list** (Govern) | Left-nav Govern → Metrics | Metric **asset** GET from Explore | Batch3.2 named Explore leftovers, not a first-class Metrics CRUD page |
| Other catalog types | Query, API collection/endpoint, data contract, drive/file/spreadsheet/worksheet, report | Explore card + `asset.unwired` | Known Apache collections; not the five leftovers from #31 |
| Admins / online-users / audit logs | Settings Members / Access cards | Residual hub text | No product page + client |
| Appearance / search-settings / profiler-run | Preferences cards + `ProfilerConfigurationPage` | Residual hub text | Profiler `jobs.py` still raises |
| Notification inbox websocket | AppBar bell + `NotificationBox` | Residual hub text; Activity / Tasks remain pages | No inbox/websocket client |
| Applications / SSO / Persona | Settings Apps / SSO / Persona | Residual hub text | Do not invent save forms |
| Extra official Settings cards | Permission debugger, OM health, data-asset-rules, per-type search settings, lineage/url config, workflows, column bulk, … | Not listed as live or residual tiles | Never in Batch3 inventory; do not start a workstream here |
| Pipeline `/trigger` / logs websocket | Ingestion run UI | CLI YAML + status read | ADR:2026-10-22-ingestion-console-runs-via-cli |
| Profiler / DQ **execution** | Profiler/DQ pipelines | Read of stored results / charts only | `jobs.py` raises |
| Home / Marketplace overview | Left-nav Home + Marketplace | Explore is default `/`; domains + data products under Governance | Do not invent landings |
| Help menu / persona switcher / domain scope | AppBar extras | Locale + profile + Settings + logout | No product APIs |
| Connectors / MCP tools | 106 connectors; 21 MCP tools | 4 connectors; 7 tools | Out of this UI round (`PARITY.md`) |

## DROP (stay off the product nav)

| Official | Product | Why |
|---|---|---|
| Knowledge / Context Center (+ AI context, articles, …) | Absent (`isDroppedSettingsKey`) | Collate-only |
| Ontology Studio | Absent | Collate-only |
| Semantic / NLQ search | Absent | Collate AI |

## Residual-table sync (this PR)

Docs that still described pre-#32–#35 leftovers were aligned to the
closed four steps. No new workstream was added.

| Doc | Sync |
|---|---|
| `PARITY.md` | Product UI routes + Insights / Settings rows cite Batch3.1–3.4 and this gate |
| `UI_PARITY_BATCH1.md` | Stale “dashboard/pipeline unwired” and “non-table CRUD” rows point at Batch2/3 closes |
| `UI_PARITY_BATCH3_*.md` | Pointer to this verdict; residual tables already matched code |
| `UI_PARITY_BATCH2_*.md` | Already pointed at Batch3 closes from #32–#35; unchanged |

## How this review was verified

Docs-only. Product tests for the four steps already live on `main`
(`RolesListView.test.ts`, `DomainsListView.test.ts`,
`DataProductsListView.test.ts`, quality/observability/ingestion list
tests, `AssetDetailView.test.ts` five-type case, `InsightsView.test.ts`
KPI Empty/list, `PoliciesListView.test.ts`,
`CustomPropertyTypesListView.test.ts`, `hub.test.ts`,
`SettingsHubView.test.ts`). This PR does not re-run them and does not
change product code.

Manual Alma deploy is the next owner step after this gate, not part of
the review PR.
