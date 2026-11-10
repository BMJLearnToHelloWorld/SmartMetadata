# Profiler fqn write path posts each column profile as its own CreateEntityProfile

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (system profiles, R-W2H2-2)
- **Deciders:** Bai
- **Guard:** `test_sink_posts_each_column_profile_on_fqn_path`, `test_sink_fqn_path_without_columns_posts_table_only`, `test_sink_failing_column_post_surfaces`, `test_sink_posts_each_system_profile_on_fqn_path`, `test_sink_fqn_path_without_system_posts_table_and_columns_only`, `test_sink_failing_system_post_surfaces` in `smartmetadata-ingestion/tests/test_profiler_quality.py`
- **Related:** R-W2H2-1, `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-H-TRACKS.md`, official `EntityProfileRepository.addProfileData`, `openmetadata-spec/src/main/resources/json/schema/api/data/createEntityProfile.json`

## Context

`MetadataRestSink._write_profile` has two paths. The legacy `tableId` path PUTs one
`CreateTableProfile` bundling `tableProfile` + `columnProfile` + `systemProfile`, so
nothing is lost. The fqn path POSTs a single `CreateEntityProfile` carrying only the
table-level `profileData` and silently dropped `record.column_profile` — every column
metric the profiler computed never reached the server. That made the fqn path unusable
for same-table live comparison of the profiler (c) metrics.

The official profiler never posts per-column: it publishes one PUT
`/v1/tables/{id}/tableProfile` with a `CreateTableProfileRequest` embedding the table
profile plus `columnProfile[]` plus `systemProfile[]`. But the official
`CreateEntityProfile` schema defines `profileData` as a oneOf of `tableProfile` /
`columnProfile` / `systemProfile`, and `profileTypeEnum` as `column` / `table` /
`system` — a column profile is explicitly designed to be its own request on the new
API. Server-side, `EntityProfileRepository.addProfileData` confirms the contract: for
`profileType=COLUMN` it deserializes `profileData` as a `ColumnProfile`, resolves the
column by `columnProfile.getName()` on the table entity addressed by the path FQN, and
stores the profile against the column FQN. The path FQN stays the table FQN; the
column is identified by `profileData.name`, which every profiler-built column dict
carries.

## Decision

On the fqn path, after posting the table profile, the sink posts one
`CreateEntityProfile` per entry of `record.column_profile` to the same
`POST /v1/entity/profiles/name/{entityType}/{fqn}` endpoint, with `profileType`
`"column"`, `profileData` the column dict verbatim, and `timestamp` the record
timestamp when set. The table post stays first and its result stays the return
value. A failed column post raises exactly like a failed table post — it must
surface, never be swallowed. An empty column list posts the table only. The legacy
`tableId` path is untouched.

## System profiles (v2, R-W2H2-2)

The same silent drop applied to `record.system_profile`: only the Redshift
profiler sets it on fqn records, but the sink is generic and a silent drop is a
silent drop. The server accepts a system profile on this endpoint: the
`CreateEntityProfile` schema's `profileData` oneOf includes `systemProfile`,
`profileTypeEnum` includes `"system"`, and
`EntityProfileRepository.addProfileData` dispatches `profileType=SYSTEM` to
`insertSystemProfile`, which deserializes `profileData` as a `SystemProfile`
and dedupes/stores it by `systemProfile.getTimestamp()` +
`systemProfile.getOperation().value()` under the table FQN. The `SystemProfile`
schema carries `timestamp`, `operation` (`UPDATE`/`INSERT`/`DELETE`/`WRITE`)
and `rowsAffected`; the server reads `timestamp` and `operation` from
`profileData` — the Redshift producer (`SystemProfileRow.as_dict`) emits
exactly those keys, so the dict is posted verbatim, no shape invented.

Decision: on the fqn path, after the column posts, the sink posts one
`CreateEntityProfile` per entry of `record.system_profile` to the same
endpoint, with `profileType` `"system"`, `profileData` the system dict
verbatim, and `timestamp` the record timestamp when set. A failed system post
raises like a failed table post. An empty system list posts nothing extra.
The legacy `tableId` path is untouched. R-W2H2-2 is closed by this change.

## Consequences

- The fqn path now carries the full profile (table + columns + systems); the 21 profiler (c)
  metrics can be live-compared on the fqn path once this fix lands and is
  live-verified. Until then, same-table live comparison still uses the legacy path.
- This fix is based on main `0bad98161`; H-① (`m2-wave2-h-sampler`) also touches
  `sinks/metadata_rest.py` and H-② (`m2-wave2-h-profiler-c`) touches the profiler
  code, both unmerged — rebase onto them at merge time.
