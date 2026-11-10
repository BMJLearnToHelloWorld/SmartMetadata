# Sampler double gate fails closed when the profiler settings cannot be read

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** H track 1 implementer (Wave 2 milestone, ruling REVIEW-W2-H-TRACKS §2-① condition 4)
- **Guard:** `tests/test_sampler_messaging.py` gate matrix (`test_gate_fail_closed_without_reader`, `test_gate_fail_closed_when_settings_unreadable`, `test_gate_missing_sample_data_config_is_not_disabled`)
- **Related:** REVIEW-W2-H-TRACKS.md condition 4; RULING-data-execution.md H-Q-1.2/H-Q-1.3; `docs/decisions/2026-11-08-sampler-messaging-config-surface.md`

## Context

Sampling reads live message content off a broker and writes it into the
catalog. Two gates guard it, following the official shape:

1. The **pipeline gate**: `storeSampleData or generateSampleData` on the
   messaging pipeline's sourceConfig (official
   `common_broker_source.py:101-105`, `getattr(source_config,
   "storeSampleData", None) or getattr(source_config,
   "generateSampleData", False)`).
2. The **server gate**: `GET /v1/system/settings/profilerConfiguration`,
   `sampleDataConfig.storeSampleData` (official
   `messaging_service.py:158-166` `_is_sample_data_storing_globally_disabled`,
   read only when the pipeline gate is on).

The official server gate fails **open**: it returns "not disabled" when the
settings, the config value, or `sampleDataConfig` is unreadable or missing,
and swallows exceptions. Condition 4 required the product to decide this
point in an implementation ruling, not to copy the default.

## Decision

The product gate splits the unreadable cases:

- **Transport/endpoint failure, or no settings reader wired at all → do NOT
  sample (fail-closed).** The kill-switch is a governance control over
  exfiltrating live message content; when the control cannot be consulted,
  sampling must not run. The failure mode is benign: metadata extraction
  still runs, only sampling is skipped with a warning.
- **A well-formed 200 response that lacks `sampleDataConfig` → sample
  (fail-open).** This matches the official's None-handling and the spec
  default `storeSampleData: true` — no kill-switch configured means nothing
  is disabled.
- **Explicit `storeSampleData: false` → do NOT sample.** The only case in
  which the server gate disables sampling.
- The server gate is consulted **only when the pipeline gate is on** (lazy,
  cached per source run), so a pipeline that never opted in never pays for
  the settings read and never depends on the settings endpoint.

## Consequences

- Deliberate deviation from the official's blanket fail-open, recorded here
  with the reason: the official treats "cannot read the setting" and "no
  setting configured" as one case; the product distinguishes them because
  the first is a control failure and the second is an explicit default.
- A deployment whose settings endpoint is down loses sampling only, never
  metadata extraction.
- Revisit if the server starts returning a distinct "settings disabled"
  signal, or if official changes the gate semantics in a later pin.
