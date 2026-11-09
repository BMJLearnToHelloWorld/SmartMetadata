# Incident status changes reuse resolveTask; reopen is the only POST path left

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group, F-D-2/F-D-3/F-D-5), review W2-2
- **Guard:** `src/features/quality/incidentManager.test.ts` (transition ids, resolve request shapes, reopen details), `src/views/observability/IncidentsListView.test.ts` (inline-write echo, menu limits)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group), `wave2/REVIEW-W2-G14.md` (conditions 2, 8, 9), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (F-D-2, F-D-3, F-D-5)

## Context

The old status-update path posted a brand-new test-case-resolution-status
record through `createTestIncident` (the incident record page's status form).
The official framework never does that for an open incident: it transitions
the task whose id is the incident's `stateId` — `transitionIncident` is
`resolveTask`, a `POST /v1/tasks/{taskId}/resolve` with a `transitionId`.
The product already has that client (`api/tasks.ts:272` `resolveTask`, and
`ResolveTaskRequest` already carries `transitionId` / `payload` / `comment` /
`resolutionType`), so no new tasks write API is needed.

## Decision

1. **All open-incident status changes go through `resolveTask`.** No new
   tasks write API is created. `transitionId` comes from
   `INCIDENT_TRANSITION_ID` (`New → new`, `Ack → ack`, `Assign → assign`,
   `Reassign → reassign`, `Resolve → resolve`), mapped by target status.
   The status menu options come from `INCIDENT_STATUS_MENU_OPTIONS`
   (`New`/`Ack` → all four; `Assigned` → `Assigned`/`Resolved` only;
   `Resolved` → all four, i.e. reopen) — never the `TEST_CASE_STATUS`
   workflow edge table, whose `Resolved` row is empty.
2. **Resolved requires reason + comment.** The reason vocabulary reuses the
   product's existing `FalsePositive/MissingData/Duplicates/OutOfBounds/Other`
   list and is sent in the resolve request body (`testCaseFailureReason` /
   `testCaseFailureComment` semantics), never via a POST of a new record.
   A missing reason or comment sends no request.
3. **Read-back replaces the submitted row.** After a successful transition the
   row is re-read with `getTestCaseIncidentByStateId(stateId, { limit: 1 })`
   and the list replaces the row matched by the **stateId it carried when
   submitted**. Matching the read-back's own stateId would miss the
   reopen-to-`New` case (a fresh task, hence a fresh stateId); matching by
   test-case FQN is wrong — one test case can have many incidents.
4. **Reopen keeps the POST path as its only caller.** A `Resolved` row moves
   through `reopenResolvedIncident`, per official: target `New` creates a
   task (`createTask`, category `Incident`, type `TestCaseResolution`,
   `about` = the `<#E::testCase::fqn>` entity link) and reads back by the
   new task id; targets `Ack`/`Assigned`/`Resolved` post a
   `createTestIncident` record with reopen details and read back by the
   reopened stateId (or the current one). `createTestIncident` is therefore
   **not deleted**; its single remaining caller is the reopen path, and the
   PR records that caller with this reason. There is no dual track: open
   incidents never POST.
5. **Assignee changes are the same transition.** Assign/reassign is
   `resolveTask` with `transitionId` `assign` (current `Assigned` →
   `reassign`) and `payload: { assignees: [single EntityReference] }`,
   followed by the same read-back replace.

## Consequences

- The incident record page's status form retires with the F-D-2 redirect
  (see ADR:2026-11-08-incident-detail-redirects-to-test-case); the record
  page is no longer a write entry at all.
- **F-D-3 is unverified**: resolving a real incident task against the
  deployed server (transition `ack` on a real `stateId`) needs an admin
  login and real incident data, which the implementer does not have. If
  live verification fails, the P3 task path stops and is reported for
  adjudication — the POST path is never silently kept as a fallback.
- The resolved-row reopen depends on the server reusing the stateId for the
  `Ack`/`Assigned`/`Resolved` targets (official's own comment); if a future
  server change breaks that, the read-back returns nothing and the row is
  left unchanged, never replaced by the wrong row.
