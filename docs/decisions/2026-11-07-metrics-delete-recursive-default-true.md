# Metric delete: product deleteMetricAsync defaults recursive to true

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-4
- **Guard:** `api/metrics.test.ts` (default sends `recursive=true`; explicit `false` sends `false`), `views/governance/MetricDetailView.test.ts` (detail delete passes `true` and the modal warns about variants)
- **Related:** A-D5 (a); W1-4 review condition 5; RULING-metrics.md §1.5; upstream pin `a3012259ca` (`rest/metricsAPI.ts:210`, `MetricListPage.tsx:619`)

## Context

Official `deleteMetricAsync(id, recursive = false)` defaults the flag
to `false`, but its only non-test call site — the list bulk delete —
passes `true`, with an ADR comment explaining why: a non-recursive
delete of a parent metric is rejected by the server with `metric is
not empty`, and the delete is always a recursive async soft delete
(never a hard delete; the hierarchy is recoverable). The product's
detail single delete previously called `deleteMetricAsync` with no
flag at all, so deleting a parent metric with variants failed.

## Decision

- The product signature is `deleteMetricAsync(id, recursive = true)`.
  The default differs from the official function's default (`false`)
  deliberately: every product caller must delete recursively (detail
  single delete now, list bulk delete in Wave 2), and a forgotten
  argument must fail safe towards the recursive soft delete A-D5
  requires, not towards a `metric is not empty` rejection.
- Call sites still pass `true` explicitly, so the intent is visible
  at the call and does not hide in the default.
- Wave 2 bulk delete convention, fixed here so it is not re-decided
  there: only top-level selected metrics are deleted, each with
  `recursive=true`, and the UI says "delete submitted", never
  "deleted" (the delete is async; the existing
  `metrics.asyncDeleteSubmitted` wording stands).
- The detail delete confirmation uses a metrics-specific modal copy
  (`metrics.deleteConfirmWithVariants`) that states the variants will
  be deleted as well; the generic `crud.deleteConfirm` copy has no
  such sentence.

## Consequences

- A parent metric with variants can be deleted from the detail page;
  the server-side soft delete removes the variants with it, and the
  hierarchy can be recovered.
- Any future non-recursive delete caller must pass `false`
  explicitly and justify it; the default no longer offers the
  failing behaviour by accident.
