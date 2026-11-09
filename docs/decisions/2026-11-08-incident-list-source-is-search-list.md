# The incident list reads /search/list; the baseline endpoint is only a fallback

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group, F-D-1/F-D-6), review W2-2
- **Guard:** `src/api/testIncidents.test.ts` (thin clients, `mapIncident` fields), `src/views/observability/IncidentsListView.test.ts` (6 columns, 5 filter groups, numeric paging)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group), `wave2/REVIEW-W2-G14.md` (conditions 1, 2, 7, 14), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (F-D-1, F-D-6)

## Context

The old list read the baseline cursor endpoint (`GET
/v1/dataQuality/testCases/testCaseIncidentStatus`, hard-coded `limit: 50`),
which has no ES-backed totals, no sort control and no assignee / domain /
date-field filtering. The official classic list reads
`GET .../testCaseIncidentStatus/search/list`. The fork server at this
baseline implements that endpoint (`TestCaseResolutionStatusResource.java`):
params `limit` (default 10), `offset` (default 0), `startTs`, `endTs`,
`testCaseResolutionStatusType`, `latest` (default false), `assignee`,
`include` (default non-deleted), `testCaseFQN`, `originEntityFQN`,
`domain`, `sortField`, `sortType` (default desc), `dateField` (default
`timestamp`, allowable `timestamp` / `updatedAt`) — and **no `severity`
param**. Default sort field is `updatedAt`. The ES keys are `domains`
(plural) and `startTimestamp` / `endTimestamp`.

## Decision

1. **The list cuts to `/search/list`.** `listTestCaseIncidentsFromSearch`
   sends `limit: 10` (the official default), `offset = (currentPage - 1) *
   10`, `latest: true`, `include: 'non-deleted'`, `dateField` (default
   `timestamp`), and `domain` only when a non-default domain is active.
   `severity` is **never** sent — the endpoint does not accept it.
2. **F-D-6 is unverified.** The deploy-env response, totals, sorting
   (including the default `updatedAt` desc) and ES availability have not
   been live-verified (needs deployment credentials, which the implementer
   does not have). On failure the fallback is (b): revert the list data
   source to the baseline endpoint, record the failure evidence in plain
   text in the PR, and carry residual R-W2G14-4. The fallback is a
   decision point, not a silent degradation.
3. **P0 model: the incident model is not complete.** `TestIncident` gains
   `testCaseResolutionStatusDetails` (assignee / resolvedBy /
   `testCaseFailureComment` / `testCaseFailureReason`), `updatedAt`,
   `failureSummary` and `metrics`, and `mapIncident` stops dropping them.
   The `TestCase`-side gaps (`incidentStatus` unmapped,
   `dimensionColumns` / `inspectionQuery` unrequested, `tags` /
   `dataProducts` / `domains` unbuilt) remain a P4 residual — this record
   does not close them.
4. **Empty test-case search `q` becomes `*`.** This follows the official
   `searchTestCases` (`WILD_CARD_CHAR`) and the product's own precedent
   (`searchUsers` / `searchAssets` both default an empty query to `*`).
   It is not live-verified.

## Consequences

- Numeric pagination replaces the old hard-coded `limit: 50`; the shell
  gains an additive numeric-page mode and existing callers are unchanged.
- The list's "last updated" column shows `timestamp`; `updatedAt` is a
  filter/sort key only.
- Until F-D-6 is live-verified, the cutover rests on server-code evidence
  alone; the delivery marks it as such.
