# The incident record route redirects to the test-case detail page

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group, F-D-2/F-D-4/F-D-5), review W2-2
- **Guard:** `src/router/routes.test.ts` (alias cases), `src/views/observability/IncidentDetailView.test.ts` (redirect), `src/views/quality/TestCaseDetailView.test.ts` (tab prop, FQN load, issues link)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group), `wave2/REVIEW-W2-G14.md` (conditions 4, 11(iv), 16), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (F-D-2, F-D-4, F-D-5)

## Context

F-D-2 retires the incident record page: its detail now lives on the
test-case detail page. A router-level `redirect:` cannot do this — the
test-case FQN is only known after reading the incident. The test-case
detail page must therefore load by FQN, but the server's `GET
/v1/dataQuality/testCases/{id}` takes a **UUID** only; a separate `GET
/name/{fqn}` endpoint exists. F-D-4 adds the official aliases
`/test-case/:fqn(/:tab)`, and F-D-5(a) keeps issues as the
incident-record table plus links.

## Decision

1. **Component-level redirect.** `IncidentDetailView` becomes a redirect
   shell: it loads the incident once (`getTestIncident`), then
   `router.replace`s to `/test-case/<FQN-encoded>` when an FQN is present,
   or to the product path by test-case id when only an id is present.
   Neither → the `noTestCase` error state. The route record
   (`observability/incidents/:id`) stays for compatibility; the page
   renders no tabs, no overview and no write entry. Its breadcrumb parent
   follows the landing page (`DETAIL_TO_LIST['observability-incident'] =
   'quality-test-cases'`).
2. **FQN loading.** `getTestCaseByName(fqn)` (`GET
   /v1/dataQuality/testCases/name/{fqn}`, same fields as `getTestCase`)
   is the new thin client. `TestCaseDetailView` dispatches by shape:
   UUID → `getTestCase`, anything else → `getTestCaseByName`. The route
   props function maps `fqn ?? id` → `id` and passes `tab` through; an
   unknown tab falls back to `overview`.
3. **Aliases.** `observability-incidents` gains the `incident-manager`
   alias; `quality-test-case` gains `test-case/:fqn` and
   `test-case/:fqn/:tab` (the #161 string-alias style). No
   `ADMIN_ROUTE_PREFIXES` / `ADMIN_ROUTE_RESOURCE` additions — both
   aliases sit outside `/admin` / `/settings` and gating is in-view.
4. **Issues links point at the issues tab.** The test-case detail's
   issues row links to `/test-case/<fqn>/issues` — the test-case
   detail's issues-tab anchor — not the record route, which would
   redirect to the default tab and lose the issues context. The list
   page's test-case name link goes to `/test-case/<fqn>`; the table
   column links to that table's asset route with `?tab=quality` (the
   product equivalent of the official Profiler → Data Quality tab).

## Consequences

- The old POST-based status form is gone with the record page; the only
  remaining `createTestIncident` caller is the reopen path
  (see ADR:2026-11-08-incident-task-flow-reuses-resolve-task).
- **P4 residual R-W2G14-9 (new):** `TestCaseDetailView` currently has no
  permission check at all — its edit/delete buttons are unconditional.
  This batch does not add a half gate to the detail page; P4 must wire
  the detail page's edit/delete/display-name gates and verify the
  redirect target does not bypass them.
- The `qualityTabs.ts` `supported` flags are untouched (condition
  16(ii)): the dimensionality tab stays unconditional in this batch and
  P4 makes it conditional on `dimensionColumns` being non-empty.
