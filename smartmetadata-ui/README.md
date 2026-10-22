# SmartMetadata UI

Clean-room Vue 3 + Ant Design Vue console for the existing Apache OpenMetadata /
SmartMetadata server REST API.

This module is **Apache-2.0**. It does **not** copy, transpile, or import
`openmetadata-ui` or `openmetadata-ui-core-components` (Collate Community License).
Those trees remain reference-only for behavior. Contracts come from
`openmetadata-service` JAX-RS resources, `docs/generated/api-reference.md`, and
JSON Schema.

Phase 1: app shell, basic-auth login, global search, Table + Topic detail.
Phase 2: Admin (users, teams, roles, bots, settings) plus auth-provider-aware login.
See `docs/rebuild/PHASE1.md`, `docs/rebuild/PHASE2.md`, and ADR:2026-10-22-clean-room-vue-spa.

## Stack

Vite · Vue 3 · TypeScript · Ant Design Vue · Vue Router · Pinia · Vitest

## Run against a slim Phase 0 server

1. Start the CCL-free server from `docs/rebuild/PHASE0.md`
   (`make slim-dist`, MySQL + Elasticsearch, migrate, listen on `:8585`).
2. From this directory:

```bash
cp .env.example .env   # optional; defaults already proxy to http://localhost:8585
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to
`VITE_API_PROXY_TARGET` (default `http://localhost:8585`).

Default bootstrap credentials on a stock server are
`admin@open-metadata.org` / `admin`. Use whatever account the running server
actually has.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm test` | Vitest (jsdom) |
| `npm run build` | Typecheck + production SPA in `dist/` |
| `npm run preview` | Serve the built SPA |

Root Makefile wrappers: `make ui_install`, `make ui_dev`, `make ui_test`, `make ui_build`.

## Later static hosting

`npm run build` writes a static SPA to `smartmetadata-ui/dist/`. Any static
server can host it. Point `VITE_API_BASE_URL` at `{origin}/api` if the SPA is not
same-origin (example: `http://localhost:8585/api`). Leave it empty in Vite
dev so requests stay on `/api` and the proxy forwards them.

Do **not** add this bundle (or the historical CCL UI jar) to `openmetadata-dist`.
Phase 0 gates (`make check-ccl-free-dist`) must stay green. Serving the SPA from
the slim server is an open question for a later phase.
