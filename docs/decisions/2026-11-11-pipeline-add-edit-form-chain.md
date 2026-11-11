# Pipeline add/edit form chain: JSON Patch edits, UUID names, schedule cards, owners, TestSuite drawer

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope: pipeline deep-dive P-07, P-08(a)+(c), P-10, P-12–P-16, P-20, P-22, P-33–P-35, P-41, P-52, P-53)
- **Guard:** `smartmetadata-ui/src/views/ingestion/AddServiceIngestionView.test.ts`, `smartmetadata-ui/src/views/ingestion/EditPipelineView.test.ts`, `smartmetadata-ui/src/components/quality/TestSuitePipelineFormDrawer.test.ts`, `smartmetadata-ui/src/api/ingestionPipelines.test.ts`, `smartmetadata-ui/src/ingestion/schedule.test.ts`
- **Related:** `~/workspace/work/pipeline-deep-dive/REPORT.md` §4, §7.1–§7.3, §8, §12; upstream pin `a3012259ca`

## Context

The pipeline add/edit forms diverged from official (`AddIngestionPage`,
`EditIngestionPage`, `TestSuitePipelineFormDrawer`) in the ways the
deep-dive report records: edits PUT the whole entity (silently
overwriting fields the form never touched and recreating a deleted
pipeline instead of 404ing); create-time names were
`${service}-${type}` (a collision surface); the schedule was a free-text
cron with no period pickers and no validation; owners were never asked
for; retries / raise-on-error / debug log were missing or wrong-cased;
the TestSuite form was a page that navigated away on save; a deploy
failure was reported as a warning on a `reason` string or swallowed;
and the service wizard created a metadata pipeline the user never asked
for.

## Decision

- **Edits are JSON Patch (P-07).** `updateIngestionPipeline(id, ops)`
  sends `PATCH /v1/services/ingestionPipelines/{id}` with ops from
  `fast-json-patch` `compare(original, updated)`. Both patch builders
  spread the loaded pipeline whole, so `compare` only emits ops for
  fields the form changed — description, `startDate`, `pausePipeline`
  and unmodelled `sourceConfig` keys are preserved server-side. The
  edit load fetches `fields=owners,pipelineStatuses` so the patch
  baseline includes the saved owners.
- **Create-time names are UUIDs (P-15).** `name = generateUUID()` (port
  of official `StringUtils.generateUUID`); the name input is the
  displayName input (`data-testid="pipeline-name"`), defaulted from
  `getIngestionName` — six types (`metadata`, `profiler`, `lineage`,
  `dbt`, `application`, `TestSuite`) get an 8-random-character suffix,
  the rest are `${service}_${type}`, special characters become `_`.
  Edit keeps the name uneditable.
- **Schedule is the official card field (P-10).**
  `ScheduleIntervalField` ports `ScheduleInterval.tsx`: Schedule / On
  Demand cards, hour / day / week / month / custom period pickers
  (antd `Select`s for hour/minute/day-of-week/day-of-month — the
  product has no TimePicker precedent), and the period list filtered by
  `includePeriodOptions`. Create defaults to the daily cron
  `0 0 * * *`; edit keeps the saved value and an empty value is
  on-demand, never backfilled. The schedule step is disabled for
  `dataInsight` pipelines only.
- **Two cron validators, kept apart (P-10).** Submit runs the async
  `cronValidator` (port of `CronExpressionUtils.cronValidator`: 5
  segments, per-segment regexes, sub-hour rejection judged from
  cronstrue's description). Live input runs the synchronous
  `validateCronExpression` (port of `ScheduleInterval.utils.ts`),
  which expands the minute field's grammar instead. They disagree on
  multi-minute crons — `0,30 * * * *` passes `cronValidator` but is
  rejected by `validateCronExpression` — because official has the same
  two implementations with the same discrepancy; neither is "fixed" to
  match the other. An empty custom expression is a field-required
  error, not a silent fallback to on-demand.
- **Owners are required except settings pipelines (P-13).** Prefill
  order is saved owners, then service owners, then the current user
  (port of `AddIngestion.component.tsx`); the step-1 Next is blocked
  and the field highlighted while empty. Settings pipelines
  (`dataInsight`, `elasticSearchReindex`) are exempt — they have no
  parent service to inherit from. The create payload carries `owners`;
  `CreateIngestionPipelineRequest` gains `owners?: EntityRef[]`.
- **Retries / raise-on-error / debug log (P-14, P-33).** Retries is a
  number input (min 0, default 0, `Math.max(0, Number(...))` on
  submit); raise-on-error defaults on; debug log defaults off and
  maps to `loggerLevel` `'DEBUG'` / `'INFO'` (uppercase — the
  TestSuite form's `'Debug'` / `'Info'` was wrong). `AirflowConfig`
  gains `retries?: number` and `startDate?: string`.
- **Create carries yesterday's UTC midnight as `startDate` (P-34).**
  Ported verbatim from `AddIngestion.component.tsx` (`setUTCHours(0,
  0, 0, 0)` then `setDate(getDate() - 1)`, sent as ISO 8601). Edit
  keeps the original via the patch; the TestSuite create does not set
  it.
- **Create errors distinguish the three outcomes (P-35).** A 409 is
  an already-exists toast; a non-409 failure looks the pipeline up by
  FQN — if it exists, the create succeeded and the deploy failed, so
  the success screen opens with a deploy retry; otherwise the create
  itself failed. Success enters a third success step (success info +
  View Service + deploy retry only on deploy failure) instead of
  navigating away.
- **Deploy is gated on Airflow availability (P-41).**
  `isAirflowAvailable()` ports `AirflowStatusProvider`: available
  exactly when the orchestrator status answers `code === 200`; a fetch
  failure is unavailable. All three save flows skip the deploy with a
  warning when it is false. A deploy response carrying `reason` is a
  failure (C-01), never a success.
- **The service wizard no longer creates a pipeline (P-12).** The
  filter step's entered scope is merged into the service create
  request's `connection.config` — non-default values only
  (`includeViews` only when false, text fields only when non-blank,
  `generateSampleData` only when true) — and the add-ingestion form
  prefills its filter defaults from there (P-08(c),
  `getDefaultFilterPropertyValues`). The old `filterScopeEntered` +
  create-pipeline branch is deleted.
- **The TestSuite form is a drawer on the Pipelines Tab (P-22).**
  `TestSuitePipelineFormDrawer` ports the official drawer (title
  Add/Edit Pipeline, Create/Save + Cancel, `form.reset` on every
  open). Save closes the drawer and the host refreshes the list; the
  old add/edit routes redirect to the suite detail with
  `?tab=pipeline`, which the detail view honors on mount.
  `selectAll` defaults false with at-least-one validation; an empty
  selection submits `testCases: undefined`; `entityFullyQualifiedName`
  is set only for basic suites (undefined for bundles); the case
  picker is server-side scoped by `testSuiteId` (+ `entityLink` and
  `includeAllTests` for basic suites); edit loads by FQN direct GET
  and saves with the ported `buildTestSuiteIngestionPatch`.
- **Type surface (P-16).** `PIPELINE_TYPES` is official's 12.
  `AGENT_KINDS_BY_SERVICE` adds `dbt` + `autoClassification` on
  database/messaging/storage per `getSupportedPipelineTypes`
  (flag-gated in official; the product's table carries the kinds the
  service types in the branch actually support). Settings pipelines
  (`dataInsight`, `elasticSearchReindex`) are created under the
  OpenMetadata metadata service — the product has no Applications
  settings pages and the create schema requires a service ref.
  `sourceConfigTypeForPipeline` maps the new types (`dbt` → `DBT`,
  `autoClassification` → `AutoClassification`, `dataInsight` →
  `dataInsight`, `elasticSearchReindex` → `MetadataToElasticSearch`).
  The add-ingestion type is route-determined (validated against the
  service's kinds, falling back to the first kind); the type dropdown
  is read-only there.
- **Description is gone from both forms (P-52).** The edit value is
  preserved by the JSON Patch, not by an input.

## Consequences

- Edit saves no longer overwrite `description`, `startDate`,
  `pausePipeline`, `retries` or unmodelled `sourceConfig` keys; a
  save of an unchanged form sends an empty ops array.
- The product server must accept `loggerLevel` `'DEBUG'` / `'INFO'`
  (P-33) and the `includeViews` / filter keys inside a service
  `connection.config` (P-12) — both need the post-deploy live check;
  a 400 on either is a server-side gap, not a form bug.
- `fast-json-patch` and `cronstrue` are real dependencies now
  (`package.json` + lockfile), because the submit validator is
  cronstrue-description-based and the edit is a JSON Patch.
- `ServiceFilterFields.vue` / `serviceFilterFields.ts` are untouched:
  the excludes inputs (P-08(b)) and the schema-driven form (P-08(d))
  are a later worker's; the (a)/(c) work lives in `sourceConfig.ts`
  and the views' prefill logic so it survives that replacement.
