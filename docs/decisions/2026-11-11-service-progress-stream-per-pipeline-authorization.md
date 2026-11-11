# A service progress stream authorizes and redacts per pipeline

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope: align with official, source-level, no hardcode)
- **Guard:** `openmetadata-service/src/test/java/org/openmetadata/service/resources/services/ingestionpipelines/ServiceProgressSubscriberTest.java` (denied view checks omit events; redaction masks a copy; name reuse rejects old-run events) + `openmetadata-service/src/test/java/org/openmetadata/service/monitoring/IngestionProgressTrackerTest.java` (`unresolvedRunCannotAdoptLaterPipelineIdentity`) + `openmetadata-service/src/test/java/org/openmetadata/service/monitoring/ServiceProgressStreamerTest.java` (per-subscriber replay/live filtering)
- **Related:** pipeline deep-dive report P-31 (`~/workspace/work/pipeline-deep-dive/REPORT.md` §7.2)

## Context

The service progress stream (`GET
/v1/services/ingestionPipelines/progress/service/{serviceType}/{serviceFqn}/stream`)
did only service-level `VIEW_ALL` authorization and then fanned out
every live run event under the service. Any user who could view the
service could see every pipeline's real-time progress events beneath
it, including pipelines they had no view permission for, and the
`DISCOVERY` events carried the pipeline entity with its secrets
unredacted. Progress reporting also bound the pipeline entity only to
the run's opening event, so after a name was reused an old run's events
could be mistaken for the new run's.

## Decision

- The endpoint validates `serviceType` against
  `Entity.getServiceEntityTypes()` first (400 `Invalid service entity
  type: <serviceType>` otherwise) and declares 400/403/404 responses.
- Every event passes through a `ServiceProgressSubscriber` built with
  the caller's identity (impersonated-by and active persona recorded
  at construction; `apply()` switches back to the caller identity
  before authorizing, so live callbacks running on a reporting PUT's
  thread are judged by the viewer's policy, and the producer's
  identity is restored afterwards).
- `visibleEvent` authorizes per pipeline: both `VIEW_BASIC` and
  `VIEW_ALL` on the pipeline, the event's pipeline id must equal the
  loaded pipeline's id, and the pipeline's owning service must be the
  streamed service. A denied check, a missing pipeline, or a pipeline
  of another service omits the event from the stream.
- When an event carries a pipeline entity, the subscriber deep-copies
  it and redacts secrets with
  `IngestionPipelineSecrets.decryptOrNullify(..., false)` — the
  original event is never mutated, so other subscribers still see
  their own copy.
- Every progress update binds the **current** pipeline entity
  (`progressPipeline(fqn)`, looked up by name on each update; a lookup
  miss is logged at debug and never fails progress reporting), and the
  tracker pins a run to the pipeline id it first reported with — a
  reporting worker that outlives its pipeline can never rebind its run
  to a replacement pipeline of the same name. The old
  DISCOVERY-only binding is removed.

## Consequences

- A user without pipeline view permission receives no events for that
  pipeline; a permitted user sees redacted entities only.
- After a name reuse, old-run events do not appear in the new run's
  stream.
- The service-level `VIEW_ALL` check on the endpoint is unchanged; the
  per-pipeline checks are additional, evaluated live on every event,
  so a permission change mid-stream takes effect without reconnecting.
