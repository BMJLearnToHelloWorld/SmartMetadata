# Owned CSV jobs are a module-level in-memory Set, not persisted

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 G-12 drawer batch
- **Guard:** `api/csvJobs.test.ts` (mark/is round-trip; empty/undefined ids are ignored), `components/shared/CsvJobsTray.test.ts` (first fetch pre-dismisses terminal unowned jobs; an owned terminal job still surfaces)
- **Related:** REVIEW-W2-G12-DRAWER.md conditions 11–12; upstream pin `a3012259ca` (`CsvJobsTray.constants.ts:32-41`, `CsvJobsTray.component.tsx:140-160`, `MetricListPage.tsx:569-583`)

## Context

Official `markCsvJobOwned` keeps a module-level `Set<string>` of job
ids the current user started this tab session via an export or import.
The CSV jobs tray pre-dismisses jobs that are already terminal on its
first fetch (stale leftovers, e.g. after a page refresh) — except owned
jobs, which are never pre-dismissed, so a fast export that finishes
before the tray's first fetch still surfaces for download. The
product's tray had no such ownership: an export that completed before
the tray first polled could be silently hidden.

## Decision

- `api/csvJobs.ts` holds a module-level `Set<string>` with
  `markCsvJobOwned(jobId?)` and `isCsvJobOwned(jobId)`, verbatim in
  semantics to the official constants module: memory only, not
  sessionStorage, not persisted. Ownership lasts exactly this tab
  session.
- `exportMetricsCsvAsync` returns the job record's `jobId` (its
  return type changed from `unknown` to `{ jobId?: string }`); the
  metrics list marks the job owned after a successful export. When
  the server response carries no `jobId`, no id is invented — the
  ownership step is skipped, the tray refresh event still fires, and
  the gap is a residual (R-W2G12-6).
- The tray consults `isCsvJobOwned` on its first fetch only: terminal
  (COMPLETED / FAILED / CANCELLED) jobs that are not owned are
  pre-dismissed; owned jobs are never pre-dismissed.

## Consequences

- A just-started export always appears in the tray, even when it
  finishes before the tray's first poll.
- A page refresh still hides stale terminal jobs, as the official
  tray does — ownership does not survive a reload, by design.
- Other export/import call sites gain the same guarantee by calling
  `markCsvJobOwned` with their job id; nothing else changes.
