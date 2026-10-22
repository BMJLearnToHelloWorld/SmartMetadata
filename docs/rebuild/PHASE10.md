# Phase 10 — Clean-room MCP (optional MVP)

Phase 10 adds a **new** Apache-2.0 package at `smartmetadata-mcp/`. It exposes
an MCP server for agents against Apache `openmetadata-service` REST. It does
not copy, transpile, import, or depend on `openmetadata-mcp/`.

Earlier phases: [PHASE0.md](PHASE0.md)–[PHASE9.md](PHASE9.md).
ADR:2026-10-22-shippable-dist-excludes-ccl-modules still applies.
New boundary: ADR:2026-10-22-clean-room-mcp-is-a-standalone-apache-package.

## What shipped

Standalone Node process. **Not** a Maven module. **Not** added to
`openmetadata-dist`. Official `/mcp` on the Java server stays unregistered
without the CCL jar (Phase 0).

| Piece | Location | Contract |
|---|---|---|
| Config | `src/config.ts` | `OM_API_URL` / `OM_HOST_PORT`, `OM_JWT`, `OM_TIMEOUT_MS`. Missing JWT fails closed |
| REST client | `src/client.ts` | `Authorization: Bearer`. Self-written `fetch` wrapper |
| Tools | `src/tools.ts` | Seven OSS tools, documented paths only |
| MCP server | `src/server.ts`, `src/index.ts` | **stdio** JSON-RPC via `@modelcontextprotocol/server` |
| License gate | `scripts/rebuild/check_ccl_free_mcp.py` | Fails on CCL MCP imports or deps |

### Tools

| Tool | Server contract |
|---|---|
| `search_entities` | `GET /v1/search/query` (`index` default `dataAsset`, `size` max 50, `include_aggregations=false`) |
| `get_table` | `GET /v1/tables/name/{fqn}` |
| `get_topic` | `GET /v1/topics/name/{fqn}` |
| `get_lineage` | `GET /v1/lineage/{entity}/name/{fqn}` — depths clamped 0–3 (LineageResource `@Max(3)`) |
| `list_glossaries` | `GET /v1/glossaries` |
| `list_tags` | `GET /v1/tags` |
| `create_conversation` | `POST /v1/conversations` `{ message, about }` (`about` = `<#E::{type}::{fqn}>`) |

## How to run

Slim server from [PHASE0.md](PHASE0.md). Create a bot JWT from
[PHASE2.md](PHASE2.md) (Bots) or a PAT.

```bash
cd smartmetadata-mcp && npm install && npm run build
export OM_API_URL=http://localhost:8585
export OM_JWT=...
npm start
```

Point an MCP host at `node /absolute/path/to/smartmetadata-mcp/dist/index.js`
with those env vars. Stdio is the only shipped transport.

### Manual verify

1. Missing `OM_JWT` exits before any HTTP call.
2. `search_entities` with `q=*` against a running server returns search JSON
   (empty hits on a fresh catalog is fine).
3. `get_table` / `get_topic` with a real FQN match `GET /v1/tables|topics/name/{fqn}`.
4. `get_lineage` with `upstreamDepth=99` is sent as `3`.
5. `list_glossaries` / `list_tags` return the list payloads (seeded
   classifications usually exist).
6. `create_conversation` with a real table FQN posts
   `{ message, about: "<#E::table::{fqn}>" }`.
7. `python3 scripts/rebuild/check_ccl_free_dist.py` still passes. Dist assembly
   still excludes `org.open-metadata:openmetadata-mcp`.

## Tests

```bash
cd smartmetadata-mcp && npm test
python3 scripts/rebuild/check_ccl_free_mcp.py
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: env rewrite + fail-closed JWT; Bearer header; documented GET/POST
paths; lineage depth clamp; search size cap; conversation entity link;
tool registration; source/package cannot import official MCP.

## Non-goals (later phases)

- Collate AI Studio tools (`nlq_search`, `create_article`, …)
- Full parity with every Collate / official MCP tool
- HTTP/SSE or Streamable HTTP transport
- Embedding this process in the Java server or `openmetadata-dist`
- Shipping the Vue SPA inside the Java dist (still needs its own ADR)
- Phase 11 harden / full verify

## Residual risks and open questions

- **stdio only.** Hosts that only speak HTTP MCP need a later transport. Do
  not re-enable official `/mcp` by adding the CCL jar to dist.
- **JWT in the host env.** The token is as secret as the bot that minted it.
  Prefer a dedicated bot with least privilege, not an admin PAT in a shared
  desktop config.
- **Search index default.** Official `SearchResource` defaults `index` to
  `table`. This package defaults to `dataAsset` (same as the Phase 1 console)
  so agents see tables and topics together. Pass `index` to override.
- **Lineage depth.** The FQN GET is capped at 3. Search-backed
  `/v1/lineage/getLineage` is not used.
- **Conversation about.** There is no `/v1/feed`. Comments use
  ADR:2026-10-22-collaboration-uses-activity-and-conversations.
- **Empty catalog.** Tools return whatever the API returns. Empty hits are
  empty, not fake entities.

## Open questions (safest default already taken)

1. **Embed MCP in the slim Java process?** **No.** Standalone stdio. Dist
   still excludes official `openmetadata-mcp`.
2. **HTTP/SSE in this phase?** **No.**
3. **Login/password auth for the MCP process?** **No.** JWT/bot token only.
4. **Collate AI / semantic / NLQ tools?** **No.**

## Verification checklist

1. `cd smartmetadata-mcp && npm test`
2. `cd smartmetadata-mcp && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_mcp.py`
4. `python3 scripts/rebuild/check_ccl_free_dist.py`
5. Optional: stdio session against a running Phase 0 server
