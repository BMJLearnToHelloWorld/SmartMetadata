# Job C MCP stdio smoke speaks NDJSON and must fail fast, never hang

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial) · v2 2026-10-22 (hang site proven from Job C logs + local repro)
- **Deciders:** SmartMetadata rebuild (Job C live-smoke)
- **Guard:** `scripts/rebuild/test_live_smoke.py` (`test_run_mcp_stdio_times_out_when_child_never_replies`, NDJSON frame tests); `scripts/rebuild/test_rebuild_workflows.py` (`test_mcp_stdio_step_fails_fast_and_skips_only_without_jwt`)
- **Related:** ADR:2026-10-22-clean-room-mcp-is-a-standalone-apache-package; ADR:2026-10-22-rebuild-ci-is-a-separate-workflow; `docs/rebuild/VERIFY_RUNTIME.md`; run https://github.com/BMJLearnToHelloWorld/SmartMetadata/actions/runs/39738288686

## Context

Job C step **Optional MCP stdio search_entities** on
`main@0fb5255` (run 39738288686, job 119690250836) was cancelled at
`08:10:28Z` after starting `07:13:59Z` (~56 minutes). The job
`timeout-minutes` is 60 (job started `07:10:13Z`). HTTP `GET /mcp` had
already passed as unregistered.

### Hang site (proven)

From that step's log:

- `OM_JWT_SECRET` was empty. The skip warning (`No JWT for MCP stdio; skip`)
  did **not** print. Missing JWT is not the hang.
- `npm ci` **finished**: `added 59 packages … in 1s` at `07:14:00Z`.
- `npm run build` **started**: `> tsc -p tsconfig.json` at `07:14:00.377Z`.
  `tsc` prints nothing on success. The next log line is the cancel at
  `08:10:28Z`. There is no `live_smoke.py` output (`==> healthcheck` /
  `==> MCP stdio`).
- Same SHA, Job A `mcp-build`: `tsc` banner `07:08:19.401Z`,
  `mcp-build ok` `07:08:20.708Z` (~1.3s). So `tsc` hanging for 56 minutes
  on this package is not credible.
- CI Python stdout is a pipe (block-buffered). Missing `==> healthcheck`
  lines therefore do **not** prove Python never started. After this ADR,
  the build is a separate step and live-smoke runs `python3 -u`.

Local repro against `main`'s `live_smoke.py` (not this branch):

- `run_mcp_stdio(..., timeout=1)` talking to a child that never writes
  stdout was killed by OS `timeout 5` with exit **124**. The 30s deadline
  never fired. `Popen.stdout` is a `BufferedReader` with `read1`; the
  original code prefers `read1(4096)`, which still blocks until a byte
  arrives.
- The original encoder emits LSP `Content-Length: N\r\n\r\n{json}` with
  **no trailing newline**. `StdioServerTransport` / `ReadBuffer` splits
  on `\n` and JSON-parses each line. Sending those LSP frames to
  `node smartmetadata-mcp/dist/index.js` produced **0 stdout bytes** in a
  2s `select`. The same messages as NDJSON produced the initialize
  result immediately (170 bytes). A later NDJSON `tools/call` against a
  mock catalog returned `id=2` in 0.15s.

Causal chain: JWT present → npm ci done → tsc done (silent; proven fast
on Job A) → `live_smoke.py --mcp-command` sends LSP frames → MCP writes
nothing → blocking `read1` ignores the 30s deadline → job-level 60-minute
cancel.

## Decision

- Live-smoke MCP stdio uses **NDJSON** (one JSON-RPC object per line), matching
  `@modelcontextprotocol/server` `StdioServerTransport`.
- `run_mcp_stdio` must enforce its timeout without blocking forever on a pipe
  (reader thread + `queue.get(timeout=…)`). Default budget is 30 seconds.
- Job C splits **Build smartmetadata-mcp** (`timeout-minutes: 3`) from
  **Optional MCP stdio search_entities** (`timeout-minutes: 2`, `python3 -u`).
  Neither step uses `continue-on-error`. A real `search_entities` failure
  fails the job.
- Skip is allowed only when the JWT file is empty, with a warning naming that
  precondition. Bootstrap login (or `secrets.OM_JWT`) is how the token is
  obtained; the token is never hardcoded.
- Slim HTTP `GET /mcp` stays unregistered (404/405 only; 500 still fails).

## Consequences

Job C either asserts `search_entities` quickly, fails fast with a clear
error, or skips because there is no JWT. The next hang, if any, is named
by which step GHA cancels. Do not remove the timeouts to “wait longer
for stdio.”

## Amendment

v2 2026-10-22: hang site proven from run 39738288686 logs plus local
LSP-vs-NDJSON and blocking-`read1` repros. Combined npm+python step
replaced by two timed steps and `python3 -u`.
