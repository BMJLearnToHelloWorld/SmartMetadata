# A runner name belongs to the deployed pipeline

- **Status:** Accepted
- **Revisions:** v1 2026-11-05 (initial)
- **Deciders:** Bai (scope: align with official, source-level, no hardcode)
- **Guard:** `openmetadata-service/src/test/java/org/openmetadata/service/jdbi3/IngestionPipelineRepositoryTest.java` (namesake deploy/run/delete tests + `runnerNames` parameterized cases + case/separator variants `My.Pipe` / `my-pipe` / `MY_PIPE`)
- **Related:** pipeline deep-dive report P-19 (`~/workspace/work/pipeline-deep-dive/REPORT.md` §7.1)

## Context

Some ingestion runners know a pipeline by its name alone: Airflow uses the
pipeline name as the `dag_id` (and the DAG/config filenames), Kubernetes
uses it for the CronJob, ConfigMap and Secret names. A pipeline name,
however, is unique only within its service. Two pipelines of different
services that share a name therefore map onto one runner object: the
later deploy overwrites the earlier pipeline's DAG file and config JSON,
and a later trigger, toggle, kill or delete acts on the wrong pipeline.
The first pipeline keeps looking normal in the UI while the runner
executes someone else's configuration — a silent wrong-pipeline run,
not an error.

The product had no guard at all: no `addressesPipelinesByName` on the
client, no namesake lookup, and toggle/kill/deploy/run/delete all went
straight to the runner.

## Decision

- `PipelineServiceClientInterface.addressesPipelinesByName()` declares
  whether a runner addresses pipelines by name alone; the default is
  `false` (runners that tell pipelines apart by more than the name keep
  it). `AirflowRESTClient` returns `true`. The metered decorator
  delegates to the wrapped client.
- `IngestionPipelineRepository.assertOwnsRunnerName` refuses a runner
  call when another service has a deployed pipeline whose name the
  runner could confuse with this pipeline's name, throwing
  `BadRequestException` with the message `Ingestion pipeline '%s'
  cannot be sent to the ingestion runner: the runner knows it by the
  same name as the deployed pipeline '%s'. Recreate one of the two
  under another name.` (both FQNs in the message).
- Name equivalence (`runnerNames`) is deliberately coarser than any
  runner: case, separators and edge punctuation are ignored, and both
  normalizations (replace-then-lowercase, lowercase-then-replace) count,
  because Airflow replaces non-ASCII letters, Kubernetes lower-cases
  first, and some characters (`İ`, the Kelvin sign) lower-case to ASCII.
- The lookup (`listOtherDeployed`) covers every deployed pipeline but
  the caller, **soft-deleted ones included**, because a soft delete
  leaves the runner object in place.
- The guard is enforced at every runner call site: deploy, run,
  toggle, kill. An update that requires redeployment reaches it through
  `deployIfRequired` → `deployPipelineBeforeUpdate` →
  `deployIngestionPipeline`, and a `BadRequestException` there is
  rethrown as-is instead of being wrapped in a generic deployment
  failure.
- Deleting a pipeline that has a deployed namesake does **not** delete
  the shared runner object: it logs a warning and redeploys the
  survivor so the runner object holds the survivor's own configuration
  again. A failed redeploy only warns — the delete itself has already
  happened.

## Consequences

- Two same-named pipelines of different services can no longer silently
  share one DAG: the second deploy/run/toggle/kill is refused with a
  400 naming both pipelines.
- Deleting one namesake restores the survivor's DAG instead of deleting
  the shared runner object out from under it.
- Runners that address pipelines by more than the name are unaffected
  (the default `false` skips the lookup entirely).
