# Missing i18n keys render as key paths: recover 10 keys from official wording, keep English where official Chinese is untranslated

- **Status:** Accepted
- **Revisions:** v1 2026-11-16 (initial)
- **Deciders:** Bai (ruling 2026-11-16: fix per official; where official has no Chinese, keep the English residual; a translation key path must never render in the UI)
- **Guard:** `smartmetadata-ui/src/i18n/referencedKeys.test.ts`
- **Related:** upstream pin `a3012259ca` (`openmetadata-ui/src/main/resources/ui/src/locale/languages/en-us.json`, `zh-cn.json`); scan evidence `~/workspace/work/xxx-dot-display-scan/FINDINGS.md` (not in-repo)

## Context

Bai reported `xxx.xxx`-style text in the UI. A full-tree scan of main
`ea784b4b` (637 `.vue`/`.ts` files, 3171 static `t()` references, checked
against both catalogs) found 10 keys referenced by components but present
in neither `en-US` nor `zh-CN`. The fork's `createI18n` setup has no
`missing` handler, so a key absent from both catalogs renders verbatim as
its dotted path. The existing lockstep test only proves the two catalogs
agree with each other, not that referenced keys exist, so these references
slipped through. The most visible instance was the pipeline run table,
whose three headers rendered as `ingestion.pipelines.startDate`,
`ingestion.pipelines.endDate`, and `ingestion.pipelines.duration` in a row.

## Decision

- **Recover all 10 keys with official wordings.** Each value is taken from
  the pin's locale files (`label.start-date`, `label.end-date`,
  `label.duration`, `label.remove`, `label.loading`, `label.retry`,
  `label.team-plural`, `label.role-plural`, `label.name`,
  `label.no-custom-properties-defined`), and each is used by pin
  components at the equivalent UI spot (run-table headers, remove buttons,
  loading text, retry buttons, team/role headings, name columns, the
  custom-properties empty state). The fork's key names stay in the fork's
  own namespaces; only the values follow official.
- **Where official Chinese is untranslated, keep the English residual.**
  The pin's `zh-cn.json` leaves `label.no-custom-properties-defined` as
  the English string `No custom properties defined`. The fork's `zh-CN`
  catalog carries the same English value for `asset.noCustomProperties`
  rather than inventing a rendering. The lockstep test requires the key
  to exist in both catalogs, so the residual is explicit, not a fallback.
- **A regression test resolves every static reference.** The guard scans
  all non-test `.vue`/`.ts` sources, extracts static `t()`/`$t()` first
  arguments (comments stripped, dynamic template/concatenation forms
  skipped), and fails on any key missing from either catalog, reporting
  the key and its referencing files. It also pins the 10 recovered values
  in both catalogs, including the English residual above.

## Consequences

- No key path can render for any statically referenced key; a future
  missing reference fails the suite instead of reaching the UI.
- 43 dynamic `t()` call sites (template literals and concatenation) are
  not resolved by the guard and were not individually verified; a
  dynamic-key expansion check remains a follow-up, not part of this fix.
- 972 defined-but-unreferenced keys are untouched; they are out of scope.
