# Sampler flag lives in a typed messaging-scoped pipeline config block

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** H track 1 implementer (Wave 2 milestone, ruling REVIEW-W2-H-TRACKS §2-① conditions 3/15)
- **Guard:** `tests/test_config.py` (`test_messaging_metadata_pipeline_config_parses`, `test_messaging_metadata_rejects_unknown_keys`) + `smartmetadata-airflow-apis/tests/test_translation.py`
- **Related:** REVIEW-W2-H-TRACKS.md conditions 3/15; RULING-data-execution.md H-Q-1.2; `docs/decisions/2026-11-08-sampler-messaging-double-gate-fail-closed.md`; `docs/decisions/2026-11-08-sampler-messaging-kafka-python-mapping.md`

## Context

The `generateSampleData` flag (legacy `storeSampleData`) belongs to the
messaging pipeline only: it appears in the official
`messagingServiceMetadataPipeline.json` (boolean, default false) and in no
other pipeline schema. The product's `SourceConfig` is a shared, flat model
for every source type, so the flag needed a home that cannot leak into
database, dashboard, or other pipelines.

## Decision

- New `MessagingMetadataPipelineConfig(CamelModel)` in `config.py` with
  `generate_sample_data: bool = False` and legacy `store_sample_data:
  bool | None = None`; `SourceConfig.messaging_metadata:
  MessagingMetadataPipelineConfig | None = None` (alias
  `messagingMetadata`). The legacy field is declared so legacy pipeline
  configs do not fail `extra="forbid"` validation.
- The Airflow translation carries the flag only for `messagingService`
  pipelines, into `raw["source"]["messagingMetadata"]`
  (`translation.py`); any other pipeline type keeps the old ignore-warning
  for `generateSampleData`/`sampleDataQuery`.
- The UI exposes the flag only on messaging services' metadata pipeline
  form (`PipelineFormValues.generateSampleData`, `buildSourceConfig`
  messaging branch, `ServiceFilterFields` messaging checkbox), default off.
- The pipeline gate reads `storeSampleData or generateSampleData`
  (official getattr order) from this block.

## Consequences

- A messaging flag can never be set on a non-messaging pipeline by
  construction — the config surface, the translation, and the form all
  scope it the same way.
- The legacy `storeSampleData` name stays accepted (read-only compat);
  new pipelines should write `generateSampleData`.
- Revisit if the official schema ever moves the flag to another pipeline
  type: the block would gain a sibling, not a flat boolean on `SourceConfig`.
