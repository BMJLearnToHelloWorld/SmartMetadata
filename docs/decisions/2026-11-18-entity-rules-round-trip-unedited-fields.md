# Entity rules round-trip the fields the page does not edit

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `system.preferences.test.ts` ("parses all nine schema fields",
  "round-trips every field except enabled through getTypedSetting and updateSetting")
- **Related:** official pin `a3012259ca` (`basic.json` `semanticsRule`,
  `DataAssetRules.component.tsx`, `SystemResource.java`)

## Context

The server replaces the whole `entityRulesSettings` document on PUT and has no merge branch
for it. The product parser read only six of the nine `SemanticsRule` schema fields, so
`inherited`, `jsonTree`, and `provider` were discarded at load time and erased from storage
by the next save — including a save with zero edits. `jsonTree` is maintained by the Data
Contract semantics form, `inherited` records a Data Product inheritance fact, and `provider`
decides whether a rule can be deleted elsewhere. The official UI keeps whole rule objects in
state and never rebuilds a rule from a field subset; the product parser is an explicit field
mapping, so parser completeness is the product's preservation mechanism.

## Decision

- `settingAsEntityRules` covers all nine schema fields, and unedited fields round-trip
  verbatim. `jsonTree` passes through as an opaque string: never parsed, re-serialized, or
  validated.
- `provider` is a `string` in the product UI, and unknown values are kept. Narrowing it to
  the schema enum would discard future values — the same loss this record repairs.
- Missing or mistyped values become `undefined` and serialize away. No default is invented:
  no `false` for `inherited`, no `'user'` for `provider`, no `''` for `jsonTree`.
- Bulk PUT remains the only available UI write mechanism in this batch: the backend has no
  per-rule PATCH endpoint with compare-and-set, so the official toggle path cannot be
  adopted by the UI alone. That backend gap is reported for a ruling on the scope of the
  later batch; the concurrency window of bulk PUT is an open gap, not an accepted
  deviation. Index-based PATCH is rejected: indices drift under concurrent add and delete,
  which is why the official endpoint addresses rules by name.

## Consequences

Every addition or change to the schema's `semanticsRule` definition must update the type
and the parser together; no compile-time lock catches a missed field, so the guard tests
are the lock. A `{ ...r }` pass-through is rejected: it would forward unknown keys past
the schema's closed shape. The view needs no change: its spread already carries every key
the parser returns.
