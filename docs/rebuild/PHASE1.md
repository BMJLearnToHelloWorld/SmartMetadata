# Phase 1 — Clean-room Vue 3 console MVP

Phase 1 adds a **new** Apache-2.0 frontend at `smartmetadata-ui/`. It talks to
the existing slim server REST API from Phase 0. It does not reuse
`openmetadata-ui` or `openmetadata-ui-core-components` source.

ADR:2026-10-22-clean-room-vue-spa.

## What shipped

| Piece | Location | Server contract |
|---|---|---|
| App shell (header / sider / content) | `smartmetadata-ui/src/layouts/AppShell.vue` | — |
| Login + JWT session | `src/views/LoginView.vue`, `src/stores/auth.ts`, `src/auth/token.ts` | `POST /api/v1/users/login` (`LoginRequest.password` is Base64); `GET /api/v1/users/loggedInUser`; `POST /api/v1/users/logout` |
| Route guard | `src/router/index.ts` | Unauthenticated users go to `/login` |
| Global search | `src/views/SearchView.vue`, `src/api/search.ts` | `GET /api/v1/search/query?q=&index=dataAsset` |
| Table detail | `src/views/AssetDetailView.vue` | `GET /api/v1/tables/name/{fqn}?fields=owners,tags,columns` |
| Topic detail | same view | `GET /api/v1/topics/name/{fqn}?fields=owners,tags` |
| Dev proxy | `smartmetadata-ui/vite.config.ts`, `.env.example` | Browser `/api` → `http://localhost:8585` |

Other search hits remain clickable. If the type is not table or topic, the
detail page explains that Phase 1 does not fetch a dedicated entity endpoint
(no invented collections).

## How to run

Server (Phase 0):

```bash
make slim-dist
docker compose -f docker/development/docker-compose.yml up -d mysql elasticsearch
# unpack the tarball, migrate, start the server — see docs/rebuild/PHASE0.md
# API: http://localhost:8585/api
```

UI:

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Or `cd smartmetadata-ui && npm install && npm run dev`.

Copy `smartmetadata-ui/.env.example` to `.env` only if the API is not on
`localhost:8585`.

### Manual verify (login → search → table detail)

1. Slim server healthy: `curl -sf http://localhost:8586/healthcheck`.
2. Open http://localhost:5173 — unauthenticated visit redirects to `/login`.
3. Sign in with a real basic-auth user on that server. Stock bootstrap is
   `admin@open-metadata.org` / `admin` when the server was initialized with
   defaults. The UI Base64-encodes the password; do not send it in the clear.
4. After login, Search runs `GET /api/v1/search/query` on `dataAsset`.
   An empty query uses `q=*`.
5. Open a **table** hit. The detail page must show name, FQN, description,
   owners, tags (when present in the JSON), and columns.
6. Open a **topic** hit if the catalog has one. Same core fields; schema
   fields come from `messageSchema.schemaFields` when the entity payload
   includes them.
7. Log out. The session key `sm.auth.v1` is cleared and `/search` redirects
   back to login.

Search and detail need indexed assets. A freshly migrated empty catalog will
login but show zero hits — that is not a UI bug. Load metadata through the
server API (not the CCL ingestion tree) before judging search.

## Tests

```bash
make ui_test
# or: cd smartmetadata-ui && npm test
```

Covered: password Base64 + `Authorization: Bearer` + session persist; search
hit mapping; table/topic FQN routes; LoginView submit against a mocked
`/users/login`.

```bash
make ui_build
```

must typecheck and emit `smartmetadata-ui/dist/`.

## Packaging

The SPA is **not** added to `openmetadata-dist`. Do not restore
`openmetadata-ui` in the dist POM or assembly.

`make check-ccl-free-dist` remains the Phase 0 gate (static pom/assembly;
`--require-tarball` after `make slim-dist`).

`npm run build` is the later static-hosting input. Serving that `dist/` from
the Java server is deferred — see open questions.

## Non-goals (still later phases)

- Lineage graph / impact analysis
- Ingestion / connector console
- System admin (users, teams, roles, SSO config UI)
- MCP, Context Center, DQ, glossary/classification editors
- OIDC/SAML login (server supports them; this MVP is basic JWT login only)
- Shipping the SPA inside `openmetadata-dist`

## Residual risks and later-phase notes

- **Empty catalog.** Search MVP cannot demo table detail without indexed
  tables. Seed via API or an existing catalog; do not vendor CCL sample-data
  loaders into dist.
- **Auth provider.** `POST /v1/users/login` is for basic/LDAP-style
  username+password. A server configured only for OIDC will reject this form.
  Phase 2+ should read `GET /api/v1/system/config/auth` and branch.
- **Token refresh.** `refreshToken` is stored when the server returns it.
  Phase 1 does not auto-refresh; a 401 on a data call shows the API error.
  The route guard only checks local presence of `accessToken`.
- **FQN encoding.** Vue Router keeps the raw FQN in the `:fqn` param; the
  client percent-encodes it for `/name/{fqn}`. Quoted FQN segments should
  round-trip; if a catalog FQN still 404s, check encoding before changing
  routes.
- **Search index.** Global search uses `index=dataAsset` (server docs /
  `SearchResource`). If a deployment’s alias is missing, the query 4xx/5xx.
  Do not silently fall back to a guessed index list.
- **Topic schema.** Topic `FIELDS` on the resource does not list
  `messageSchema`; it is an entity property and should arrive on GET. If a
  server build omits it unless requested, add it to `fields` in
  `entityRoutes.ts` rather than scraping another endpoint.
- **Static hosting.** Vite `dist/` can be copied to any non-CCL static path.
  Do not drop it into `openmetadata-dist` without a new ADR. Prefer a reverse
  proxy that serves the SPA and forwards `/api` to `:8585`.

## Open questions (safest default already taken)

1. **Serve the SPA from the slim Java server?** Default: **no** — Vite dev now;
   static `dist/` later behind a proxy. Revisit only with an explicit packaging
   ADR that keeps CCL jars out of dist.
2. **SSO in the same login page?** Default: **basic login only**. Do not
   hardcode a fake OIDC callback.
3. **More entity types on detail?** Default: table + topic. Search still lists
   other `dataAsset` types.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py` (and after a slim build,
   `--require-tarball`)
4. Manual path above against a running Phase 0 server with catalog data
