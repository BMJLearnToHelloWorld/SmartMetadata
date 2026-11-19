# Search settings saves preserve every field the form does not own

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial); v2 2026-11-18 (entity owned key set extended to the official 7 keys; see Revision note)
- **Deciders:** Bai
- **Guard:** `system.preferences.test.ts` (parser round-trip including the real seed file,
  payload builders, effective ranking derivation); `SearchSettingsView.test.ts` and
  `SearchEntitySettingsView.test.ts` (save wiring through the real mapper)
- **Related:** ADR:2026-10-09-app-configuration-keys-are-owned-and-merged-on-write; official
  pin `a3012259ca` (`SearchSettingsPage.tsx`, `EntitySearchSettings.tsx`,
  `SearchSettingsUtils.ts`, `SearchSettingsHandler.java`)

## Context

`PUT /v1/system/settings` replaces the whole `searchSettings` document, and the server merge
rescues almost none of what the UI drops: it only backfills missing entity types, never fields
inside an existing entity configuration. The product lost data on two layers. The parser
(`settingAsSearch` / `mapAssetType`) rebuilt objects from a field whitelist, dropping
`matchType`, `condition.range`, `script`, `ranking`, `additionalSettings`,
`matchTypeBoostMultipliers`, `allowedFieldValueBoosts`, and `nlqConfiguration`; the two save
functions then rebuilt payloads by enumerating fields, and the global save coerced an absent
`enableColumnIndexing` to `false` with `Boolean()`. Measured against the seed: 27 entity
configurations, all 317 `searchFields` carrying `matchType`, and the 8-stage default ranking
were wiped by a single save. The official UI never enumerates: it spreads the loaded
configuration and overwrites only the keys the form owns.

## Decision

- Every `searchSettings` PUT payload is built by spreading the loaded configuration and
  overwriting only the keys the form owns. Enumerating fields to rebuild `SearchSettings`,
  `GlobalSettings`, or `AssetTypeConfiguration` is forbidden. The owned key sets are pinned by
  `Pick<>` types so writing a key the form does not own fails at compile time.
- `settingAsSearch` is lossless over the full schema. Closed shapes are mapped field by field;
  open subtrees (`ranking`, `additionalSettings`, `nlqConfiguration`) pass through as JSON
  deep copies that no UI code reads. The pass-through is a temporary shape, not a second
  contract.
- Nothing is synthesized: no defaults are filled in, stored values are not normalized, and no
  enum whitelist rejects unknown values. `undefined` means absent.
- An entity save writes the official effective ranking. `getEffectiveRankingConfiguration`
  and its `derive*` rules are ported 1:1 from the official `SearchSettingsUtils.ts`: the
  effective value is evaluated at load time from the loaded configuration, carried to the
  save, and never recomputed from edited `searchFields`. An entity without a ranking
  persists the derived value, as the official UI does.
- The pass-through subtrees are replaced by typed mappings when the Ranking and NLQ editing
  surfaces land.

## Revision note (v2, 2026-11-18)

The entity owned key set is extended from
`Pick<'searchFields' | 'highlightFields' | 'scoreMode' | 'boostMode'> & { ranking? }`
to the 7 keys the official entity save writes: `searchFields`, `highlightFields`,
`termBoosts`, `fieldValueBoosts`, `scoreMode`, `boostMode`, `ranking` (pin
`EntitySearchSettings.tsx:320-336`: `handleSaveChanges` builds `updates` with exactly
these 7 keys and calls `updateSearchConfig`). The v1 4-key set reflected the form
controls that existed at the time; it left the Boost editing surfaces (`termBoosts`,
`fieldValueBoosts`) without a save path through the owned builder. The extension is
official 1:1, not a new invention; the Decision rules above are unchanged (spread the
loaded configuration, overwrite owned keys only, `Pick<>` pins the set).
`EntitySearchDraft` in `smartmetadata-ui/src/api/system.ts` carries the extended set.
Related: the official `handleSaveChanges` returns early when there is no entity
configuration (`:321-322`); the sections batch adds the no-configuration guard at the
entity save call site (the v1 product save had no such guard).

## Clarification (2026-11-18, outside the v2 note above)

The v2 note above is quoted verbatim and is not edited here. Its
present-tense sentence about `EntitySearchDraft` states the A-group
design requirement, not the landed code: `EntitySearchDraft` in
`smartmetadata-ui/src/api/system.ts` is still the 4-key Pick
(`searchFields`, `highlightFields`, `scoreMode`, `boostMode`, plus
`ranking`), and the 7-key Pick has not landed. The extended-set claim
holds only once the 7-key Pick lands. The gap is an A-group gap, not a
regression of this batch; landing the 7-key Pick and its ownership are
for the coordinator to assign. Until then, readers must not take the
v2 note as evidence that the Boost editing surfaces have a save path
through the owned builder.

## Consequences

Later Search UI work extends the owned key sets and the typed mappings; it must not revert
any save path to an enumerated payload, and any new save path (Restore, per-item save) must
reuse the same builders and rules. When the schema gains a field, the types and the parser
must gain it in the same change, or the new field repeats this data loss. The global page
keeps batch saving; per-item saving belongs to a later batch.
