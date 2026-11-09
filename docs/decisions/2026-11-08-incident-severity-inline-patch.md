# Incident severity edits PATCH the record with the product's JSON Patch helpers

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group), review W2-2
- **Guard:** `src/api/testIncidents.test.ts` (PATCH body, clear → remove op), `src/views/observability/IncidentsListView.test.ts` (severity success/failure echo)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group), `wave2/REVIEW-W2-G14.md` (conditions 2, 8)

## Context

The official `submitIncidentSeverity` diffs the record with
`fast-json-patch` `compare()` and PATCHes the result. The product does
not carry `fast-json-patch` as a direct dependency (it is only transitive
in the lockfile), and its established patch shape is the targeted field
ops in `admin/jsonPatch.ts`, used by `api/docStore.ts` with
`contentType: 'application/json-patch+json'`. Adding a new dependency for
one diff was not justified.

## Decision

1. **PATCH shape.** `patchTestIncident(id, patch)` sends `PATCH
   /v1/dataQuality/testCases/testCaseIncidentStatus/{id}` with
   `application/json-patch+json`. `severityPatch(current, next)` builds
   the ops from the product's own helpers: `setFieldPatch` (replace when
   the field exists, add when absent) for a new value, `removeFieldPatch`
   (RFC 6902 `remove`) when severity is cleared — the `remove` op is what
   the official `compare()` emits when a field disappears, and
   `setFieldPatch` cannot express it. An unchanged value produces no ops
   and no request.
2. **Failure semantics.** `submitIncidentSeverity` returns a boolean and
   never toasts: the view owns the failure toast (product convention — no
   `message.error` in feature modules), and on failure the row is left
   unchanged. On success the row's `severity` is replaced in place.
3. **Value domain.** `Severity1`–`Severity5`; display is `Severity N`
   (the number extracted from the value, per the official
   `getSeverityLabel`). There is **no severity filter control** on the
   classic list — the official classic list has none.

## Consequences

- No new dependency. The `removeFieldPatch` helper is the only addition
  to `admin/jsonPatch.ts`, and it exists because the official diff
  semantics require a `remove` op.
- The severity PATCH is a record-level write, independent of the task
  flow; it works on a row regardless of its status, and it is gated by
  the same row-level `EditStatus` permission as the other inline writes.
