# Audit export polling compares the server's uppercase status names, never a normalized form

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: A-group batch; official 1:1 parity required, no documented deviations)
- **Guard:** `smartmetadata-ui/src/views/admin/AuditLogsView.test.ts` (uppercase fixtures; `FAILED`/`CANCELLED` fail fast without downloading); `smartmetadata-ui/src/api/r6Writes.test.ts` (uppercase passthrough fixtures)
- **Related:** upstream pin `a3012259ca` (`pages/AuditLogsPage/AuditLogsPage.tsx` poll branches); `CsvAsyncJob.Status` (`QUEUED`, `RUNNING`, `CANCELLING`, `CANCELLED`, `COMPLETED`, `FAILED`)

## Context

The poll endpoint returns a `CsvAsyncJob` whose `status` is a plain Java
enum serialized by Jackson as its name: uppercase, always. The product
compared lowercase `'completed'`/`'failed'`, which could never match, so
every export — including successful ones — polled 30 times (about 60
seconds), reported failure, and never downloaded. The existing tests used
lowercase fixtures, so they verified a protocol that does not exist and
masked the defect. The server chain is byte-identical to pin; only the
product frontend was wrong.

## Decision

- The poll loop in `AuditLogsView` compares the wire vocabulary verbatim:
  it keeps polling while the status is none of `COMPLETED`, `FAILED`,
  `CANCELLED`, and only `COMPLETED` proceeds to download.
- Never normalize case (`toLowerCase()` or otherwise) in the API layer or
  the view: the comparison uses the enum names as the server sends them,
  matching pin's verbatim string handling.
- `IN_PROGRESS` never enters the poll comparison. It belongs only to the
  WebSocket vocabulary; the REST poll can never return it, and pin's poll
  branches never compare it.

## Consequences

`QUEUED`, `RUNNING`, `CANCELLING`, and the initial `undefined` (the
create-job response carries no status) keep polling, as in pin. Test
fixtures must use the real uppercase wire values; a lowercase status
fixture is a fabrication that hides exactly this class of defect. The
poll rhythm (30 × 2s), the WebSocket/progress surface, and the missing
date-range requirement belong to other items and are untouched by this
decision.
