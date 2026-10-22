# Phase 5 — Quality and observability parity (clean-room UI)

Phase 5 extends `smartmetadata-ui/` with data-quality and observability
surfaces against existing Apache `openmetadata-service` REST APIs. It does not
copy, transpile, or import `openmetadata-ui` or `openmetadata-ui-core-components`.

Earlier phases: [PHASE0.md](PHASE0.md) (slim dist) · [PHASE1.md](PHASE1.md)
(login / search / table+topic detail) · [PHASE2.md](PHASE2.md) (admin) ·
[PHASE3.md](PHASE3.md) (lineage) · [PHASE4.md](PHASE4.md) (governance).
ADR:2026-10-22-clean-room-vue-spa still applies. New convention:
ADR:2026-10-22-dq-entity-links-use-message-parser-format.

## What shipped

JWT route guards from Phase 1 are unchanged. Phase 1–4 routes stay.

| Surface | Location | Server contract |
|---|---|---|
| Test definitions list / create / edit | `views/quality/TestDefinitionsListView.vue`, `TestDefinitionDetailView.vue` | `GET/POST/PUT /v1/dataQuality/testDefinitions` (`CreateTestDefinition` requires `name` + `entityType` + `testPlatforms`) |
| Test cases list / create / edit + results | `TestCasesListView.vue`, `TestCaseDetailView.vue` | `GET/POST/PUT /v1/dataQuality/testCases`; results `GET /v1/dataQuality/testCases/testCaseResults/{fqn}` |
| Test suites list / create / edit | `TestSuitesListView.vue`, `TestSuiteDetailView.vue` | Logical suite `GET/POST/PUT /v1/dataQuality/testSuites` (`CreateTestSuite` requires `name`). Basic suites are listed, not created here |
| DQ on asset detail | `AssetDetailView.vue` | `GET /v1/dataQuality/testCases?entityFQN={fqn}&includeAllTests=true` for table and topic |
| Table profiler / sample | `AssetDetailView.vue` | `GET /v1/tables/{fqn}/tableProfile/latest`; `GET /v1/tables/{id}/sampleData` (read only) |
| Topic sample | `AssetDetailView.vue` | `GET /v1/topics/{id}/sampleData`. No topic `tableProfile` API |
| Incidents list / status update | `views/observability/IncidentsListView.vue`, `IncidentDetailView.vue` | `GET /v1/dataQuality/testCases/testCaseIncidentStatus?latest=true`; POST `Ack` (type + testCaseReference) or `Resolved` (plus `testCaseFailureReason` + `testCaseFailureComment`). `Assigned` skipped — requires an assignee picker |
| Alerts (event subscriptions) | `AlertsListView.vue`, `AlertDetailView.vue` | `GET/POST /v1/events/subscriptions` (`name` + `alertType` + webhook destination) |

Routes (still JWT-guarded except `/login`):

`/quality/test-definitions`, `/quality/test-definitions/:id`,
`/quality/test-cases`, `/quality/test-cases/:id`,
`/quality/test-suites`, `/quality/test-suites/:id`,
`/observability/incidents`, `/observability/incidents/:id`,
`/observability/alerts`, `/observability/alerts/:id`.

AppShell adds **Quality** and **Observability** sections. Search, lineage,
Governance, and Admin stay.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin` when the server was
initialized with defaults. Writes need a principal that holds
`CREATE_TESTS` / `EDIT_TESTS` / `EDIT_STATUS` (admin does).

### Manual verify

1. Unauthenticated `/quality/test-cases` redirects to
   `/login?redirect=/quality/test-cases`.
2. Sign in. Search, lineage, Governance, and Admin still work.
3. **Quality → Test definitions**: list from
   `GET /v1/dataQuality/testDefinitions` (seeded definitions usually exist).
   Create a custom definition (`TABLE` + `OpenMetadata`). Open it; parameters
   come from the GET.
4. **Test cases**: list. Create one against a real table FQN using a seeded
   definition and MessageParser link `<#E::table::{fqn}>`. Open it; results
   table is whatever `GET .../testCaseResults/{fqn}` returns (empty is fine).
5. Open a **table** from Search. **Data quality tests** lists cases for that
   FQN. Latest profiler / sample data render when present; empty tables are
   empty states, not fake charts.
6. Open a **topic**. Sample messages come from `GET /v1/topics/{id}/sampleData`
   when present. There is no topic profiler API.
7. **Test suites**: create a logical suite (`name` only). Open it; tests come
   from `fields=tests`.
8. **Observability → Incidents**: latest incident statuses. Record `Ack`, or
   `Resolved` with a reason and comment, when a test-case FQN is present.
   `Assigned` is not offered (needs an assignee entity reference).
9. **Alerts**: list event subscriptions. Create a webhook alert
   (`name` + `Observability` + URL). Open it.
10. Log out. Session key `sm.auth.v1` is cleared.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: test definition / case / suite / result / incident / event-subscription
/ profiler clients against real paths and required bodies; MessageParser entity
links; TestDefinitionsListView, TestCasesListView, IncidentsListView; asset
detail linked tests.

## Non-goals (later phases)

- Clean-room ingestion / connectors (Phases 6–7) and console (Phase 8)
- Triggering profiler, quality, or Data Insights pipelines from this UI
- Full Collate AI auto-DQ
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)
- Slack / Teams / email destination authoring, filter-rule builders
- Logical-suite bulk `PUT /v1/dataQuality/testCases/logicalTestCases`
- Data Insights chart dashboards (`/v1/analytics/dataInsights/...`)
- Hardcoded fake DQ charts

## Residual risks and open questions

- **Entity link format.** Swagger examples still show `<E#/{type}/{fqn}>`.
  The server parser only accepts `<#E::type::fqn>` (and `::columns::{name}`).
  The create form always builds MessageParser links.
  ADR:2026-10-22-dq-entity-links-use-message-parser-format.
- **Test execution.** Creating a test case stores the definition. Running it
  still requires a quality pipeline (Phase 6+). Results stay empty until then.
- **Basic test suites.** `POST /v1/dataQuality/testSuites/basic` needs
  `basicEntityReference`. Phase 5 only creates logical suites. Basic suites
  created by the server still appear in the list.
- **Topic profiler.** There is no `GET /v1/topics/{fqn}/tableProfile/latest`.
  Topic observability is sample data + linked test cases only.
- **Data Insights.** Chart entities and `/system/charts/.../data` exist but
  need an insights pipeline. Skipped — no unused dashboard.
- **Column profile history.** `GET /v1/tables/{columnFqn}/columnProfile`
  requires `startTs`/`endTs`. Asset detail uses latest table profile only.
- **Incident groups / dimensional results.** `.../incidentGroups` and
  `.../dimensionResults` exist; not wired.
- **Alert destinations.** Create sends a webhook (`External` + `Webhook` +
  `config.endpoint`). Slack / email / filtering rules are residual.
- **Empty catalog.** Seeded test definitions usually exist; cases, suites,
  incidents, and profiler rows may be empty. Empty tables are empty states.

## Open questions (safest default already taken)

1. **Serve SPA from slim Java?** Still **no** — same as Phase 1.
2. **Trigger profiler / quality jobs from the console?** **No** — no
   non-CCL pipeline client in this phase.
3. **Create basic (executable) test suites from the UI?** **No** — logical
   suites only.
4. **Data Insights homepage?** **No**.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server
