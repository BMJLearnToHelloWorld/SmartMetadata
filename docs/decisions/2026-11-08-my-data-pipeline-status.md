# My-data pipeline status: five pages, urgency ranking, per-row run history

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (follow-up: failed-row error line + meta, "{count} failed" status chip)
- **Deciders:** Bai
- **Guard:** `usePipelineStatus.test.ts`, `PipelineStatusWidget.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 10, official `hooks/usePipelineStatus.ts`, `components/MyData/Widgets/PipelineStatusWidget/`

## Context

Official reads five pages in parallel — one unfiltered plus one per
status bucket (Failed, Skipped, Pending, Successful), limit 10 each —
and ranks "All" as the bucket pages in urgency order followed by the
unfiltered page, deduplicated by pipelineId, capped at 10. Chip counts
are the server totals, not counts over the rows in hand. `Running` has
no chip but its pipelines still show under All. Each visible pipeline
gets its last 10 runs over 30 days, oldest first, from
`GET /v1/pipelines/{fqn}/status`; a failed history draws an empty strip
rather than failing the card.

## Decision

- `usePipelineStatus` ports that shape onto `useWidgetLoad` (5-minute
  TTL): five parallel `listPipelineSummaries` calls, `rankAllPipelines`
  for the All bucket, `derivePipelineStatus` for counts and rows.
- Run history reuses the existing `listCatalogPipelineStatuses`
  (`GET /v1/pipelines/{fqn}/status`), 10 runs over 30 days, reversed to
  oldest-first; a per-row failure is caught and draws an empty strip.
  The run type carries the server's `error.errorMessage` (official
  `PipelineStatus.error`) through the hook so a failed row can show it.
- A row shows official's meta line — service type · relative time ·
  duration (at most 2 units, from the summary's own start/end times) —
  and, when the last run failed, the latest run's error message,
  truncated to 3 lines. The card carries official's error status chip
  "{count} failed" while any pipeline failed its last run.
- The "Open pipelines" action navigates to the search page with the
  pipelines tab (`{ name: 'search', query: { tab: 'pipelines' } }`); a
  row opens the same tab filtered to that pipeline's FQN. Official's
  pipeline overview page is null in OSS, so there is no deeper target.
- The empty state offers adding a pipeline service when the viewer can
  create one (`useAddServiceAction('pipeline')`).

## Consequences

- The All view leads with failures even though the summary endpoint
  orders by name — the per-status pages are what make that possible.
- "N more" in the footer is `max(0, counts[bucket] - visibleRows)`; it
  is absent when the visible page already covers the server total.
