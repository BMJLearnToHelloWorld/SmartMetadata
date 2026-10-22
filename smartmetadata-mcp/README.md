# SmartMetadata MCP

Clean-room Apache-2.0 MCP server for the slim OpenMetadata server.

Official Java `openmetadata-mcp` was **purged**
(ADR:2026-10-22-ccl-trees-are-purged). This package does not copy, transpile, or
import it. It talks to documented `openmetadata-service` REST paths over HTTP
and exposes them to agents as MCP tools. Gaps vs the deleted tool list:
`docs/rebuild/PARITY.md`.

Transport default: **stdio** (JSON-RPC on stdin/stdout). That is the durable
host contract used by Claude Desktop, Cursor, and other MCP clients. HTTP/SSE
is not shipped in this MVP.

See [docs/rebuild/PHASE10.md](../docs/rebuild/PHASE10.md),
[docs/rebuild/PHASE11.md](../docs/rebuild/PHASE11.md), and
ADR:2026-10-22-clean-room-mcp-is-a-standalone-apache-package.

## Install

```bash
cd smartmetadata-mcp && npm install
```

## Configure

Secrets come from the environment. Never commit a token.

| Variable | Required | Meaning |
|---|---|---|
| `OM_JWT` | yes | Bot JWT or personal access token (`Authorization: Bearer`) |
| `OM_API_URL` | no | Server origin. Default `http://localhost:8585`. A bare origin is rewritten to `…/api` |
| `OM_HOST_PORT` | no | Alias for `OM_API_URL` |
| `OM_TIMEOUT_MS` | no | HTTP timeout. Default `30000`, clamped to 1–120000 |

```bash
export OM_API_URL=http://localhost:8585
export OM_JWT=...   # bot or PAT
```

## Run (stdio)

```bash
cd smartmetadata-mcp
npm run build
npm start
# or, without a build:
npm run dev
```

Example Cursor / Claude Desktop config:

```json
{
  "mcpServers": {
    "smartmetadata": {
      "command": "node",
      "args": ["/absolute/path/to/smartmetadata-mcp/dist/index.js"],
      "env": {
        "OM_API_URL": "http://localhost:8585",
        "OM_JWT": "<bot-or-pat>"
      }
    }
  }
}
```

The process reads MCP on stdin and writes MCP on stdout. Log only to stderr.

## Tools

| Tool | Server contract |
|---|---|
| `search_entities` | `GET /v1/search/query` (`q`, `index` default `dataAsset`, `from`, `size` max 50) |
| `get_table` | `GET /v1/tables/name/{fqn}?fields=owners,tags,columns,domains` |
| `get_topic` | `GET /v1/topics/name/{fqn}?fields=owners,tags,domains,messageSchema` |
| `get_lineage` | `GET /v1/lineage/{entity}/name/{fqn}` with `upstreamDepth` / `downstreamDepth` clamped 0–3 (default 1) |
| `list_glossaries` | `GET /v1/glossaries` (read) |
| `list_tags` | `GET /v1/tags` (read; optional `parent` classification FQN) |
| `create_conversation` | `POST /v1/conversations` `{ message, about }` where `about` is `<#E::{type}::{fqn}>` |

Collate AI Studio tools are out of scope.

## Tests

```bash
cd smartmetadata-mcp && npm test
python3 scripts/rebuild/check_ccl_free_mcp.py
python3 scripts/rebuild/check_ccl_free_dist.py
# or the aggregated offline matrix:
make verify-rebuild
```
