# Lineage settings saves preserve the fields the form does not edit

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `system.preferences.test.ts` (mapper round-trip of all 14 performance fields);
  `LineageConfigView.test.ts` ("keeps graphPerformanceConfig when a depth is edited and
  saved", "keeps graphPerformanceConfig across a second save without reloading")
- **Related:** official pin `a3012259ca` (`LineageConfigPage.tsx`, `lineageSettings.ts`,
  `SystemResource.java`)

## Context

`PUT /v1/system/settings` replaces the whole `lineageSettings` value; the server has no merge
branch for it. The product dropped `graphPerformanceConfig` at three linked points: the type
had no such field, the parser never read it, and the save hand-built a four-field object.
One ordinary depth save silently reset the cache, batching, and scroll configuration an
operator had tuned, with no indication in the UI. The official page keeps a snapshot of the
loaded settings and spreads it under the four edited fields, in that order.

## Decision

- `LineageSettings` carries an optional `graphPerformanceConfig` with the 14 schema fields,
  all optional and default-free.
- `settingAsLineage` maps the field with typed narrowing: a missing config stays missing,
  an empty object stays an empty object, `false` and `0` are kept, and a mistyped subfield
  drops only itself.
- The view holds a `storedConfig` snapshot of the loaded settings. The save payload is
  `{ ...storedConfig, <4 edited fields> }`, spread first and edited fields last; the order
  is part of the semantics.
- After a save, the snapshot refreshes from the PUT response; the view does not re-fetch.
- A save is refused while no load has succeeded, so a form that never loaded the stored
  settings cannot wipe the fields it does not edit.

## Consequences

A bare four-field PUT, a synthesized default performance config, and a move to PATCH are all
forbidden without a new record. The spread is last-writer-wins, as in the official page:
there is no compare-and-set on this endpoint, so a concurrent write between the load and
the save is overwritten. When the schema gains a `LineageSettings` field, the type and the
parser must gain it in the same change, or the new field repeats this data loss.
