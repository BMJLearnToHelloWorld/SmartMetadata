# SmartMetadata UI

Clean-room Vue 3 + Ant Design Vue console for the existing Apache OpenMetadata /
SmartMetadata server REST API.

This module is **Apache-2.0**. It does **not** copy, transpile, or import
`openmetadata-ui` or `openmetadata-ui-core-components` (Collate Community License).
Those trees remain reference-only for behavior. Contracts come from
`openmetadata-service` JAX-RS resources, `docs/generated/api-reference.md`, and
JSON Schema.

Phase 1: app shell, basic-auth login, global search, Table + Topic detail.
UI parity batch 1: denser AppShell / official-like nav IA + zh-CN/en-US i18n
(`docs/rebuild/UI_PARITY_BATCH1.md`, ADR:2026-10-25-vue-i18n-zh-en).
Phase 2: Admin (users, teams, roles, bots, settings) plus auth-provider-aware login.
Phase 3: upstream/downstream lineage graph (Vue Flow + dagre) from `GET /v1/lineage/{entity}/name/{fqn}`.
Phase 4: glossaries/terms, classifications/tags, domains/data products, and
asset description/owners/tags/domain PATCH.
Phase 5: test definitions/cases/suites, asset DQ + profiler/sample, incidents,
and event-subscription alerts.
Phase 8: services + ingestion pipeline entities against Apache REST; jobs still
run with `smartmetadata-ingest`.
Phase 9: activity feed, conversations, tasks, announcements, and custom
property values. Persona landing is skipped.
See `docs/rebuild/PHASE1.md`–`PHASE9.md`, ADR:2026-10-22-clean-room-vue-spa,
ADR:2026-10-22-lineage-vue-flow-dagre,
ADR:2026-10-22-asset-governance-uses-json-patch,
ADR:2026-10-22-dq-entity-links-use-message-parser-format, and
ADR:2026-10-22-ingestion-console-runs-via-cli,
ADR:2026-10-22-collaboration-uses-activity-and-conversations, and
ADR:2026-10-22-custom-property-values-use-extension-patch.
Go-live / acceptance: `docs/rebuild/PHASE11.md` (`make verify-rebuild`) and
`docs/rebuild/VERIFY_RUNTIME.md` (GitHub Actions Jobs A–C).

## Stack

Vite · Vue 3 · TypeScript · Ant Design Vue · Vue Router · Pinia · vue-i18n · Vue Flow · dagre · Vitest

## Run against a slim Phase 0 server

1. Point this SPA at an **already-running** slim server (`:8585`). GitHub
   Actions Job C starts MySQL + ES + the server; a laptop without Docker
   uses a remote catalog — `docs/rebuild/VERIFY_RUNTIME.md`. Operators with
   a container runtime can still follow `docs/rebuild/PHASE0.md`.
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
Offline matrix: `make verify-rebuild`.

## Later static hosting

`npm run build` writes a static SPA to `smartmetadata-ui/dist/`. Any static
server can host it. Point `VITE_API_BASE_URL` at `{origin}/api` if the SPA is not
same-origin (example: `http://localhost:8585/api`). Leave it empty in Vite
dev so requests stay on `/api` and the proxy forwards them.

Do **not** add this bundle (or the historical CCL UI jar) to `openmetadata-dist`.
Phase 0 gates (`make check-ccl-free-dist`) must stay green. Serving the SPA from
the slim server still needs its own ADR. Production proxy / CORS notes:
`docs/rebuild/PHASE11.md`.
