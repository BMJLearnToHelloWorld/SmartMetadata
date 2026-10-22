# The product UI is a clean-room Vue 3 SPA in smartmetadata-ui

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 1)
- **Guard:** `smartmetadata-ui/LICENSE` is Apache-2.0; `make check-ccl-free-dist` still bans CCL UI/MCP/ingestion in dist; reviewers reject imports from `openmetadata-ui` / `openmetadata-ui-core-components`
- **Related:** `docs/rebuild/PHASE1.md`; ADR:2026-10-22-shippable-dist-excludes-ccl-modules

## Context

Phase 0 removed the Collate Community License UI from the shippable server.
The product still needs a console. Copying or wrapping `openmetadata-ui` would
reintroduce CCL into the product. The stack was already decided: Vue 3 + Ant
Design Vue, not the historical React console.

## Decision

- New module path: `smartmetadata-ui/` (Apache-2.0). Not a Maven module. Not a
  dependency of `openmetadata-dist`.
- Auth header: `Authorization: Bearer <accessToken>`, matching
  `JwtFilter.AUTHORIZATION_HEADER` / `TOKEN_PREFIX`. Session key `sm.auth.v1`
  in `localStorage`.
- Login body: `POST /api/v1/users/login` with `email` and Base64 `password`
  (`LoginRequest`).
- Asset routes: `/assets/:entityType/:fqn`. Vue Router stores the raw FQN in
  the param; API calls percent-encode it as `/api/v1/{tables|topics}/name/{fqn}`.
- Dev API base: same-origin `/api` (resource paths are `/v1/...`), proxied to
  `http://localhost:8585`. Override with `VITE_API_BASE_URL` (origin + `/api`).

## Consequences

The CCL React trees stay reference-only. Later phases extend this SPA (lineage,
admin, SSO) instead of importing those trees. Revisit the module path or auth
header only if the server contract changes.
