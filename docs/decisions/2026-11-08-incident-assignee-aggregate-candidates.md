# Incident assignee candidates come from the search aggregate, merged with page rows

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group), review W2-2
- **Guard:** `src/features/quality/incidentManager.test.ts` (aggregate shape, candidate merge, bucket mapping), `src/api/search.test.ts` (fieldValue wrapping), `src/views/observability/IncidentsListView.test.ts` (candidate set incl. `deleted: null` + page merge)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group), `wave2/REVIEW-W2-G14.md` (conditions 2, 3, 6), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (F group)

## Context

The assignee filter and the inline assignee editor need the full
candidate set, not just the assignees visible on the current page. The
official `fetchIncidentAssignees` aggregates the `testCaseResolutionStatus`
index: field `testCaseResolutionStatusDetails.assignee.id`, size
`AGGREGATE_PAGE_SIZE_LARGE` (1000), `deleted: null`, `sourceFields:
['testCaseResolutionStatusDetails.assignee']`, `topHits: { size: 1,
sortField: 'timestamp', sortOrder: 'Desc' }`, and a domain query only for
a non-default domain. `deleted: null` is load-bearing — incident
documents have no top-level `deleted` field, so `deleted: false` would
match zero rows. The product had no aggregate client before this batch.

## Decision

1. **Thin client, verbatim shape.** `postAggregateFieldOptions(body)`
   (`POST /v1/search/aggregate`) wraps `fieldValue` as
   `.*${escapeESReservedCharacters(fieldValue)}.*` (or `'.*'` when empty)
   and posts the body as given; `escapeESReservedCharacters` is a
   verbatim port of the official `StringUtils.ts` map (22 characters).
   `AGGREGATE_PAGE_SIZE_LARGE = 1000` is a named constant, not a magic
   number.
2. **Candidate set = aggregate ∪ page rows.** `fetchIncidentAssignees`
   reads buckets via `top_hits#top`, takes the assignee from the first
   hit's `_source.testCaseResolutionStatusDetails.assignee`, skips
   `deleted` assignees and sorts by display name (lowercase).
   `mergeAssigneeCandidates` unions that set with the current page rows'
   assignees, deduplicating on `type:name`, aggregate entries first.
3. **Display names.** A candidate's name resolves through `getUserByName`
   (new thin client, `GET /v1/users/name/{name}`, bare call like the
   official) then `getTeamByName` (already exists); both failing degrades
   to `{ id: name, type: 'user' }`.
4. **Aggregate failure degrades, and is recorded.** On aggregate failure
   the picker still offers page rows plus its own user/team search; the
   failure is recorded as residual R-W2G14-6 — never silently page-only
   without a note.
5. **`UserTeamPicker` gains single-select mode.** The official filter and
   inline Owner are both single-select. The picker takes `single` and an
   optional `candidates` seed; multiple mode is unchanged. Its teams
   client-side-filter-only limitation stays as-is and is recorded as a
   residual — no new team search endpoint is built in this batch.

## Consequences

- The filter's assignee picker and the two inline assignee pickers share
  the same candidate list, so a user assigned to an incident on another
  page is still selectable.
- The aggregate call is domain-scoped exactly like the list: the domain
  query is sent only when a non-default domain is active, using the
  official `getQueryFilterForDataProducts` shape (`domains.fullyQualifiedName`
  term + prefix).
