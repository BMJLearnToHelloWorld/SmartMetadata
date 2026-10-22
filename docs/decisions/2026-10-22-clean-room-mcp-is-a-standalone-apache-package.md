# Product MCP is a standalone Apache process, not the CCL module and not in dist

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 10)
- **Guard:** `scripts/rebuild/check_ccl_free_mcp.py`; `smartmetadata-mcp/LICENSE` is Apache-2.0; `make check-ccl-free-dist` still bans `openmetadata-mcp` in the server tarball
- **Related:** `docs/rebuild/PHASE10.md`; ADR:2026-10-22-shippable-dist-excludes-ccl-modules

## Context

`openmetadata-mcp/` is Collate Community License. Phase 0 already dropped it
from `openmetadata-dist` and the server skips `org.openmetadata.mcp.McpServer`
when the class is absent. Agents still need a documented way to search, read
tables/topics/lineage/glossary/tags, and post a conversation comment. Copying
or depending on the official MCP module would put CCL back on the product
path. Embedding a new MCP servlet in the Java dist would also reopen the
Phase 0 packaging decision.

## Decision

- New module path: `smartmetadata-mcp/` (Apache-2.0). Not a Maven module. Not
  a dependency of `openmetadata-dist`.
- The package must not import or depend on `openmetadata-mcp`,
  `org.openmetadata.mcp`, or `@openmetadata/mcp`. Reviewers reject copies
  from that tree.
- Transport is **stdio**. HTTP/SSE is out of this phase.
- Auth is `Authorization: Bearer` from `OM_JWT` (bot JWT or PAT). There is
  no hardcoded secret and no password login in this process.
- Tools call documented `openmetadata-service` REST paths only. Lineage
  depth is clamped to the FQN GET maximum of 3.
- Official `/mcp` stays unregistered on the slim server. Do not add the CCL
  jar back to the assembly to “restore” it.

## Consequences

Agents attach this process from an MCP host env. The Java server remains
CCL-free. Later HTTP transport or extra OSS tools extend this package.
Revisit embedding in dist only with a new ADR; restoring
`openmetadata-mcp` in the assembly is forbidden.
