# Incident date-range key/title are opaque URL strings; no presets are invented

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; F group, R-6), review W2-2
- **Guard:** `src/views/observability/IncidentsListView.test.ts` (URL write-back, refresh persistence, clear-all)
- **Related:** `~/workspace/work/milestone-20261107/RULING-incident-manager.md` (F group, R-6), `wave2/REVIEW-W2-G14.md` (conditions 5, 6), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (F group)

## Context

The official `DateRangeFilter` passes only `{ startTs, endTs }` to its
`onApply` handler; the picker's `key`/`title` come from the selected
value in `useIncidentFilters.handleDateRangeChange`. The preset list
itself lives in the core `DateRangePicker` component
(`openmetadata-ui-core-components`), which is outside the pin snapshot,
so no preset list can be copied verbatim — and ruling R-6 preserves
`key`/`title` as opaque URL-passed strings rather than inventing them.

## Decision

1. **No presets are invented.** The product's `IncidentDateRangeFilter`
   is an antd `RangePicker` with no preset list. It emits `startTs`
   (start of day) and `endTs` (end of day) in ms epoch on apply, and a
   `clear` event on clear.
2. **key/title ride the URL untouched.** Filters write back through
   `router.replace`; `key`/`title` persist across unrelated filter
   changes and are dropped only by clear-all, which deletes
   `testCaseFQN` / `assignee` / `testCaseResolutionStatusType` /
   `startTs` / `endTs` / `dateField` / `key` / `title` and resets the
   page to 1.
3. **Date field.** Options are `timestamp` (Created at) and `updatedAt`
   (Updated at), default `timestamp`. A value change resets the page to
   1; re-selecting the same value keeps the page. Clear-all appears only
   when any filter is active — including `dateField === 'updatedAt'`.

## Consequences

- A URL carrying `key`/`title` round-trips them faithfully even though
  the picker never displays them; a future preset list, if one is ever
  ported from the core component, can consume the same keys without a
  URL-shape change.
- The date-range picker stays preset-free until the official preset list
  is available to copy; nothing in this batch invents a preset label.
