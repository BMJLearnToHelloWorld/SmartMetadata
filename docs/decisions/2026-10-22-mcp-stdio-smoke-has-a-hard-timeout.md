# Job C MCP stdio smoke speaks NDJSON and must fail fast, never hang

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Job C live-smoke)
- **Guard:** `scripts/rebuild/test_live_smoke.py` (`test_run_mcp_stdio_times_out_when_child_never_replies`, NDJSON frame tests); `scripts/rebuild/test_rebuild_workflows.py` (`test_mcp_stdio_step_fails_fast_and_skips_only_without_jwt`)
- **Related:** ADR:2026-10-22-clean-room-mcp-is-a-standalone-apache-package; ADR:2026-10-22-rebuild-ci-is-a-separate-workflow; `docs/rebuild/VERIFY_RUNTIME.md`; run https://github.com/BMJLearnToHelloWorld/SmartMetadata/actions/runs/39738288686

## Context

Job C step **Optional MCP stdio search_entities** on
`main@0fb5255` ran until the job-level 60-minute timeout cancelled it (~56
minutes after the step started). HTTP `/mcp` was already correctly
unregistered (404/405). The hang was the stdio client talking to
`smartmetadata-mcp`:

- The client framed JSON-RPC with LSP `Content-Length` headers. MCP stdio is
  newline-delimited JSON. The server never saw a valid message and never
  wrote a reply.
- `run_mcp_stdio` advertised `timeout=30` but called blocking
  `stdout.read()` / `read1()`, so the deadline was never checked.

`continue-on-error: true` without a step timeout treated that hang as “optional”
only after a human cancelled the job.

## Decision

- Live-smoke MCP stdio uses **NDJSON** (one JSON-RPC object per line), matching
  `@modelcontextprotocol/server` `StdioServerTransport`.
- `run_mcp_stdio` must enforce its timeout without blocking forever on a pipe
  (reader thread + `queue.get(timeout=…)`). Default budget is 30 seconds.
- The Job C MCP step has `timeout-minutes: 5` and does **not** use
  `continue-on-error`. A real `search_entities` failure fails the job.
- Skip is allowed only when the JWT file is empty, with a warning naming that
  precondition. Bootstrap login (or `secrets.OM_JWT`) is how the token is
  obtained; the token is never hardcoded.
- Slim HTTP `GET /mcp` stays unregistered (404/405 only; 500 still fails).

## Consequences

Job C either asserts `search_entities` quickly, fails fast with a clear
error, or skips because there is no JWT. Revisit the 30s / 5min budgets only
if `npm ci` + MCP build on a cold runner needs more wall time; do not remove
the timeout to “wait longer for stdio.”
