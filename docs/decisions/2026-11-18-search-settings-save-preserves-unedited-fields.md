# Search settings saves preserve every field the form does not own

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
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

## Consequences

Later Search UI work extends the owned key sets and the typed mappings; it must not revert
any save path to an enumerated payload, and any new save path (Restore, per-item save) must
reuse the same builders and rules. When the schema gains a field, the types and the parser
must gain it in the same change, or the new field repeats this data loss. The global page
keeps batch saving; per-item saving belongs to a later batch.
