# IT bootstrap sets the static relationship repository before system data migrations

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** K-S4 bootstrap NPE (Bai chose option (a) 2026-11-10)
- **Guard:** `make java_affected_run` for `MetricGroupResourceIT` on the server (zero seed errors, S3Proxy starts, 33 @Test execute)
- **Related:** `~/workspace/work/k-s4-bootstrap-npe/RULING.md`; PR #178

## Context

`TestSuiteBootstrap.startApplication` runs `validateAndRunSystemDataMigrations`
before `APP.before()`, while the static `Entity` relationship repository is only
set in `OpenMetadataApplication.run()` — so the v2.0.0 migration's
`seedDefaultTaskWorkflow` NPEs in `EntityRepository.findFrom` (all 15 default
task workflows never seeded; the errors are caught, so bootstrap proceeds, but
the IT database silently lacks them). Upstream pin `a3012259ca` and upstream
HEAD (`2975344bc3`) have the identical ordering and the identical unguarded
deref — this is an upstream bug, not a fork regression.

## Decision

In `TestSuiteBootstrap.validateAndRunSystemDataMigrations`, immediately after
`Entity.setCollectionDAO(...)`, set the static repository the same way
production does (`OpenMetadataApplication.run():342–344`):

```java
Entity.setEntityRelationshipRepository(
    new EntityRelationshipRepository(Entity.getCollectionDAO()));
```

Test-infra only: `openmetadata-integration-tests/.../TestSuiteBootstrap.java`.
No production code touched, no upstream-alignment conflict (the file already
diverges from the pin by deliberate fork changes).

## Alternatives considered

- Reorder migrations after `APP.before()`: wrong design — the app only
  validates migrations at run and expects them already applied.
- Null-guard `EntityRepository.findFrom`: masks the defect (owners silently
  empty, workflows still unseeded).
- Set it inside `Entity.initializeRepositories`: broader blast radius; the
  method has no DAO in hand for the relationship repo.
- Fix inside `seedDefaultTaskWorkflow`: same masking problem.
