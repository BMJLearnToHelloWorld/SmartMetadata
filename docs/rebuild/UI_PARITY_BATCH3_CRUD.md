# UI parity batch 3.1 — CRUD shell pass 2

Holistic Alma gate after #32–#35: **READY_FOR_ALMA**
(`UI_PARITY_BATCH3_HOLISTIC.md`). Residuals in this file stay deferred.

Authorized Vue 3 console work (`smartmetadata-ui/`). Official
`openmetadata-ui/` is **reference-only** for information architecture.
No CCL React source or CSS was copied.

ADR:2026-10-25-vue-i18n-zh-en.
ADR:2026-10-22-clean-room-vue-spa.

This pass applies the shared `EntityListShell` / `EntityDetailShell`
primitives from batch 2 (`UI_PARITY_BATCH2_CRUD.md`, PR #28) to the
remaining catalog list/detail pages that were still one-off
`Card` + `Table` + English. It does **not** start Settings Policies
(batch 3.4), profiler/DQ execution, pipeline trigger, or connector work.

## What moved

Same chrome as Users / Classifications: title + lead, optional search only
when the product client already has it, refresh, shown-of-total (API
`paging.total` only), Previous/Next from `paging.after` + a client cursor
stack, breadcrumb + Overview / related-collection tabs, zh-CN / en-US
keys. Existing GET/POST/PUT/PATCH/DELETE clients are unchanged.

| Route | List API | Write | Detail tabs | Paging |
|---|---|---|---|---|
| Roles | `GET /v1/roles` + existing `GET /v1/roles/search` | Assignment still PATCHes user/team (no policy editor) | Overview / Users / Teams | Cursor on unfiltered list. Search is the existing `q=` endpoint — no invented offset |
| Domains | `GET /v1/domains` (`after`) | POST create + PUT update already shipped | Overview / Assets | Cursor |
| Data products | `GET /v1/dataProducts` (`after`) | POST create + PUT update already shipped | Overview / Assets | Cursor |
| Test cases | `GET /v1/dataQuality/testCases` (`after`) | POST/PUT already shipped | Overview / Results (stored results + chart) | Cursor |
| Test definitions | `GET /v1/dataQuality/testDefinitions` (`after`) | POST/PUT already shipped | Overview / Parameters | Cursor |
| Test suites | `GET /v1/dataQuality/testSuites` (`after`) | POST/PUT already shipped | Overview / Tests | Cursor |
| Alerts | `GET /v1/events/subscriptions` (`after`) | POST webhook create already shipped | Overview / Destinations | Cursor |
| Incidents | `GET /v1/dataQuality/testCases/testCaseIncidentStatus` | POST resolution already shipped | Overview (status form kept) | **No Next/Previous** — list client has no `after` |
| Services | merged `databaseServices` + `messagingServices` | POST/PUT/DELETE already shipped | Overview / Connection | **No combined cursor** — two list APIs; totals only when both responses include `paging.total` |
| Pipelines | `GET /v1/services/ingestionPipelines` (`after`) | POST/PUT/DELETE already shipped; no `/trigger` | Overview (YAML + run note) / Status | Cursor |

i18n: `admin.roles.*`, `governance.domains|dataProducts.*`,
`quality.testCases|testDefinitions|testSuites.*`,
`observability.alerts|incidents.*`, `ingestion.services|pipelines.*`
plus a few shared `crud.*` leaves (`type`, `owners`, `parent`,
`enabled`, `status`, `assets`, `delete`, `deleteFailed`).

No new Java/Python endpoints. No invented search boxes, profiler-DQ run
buttons, or pipeline trigger/websocket.

## Residual (intentional)

| Gap | Why it stays |
|---|---|
| Settings Policies list/editor | Closed as **read-only** in batch 3.4 (`UI_PARITY_BATCH3_SETTINGS.md`); authoring still residual |
| Collaboration tasks / announcements / activity | Same Card+Table debt, not named in this batch |
| GlossaryTerm / Tag detail (child pages) | Parent lists already shelled; child pages stay as shipped |
| Team / glossary / classification / bot / domain catalog search | No product search client; roles keep the existing `/v1/roles/search` only |
| Hard delete / policy authoring / Slack-email alert authoring | Not wired; not invented |
| Services merged-list cursor | Two APIs; do not invent a combined pager |
| Incidents `after` | List query has no `after` in the product client |
| Cursor `before` from the server | Previous still walks the client `after` stack |
| Profiler / DQ execution, pipeline `/trigger`/`/deploy` | Residual (`jobs.py`, Airflow client) |
| Knowledge / Ontology / AI | Collate-only **DROP** |

## How to verify

```bash
cd smartmetadata-ui
npm ci
npm test
npm run build
```

Root: `make ui_test` and `make ui_build`.

Manual (already-running slim server; this PR does not redeploy):

1. Admin → Roles: Refresh, Search (roles/search), Next when `paging.after`
   is present, open a row. Detail breadcrumb + Overview / Users / Teams;
   assign still PATCHes user/team.
2. Governance → Domains and Data products: create still POSTs; detail
   Overview / Assets; Edit still PUTs.
3. Quality lists: create still POSTs; test case Results tab still plots
   stored `testCaseResults` (no run button).
4. Observability → Alerts / Incidents: webhook create and incident status
   POST unchanged. Incidents have no Next/Previous.
5. Ingestion → Services: merged table, no Next/Previous. Pipelines: cursor
   when `after` is present; detail still has CLI YAML and no trigger call.
6. Switch locale: list titles and chrome follow zh-CN / en-US.
