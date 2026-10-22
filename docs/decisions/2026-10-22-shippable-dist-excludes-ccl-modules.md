# The shippable server dist excludes Collate Community License modules

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 0)
- **Guard:** Maven Enforcer `ban-ccl-modules` on `openmetadata-dist`; `make check-ccl-free-dist` (`scripts/rebuild/check_ccl_free_dist.py`); assembly excludes in `openmetadata-dist/src/main/assembly/binary.xml`
- **Related:** `docs/rebuild/PHASE0.md`

## Context

`openmetadata-dist` assembled `openmetadata-service` plus `openmetadata-mcp` (always) and
`openmetadata-ui` (default and rpm profiles). The UI jar carries the Vite SPA onto the server
classpath (`/assets`). MCP is loaded by reflection from `org.openmetadata.mcp.McpServer`. Both
modules, and `ingestion/`, are Collate Community License. A competing hosted product cannot ship
them. Deleting those trees in one commit would break historical CI (`-pl !openmetadata-ui`) and
remove reference material needed for later clean-room phases.

## Decision

- `openmetadata-dist` depends only on `openmetadata-service`.
- Assembly `libs/` excludes `openmetadata-ui`, `openmetadata-mcp`, and
  `openmetadata-ui-core-components`.
- CCL Maven modules stay in the root reactor as reference-only. The product command is
  `mvn -DskipTests package -pl openmetadata-dist -am`.
- Ingestion is not a Maven or dist dependency. Local Docker defaults to not starting the
  ingestion container.
- The Apache server may keep MCP *entity* types and a reflective loader; missing CCL classes
  skip MCP registration rather than fail startup.

## Consequences

The tarball and the development server image built from it have no CCL jars and no UI static
assets. `GET /` is not a product UI until a later clean-room frontend. `/mcp` is unregistered
until a later MCP replacement. Revisit only to add a *new* Apache or clean-room module to dist,
never to restore the CCL artifacts.
