# Ingestion pipelines are born unpaused, like official

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope: align with official, source-level, no hardcode)
- **Guard:** `smartmetadata-ui/src/views/ingestion/AddServiceIngestionView.test.ts` (create payload omits `pausePipeline`) + `smartmetadata-ui/src/views/ingestion/PipelineDetailView.test.ts` (toggle pauses, then offers Resume) + `smartmetadata-ui/src/views/ingestion/PipelinesListView.test.ts` (create payload omits `pausePipeline`; row toggle pauses, then offers Resume)
- **Related:** `~/workspace/work/official-analysis-20261111/track2-queued-pipeline.md`

## Context

The pipeline `icrm_monorepo-metadata` sat `queued` forever after every
trigger. The Airflow DAG was paused (`dag.is_paused = 1`); the scheduler,
the DAG parse/serialization, and the trigger path were all healthy —
paused was the only blocker. The DAG was unpaused manually (CLI
`airflow dags unpause`, 2026-11-11 22:05) and the queued runs started.

The paused state came from the product UI: every pipeline creation path
hardcoded `pausePipeline: true` in `airflowConfig`
(`AddServiceIngestionView`, `AddServiceView`, `EditPipelineView`,
`PipelinesListView`, `TestSuiteIngestionView`), and the detail view
defaulted the display to paused (`pausePipeline ?? true`). The plugin
bakes the flag into the DAG at deploy (`is_paused_upon_creation`), which
applies only when the `DagModel` row is created — re-parse and redeploy
never clear it, and `deploy()` never calls `set_enabled`. So the product
flow was: create paused, trigger queues forever, and there was no control
to escape, because the UI had no Pause/Resume toggle at all (no
`toggleIngestion` call anywhere in `smartmetadata-ui/src`).

Official at the pin does the opposite. The create payload is
`airflowConfig: { scheduleInterval, startDate, retries }` — no
`pausePipeline` at all
(`AddIngestion.component.tsx:307-312`); the spec default applies
(`ingestionPipeline.json`, `definitions.airflowConfig.properties.pausePipeline`,
`"default": false`). Official DAGs are therefore born unpaused.
Official's trigger deliberately has no paused check (the product's
`store.py` ruling §3.5 item 14 records this). Pause/resume is an
explicit, visible toggle in official
(`PipelineActions.tsx`, `playPauseButton`: label Pause/Resume by
`pipeline.enabled`, testids `pause-button` / `resume-button`, disabled
while `!pipeline.deployed`, gated on EditAll or
EditIngestionPipelineStatus, calling `handleEnableDisableIngestion`,
which POSTs `/services/ingestionPipelines/toggleIngestion/{id}`).

## Decision

- Every pipeline creation / edit payload omits `pausePipeline` — the
  key is never written, on create or on edit, in any of the five paths.
  The spec default (`false`) applies, so new pipelines are born
  unpaused, exactly like official's. The one exception is shape, not
  value: `airflowConfig` itself is schema-required on create, so the
  service wizard (which has no other airflow field) sends an empty
  `airflowConfig: {}` rather than omitting the object.
- The detail view's display default follows the spec:
  `pausePipeline ?? false`.
- The Pause/Resume toggle is added to the pipeline detail view (visible
  button beside Deploy/Trigger) and to the pipeline list (row-actions
  menu item), wired to the existing `toggleIngestion` server endpoint
  through a new thin UI client call. The shape follows official's
  `PipelineActions`: label Pause/Resume by the pipeline's `enabled`
  state, testids `pause-button` / `resume-button`, disabled while the
  pipeline is not deployed, tooltip with the not-deployed reason, gated
  on EditAll or EditIngestionPipelineStatus plus the P1 `isAdminUser`
  line, fail-closed.
- No unpause-on-trigger is added: official's trigger deliberately has
  no paused check.
- No server, plugin, or Airflow-image change. The toggle endpoint's
  branching on the entity's `enabled` field is unchanged (official's
  `toggleIngestion` branches the same way — fork = pin shape), so the
  `enabled=true` + paused-DAG incoherence was a product-created state,
  not an official deviation; once creation is fixed, the states stay
  coherent.
- The wizard help text that described the created pipeline as
  "(paused, not deployed)" is corrected to "(not deployed)": the
  pipeline is still not deployed by that flow, but it is no longer
  paused.

## Consequences

- A newly created pipeline deploys unpaused, and a trigger runs
  immediately instead of queueing forever.
- The existing pipeline `icrm_monorepo-metadata` was already unpaused
  manually; its entity still carries `airflowConfig.pausePipeline:
  true`. That flag is corrected to `false` via API at this round's live
  verification (needs Bai's transient admin login), so a future
  delete-and-recreate does not re-pause it. The code fix does not
  retroactively unpause anything.
- Editing a pipeline whose stored flag is `true` no longer re-sends the
  key, so the stored flag is left unset (reads as `false`) while the
  DAG's actual paused state is untouched by an edit — redeploy never
  clears `is_paused_upon_creation` either way.
