# Ingestion pipeline list/detail deep-dive (P-03–P-51)

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial); v2 2026-11-12 (verification-stage fixes: template ref unwrap, i18n key collision, `read()` overloads, Select handler types)
- **Deciders:** Bai (scope: list/detail chain of the pipeline deep-dive fixes, mirror official)
- **Guard:** `smartmetadata-ui/src/views/ingestion/PipelinesListView.test.ts`, `smartmetadata-ui/src/views/ingestion/PipelineDetailView.test.ts`, `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts`, `smartmetadata-ui/src/ingestion/useIngestionLogs.test.ts` (100 targeted tests green)
- **Related:** `~/workspace/work/pipeline-deep-dive/REPORT.md` (§2, §3, §7.1–§7.3, §8 C-01, §12)

## Context

The pipeline list and detail pages rendered a subset of official's
IngestionListTable / PipelineActions surface: no run-step detail, no live
logs, no kill, a Yes/No enabled column instead of status badges, no count /
schedule / recent-runs columns, no server sort, no orchestrator gating, and
the detail page reloaded everything for every status change. The deep-dive
report (REPORT.md §7.1–§7.3) specifies the full list/detail chain
(P-03–P-51) against the official pin `a3012259ca`, under the universal rule
C-01: Deploy/Trigger/Kill/Toggle return HTTP 200 with reason "Pipeline
Client Disabled" when the pipeline client is disabled, so every wired
operation must check the response reason/code (never toast success on 200
alone) and re-fetch row status after 500ms on success.

## Decision

- **One row-actions implementation.** `PipelineRowActions.vue` +
  `usePipelineRowActions.ts` serve the global list and the service-detail
  mini-table alike (Pause/Resume, Logs, Run, Deploy/Re-deploy, Edit, Kill,
  Delete with official's deployed/enabled branches and permission bits).
  No second Run/Deploy/Edit/Delete/Logs implementation exists anywhere.
- **Hand-rolled fetch SSE for logs** (`useIngestionLogs.ts`), no new
  dependency. Official uses `@microsoft/fetch-event-source` because native
  EventSource cannot send an Authorization header; the port uses fetch +
  ReadableStream with the same contract: auth header, `?after=` resume
  cursor, `runFinished`/`maxBytes` final vs `idleTimeout`/`maxDuration`
  resumable, exponential backoff (max 5, then paginated + 5s tail poll),
  one authoritative paginated refetch when the stream says the run
  finished. The server contract was verified against the product Java
  (`IngestionPipelineResource.java:1968`) and `logStreamEvent.json`.
- **Schedule cell shows the raw cron while cronstrue loads.** Official
  shows blank until its lazy cronstrue import resolves; the product shows
  the cron itself on the first line so an existing schedule is never
  rendered as absent. Never '—' for a scheduled pipeline.
- **No per-row status补取.** The list's single
  `fields=owners,pipelineStatuses` fetch is the only source for the Count
  and Recent Runs columns; a row with empty `pipelineStatuses` renders '—'
  rather than triggering N+1 requests.
- **Dead-tab registry removed with P-48.** The deleted i18n keys
  (`tasksTab`/`executionsTab`/`triggerTab`) were referenced only by
  unrendered registry entries, so the dead `trigger` entry left
  `INGESTION_PIPELINE_TABS` (overview + status, which the detail view
  renders itself) and the entirely unrendered `PIPELINE_ENTITY_TABS`
  (E-01 data-pipeline-asset tabs) were removed with them.
- **Server sort via `onChange` passthrough.** `SmTable` and
  `EntityListShell` forward antd Table's `onChange`; the list writes the
  name sort to `?sortOrder=` and forwards only legal
  `sortField='displayName'` / `sortOrder='asc'|'desc'` values.
- **`confirmDelete` gains async `onOk` (P-18).** When provided,
  `Modal.confirm`'s `onOk` returns the promise: antd shows confirm
  loading and keeps the modal open until it settles; a rejection keeps it
  open (retry or cancel) and the caller's promise stays pending.
- **SmTable expansion uses antd-vue's top-level props.** Verified against
  the installed ant-design-vue 4.2.6: Table has no `expandable` object
  prop (the old run-details modal passed one and its expansion silently
  never worked), and `expandedRowRender` receives a single object
  `{ record, index, indent, expanded }`, not the record positionally.
  SmTable now forwards `expandedRowKeys`, `expandedRowRender`,
  `expandIcon`, `rowExpandable`; the legacy `expandable` prop is kept
  (other callers still pass it) but is not the expansion mechanism.
- **Log `total` is a number.** The server returns `total` as a JSON
  number; mapping it through `asString` dropped it, so the tail check
  (`after >= total`) in `useIngestionLogs` could never clear `hasMore`.
  `IngestionPipelineLog.total` is now `number` and mapped with `asNumber`.
- **Toggle applies the returned pipeline locally.** The detail page's
  statuses-only refresh (P-25) does not refetch the pipeline, so the
  Pause/Resume label would stay stale; `onToggle` now merges the pipeline
  the toggle endpoint returns, then refreshes statuses after 500ms.
- **Modal refs are bound at top level, never through an object.**
  Template auto-unwrap applies only to top-level setup refs: passing
  `rowActions.logsPipeline` to a modal handed it the Ref object itself
  (vue-tsc caught it as a type error; at runtime the modal would have
  received a Ref, not a pipeline). Both the list and the service-detail
  view now destructure `logsPipeline`/`killPipeline` out of the
  composable return into top-level consts; handlers stay on the
  composable object.
- **Step-column key is `updatedRecords`, not `updated`.** The run-details
  "Updated" column collided with the pre-existing
  `ingestion.pipelines.updated` toast key ('Pipeline updated', also used
  by `EditPipelineView.vue`, which another worker owns); the column key
  was renamed in both locales and in the modal.
- **`useIngestionLogs`' `read()` is overloaded.** Required options
  (`fqn`, `runActive`) resolve to `T`; optional ones (`runId`, `title`,
  `pipelineType`) resolve to `T | undefined` — the single widened
  signature leaked `undefined` into every caller.
- **antd Select handlers take `unknown` and narrow.** antd-vue's
  `onChange`/`update:value` emit the broad `SelectValue`; handlers typed
  `(value: string)` or `(size: number)` are not assignable to it, so the
  list's filter/page-size/create-service handlers accept `unknown` and
  narrow inside (`typeof value === 'string'`, `Number(value)`).

## Consequences

- List and detail share one tested row-actions path; a gating change lands
  once and applies to both surfaces.
- Logs stream live while a run is active and paginate otherwise, with the
  error states (no run 404, empty log 400, client disabled 200-string,
  log-backend 503) shown as errors, never empty pages.
- The run-details modal's Logs button expands failed steps to their error
  + stackTrace — the expansion actually renders now.
- `hasMore` clears at the tail page instead of offering endless "Load more".
- The detail toggle flips Pause/Resume immediately without a full reload.
- The list and service-detail log/kill modals receive real pipelines, not
  Ref objects, and the vue-tsc gate is at zero new errors (203 vs the 205
  baseline — this batch also removed two pre-existing errors).
