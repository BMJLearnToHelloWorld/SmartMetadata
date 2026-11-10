# No *FilterPattern form fields for any tier 3A type (K-6-5 restatement)

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connectionFields.test.ts` (key order — no `*FilterPattern` key appears in any 3A group), `connections.test.ts` (full payloads contain no filter-pattern attribute)
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A condition 3, ADR:2026-11-08-leanforms-tier2-no-filter-pattern-fields, K-S3 #173

## Context

K-6-5 (landed in M6, K-S3 #173) states that the lean forms model no
`*FilterPattern` fields: filter patterns are not part of the connection
form. The tier 3A specs carry them too — Rest
(`apiCollectionFilterPattern`, `apiEndpointFilterPattern`), Mlflow
(`mlModelFilterPattern`), OpenMetadata (`schemaFilterPattern`,
`tableFilterPattern`, `databaseFilterPattern`), GoogleDrive
(`directoryFilterPattern`, `fileFilterPattern`, `spreadsheetFilterPattern`,
`worksheetFilterPattern`), ElasticSearch (`searchIndexFilterPattern`),
OpenAI (`modelFilterPattern`), Mcp (`serverFilterPattern`) — and the two
spec copies (product + upstream) are in sync on this point.

## Decision

No `*FilterPattern` form field is added for any tier 3A type, and no
filter-pattern attribute is emitted by any 3A builder. The denoised
attribute counts for the batch exclude them. This is a restatement of
K-6-5 for this batch, not a new rule: the 3A work must not re-litigate
whether filter patterns belong in the form.

## Consequences

Filter patterns remain unmodelled in the lean forms for all three tiers.
If a future batch needs them, it revisits K-6-5 itself — a single
decision — rather than adding them type by type.
