# Tier 2 adds no *FilterPattern form fields for Doris, Greenplum, or MariaDB

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** reviewer (`connectionFields.test.ts` key-order assertions pin the three types' field sets)
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` condition 14 and §3 K-6-5, `RULING-lean-forms.md` §10 Q5

## Context

K-6-5 asked whether Doris, Greenplum, and MariaDB connections should get
`schemaFilterPattern` form fields. The specs do define filter patterns
with defaults (for example Doris `schemaFilterPattern`), but the tier 2
scope is the de-noised connection attributes of the seven types, and the
filter-pattern defaults are consumed by the ingestion layer, not by the
Vue connection form. Adding a field because "the user cannot see the
default" would invent form surface the batch did not scope.

## Decision

- This batch adds no `schemaFilterPattern` or any other `*FilterPattern`
  field to Doris, Greenplum, or MariaDB — nor to any tier 2 type (Kafka
  `topicFilterPattern`, Superset/Metabase dashboard/chart filter patterns,
  S3 `containerFilterPattern`, and Prefect/Dagster `pipelineFilterPattern`
  are likewise out of scope).
- The M6 spec defaults are not consumed by the Vue form.
- If a later batch wants filter-pattern fields, it needs its own ruling:
  this record forbids adding them as a drive-by in any other batch.

## Consequences

The three database types keep their tier 1 field sets exactly. Filter
patterns remain a later, separately decided scope — not a silent
extension of this batch.
