# Metric bulk delete completion refresh is a bounded re-read, not a websocket

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 G-12 drawer batch
- **Guard:** `features/metrics/metricBulkDelete.test.ts` (404 sequence resolves true; never-gone times out false; non-404 read failures do not report gone), `views/governance/MetricsListView.test.ts` (success reloads after the re-read; failure keeps selection, dialog, and page)
- **Related:** A-D5 (a); REVIEW-W2-G12-DRAWER.md conditions 15–16; upstream pin `a3012259ca` (`MetricListPage.tsx:604-680` + `useAsyncDeleteProvider`, `EntityResource.java:1490`)

## Context

Official bulk delete refreshes the list when the async-delete job reports
a final status through the AsyncDeleteProvider websocket channel. The
product has no websocket channel, and the delete job id cannot be polled
instead: `EntityResource.deleteByIdAsync` mints the job id as a bare
`UUID.randomUUID()` — it is a temporary value, not a persisted entity
(`CsvAsyncJob` is a separate, unrelated entity), so
`GET /v1/csvAsyncJobs/{jobId}` on a delete job returns 404. The list
therefore cannot learn "the job finished" from any server push or
endpoint; it must observe the effect of the delete instead.

## Decision

- After a successful bulk delete submit, the list polls
  `GET /v1/metrics/name/{fqn}` for each submitted top-level metric
  FQN every 2s, for at most 30s (`waitForMetricsGone`).
- A 404 means "gone": a soft-deleted metric is invisible to the name
  lookup under the default include. A non-404 read failure means "not
  gone yet", never "finished".
- When every FQN is gone, or when the 30s budget expires, the list and
  the hierarchy reload once. On expiry the UI also warns that some
  deletions may not have finished yet and to refresh to confirm.
- No new endpoint is added; the re-read reuses the existing
  `getMetricByFqn`.

## Consequences

- Deleting a parent and its variants shows the hierarchy consistent
  once the server has applied the soft delete, without a websocket.
- A slow server (over 30s) costs one extra reload plus a warning, not
  a stuck list — but the warning is honest about the uncertainty.
- If live verification proves the re-read unstable (e.g. soft-delete
  visibility lagging), the fallback is optimistic-only (reload once
  right after submit) recorded as a residual — the fallback must not
  be adopted silently.
