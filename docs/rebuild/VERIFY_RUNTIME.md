# Rebuild runtime verification

Three layers of assurance for the CCL-free SmartMetadata rebuild. Job A is the
merge gate. Jobs B and C are heavier and do not run on every pull request.

Workflow: `.github/workflows/smartmetadata-rebuild.yml`
(ADR:2026-10-22-rebuild-ci-is-a-separate-workflow).
Offline matrix: [PHASE11.md](PHASE11.md) and
ADR:2026-10-22-rebuild-verify-is-offline.

This workflow does **not** reuse Collate, official Playwright, or
`docker-openmetadata-ingestion` jobs. It does not run `yarn_*` against
`openmetadata-ui`. It does not start `./docker/run_local_docker.sh -i true`.

## Layer A — offline rebuild gate (required)

**When:** every pull request to `main`, every push to `main`, merge queue,
`workflow_dispatch`.

**Command:** `make verify-rebuild` (same as
`python3 scripts/rebuild/verify_rebuild.py`).

**Needs:** Node 22 LTS (`>=22.22.2`; vite 8 / vitest 5 / undici 8), Python 3.10.
No Java, no Docker, no live catalog. Job A prints `node -v` after
`actions/setup-node` so the log shows the Node that `npm test` uses.

**Asserts:** `smartmetadata-ui` test+build, `smartmetadata-ingestion` pytest,
`smartmetadata-mcp` test+build, the three CCL-free gates, product-path
hints, decision-record check, and the offline contracts for `live_smoke.py`
/ the rebuild workflow.

Live e2e stays **out** of this target on purpose. A missing catalog must not
flake the PR gate.

## Layer B — slim dist tarball gate

**When:** push to `main` and `workflow_dispatch`. Not on every PR (Maven
`openmetadata-dist -am` is too slow).

**Needs:** Java 21 (Temurin) and Maven 3.8+ (`actions/setup-java` provides
both on GitHub-hosted runners).

**Command:**

```bash
make slim-dist
python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball
```

`make slim-dist` already runs the tarball gate; Job B runs it again so the
log names the `--require-tarball` contract explicitly.

## Layer C — live-smoke (GitHub Actions only)

**When:** `workflow_dispatch` first. A nightly `schedule` can be added later
if the run is cheap enough. Not part of `make verify-rebuild`.

**Primary venue:** GitHub-hosted runners. Job C starts MySQL 8 and
Elasticsearch 9 as **service containers**, unpacks the Job B tarball, migrates,
starts the slim server, health-checks `http://localhost:8586/healthcheck`,
asserts `GET /mcp` is unregistered and `GET /` is not the official UI, seeds
one table via `smartmetadata-ingest`, serves `smartmetadata-ui` with Vite
preview, and runs `scripts/rebuild/live_smoke.py` (login → search → open
asset). Optional MCP stdio `search_entities` uses the login JWT, or
`${{ secrets.OM_JWT }}` when that repository secret is set.

```text
# TODO: add repository secret OM_JWT (bot JWT or PAT) to override bootstrap
# login for ingest/MCP. Until then Job C uses admin@open-metadata.org / admin
# on a freshly migrated catalog. Missing ${OM_JWT} in JWT workflow configs
# still fail closed.
```

### Where live-smoke may run

| Venue | Use |
|---|---|
| **Preferred — GitHub Actions Job C** | `workflow_dispatch` on this repo. Service containers + slim server + SPA preview. No contributor Docker. |
| **Optional — remote VM / Kubernetes** | Any host that already has a container runtime. Operators may compose MySQL + ES there. Not documented as a laptop step. |
| **Developer laptop without Docker** | Do **not** start MySQL, Elasticsearch, or compose. Point `make ui_dev` / `smartmetadata-ingest` / `smartmetadata-mcp` at an **already-running** remote catalog (`VITE_API_PROXY_TARGET` / `OM_API_URL` + JWT or bootstrap login). |

`scripts/rebuild/live_smoke.py` never starts Docker. Against a remote catalog:

```bash
python3 scripts/rebuild/live_smoke.py \
  --admin-url https://catalog.example:8586 \
  --api-url https://catalog.example:8585 \
  --login-email "$OM_LOGIN_EMAIL" \
  --login-password "$OM_LOGIN_PASSWORD"
```

## OSS capability acceptance → smoke checks

Rebuild-map modules from [PHASE11.md](PHASE11.md) mapped to what Job C
actually hits. Empty-catalog leftovers stay residual, not Job C failures.

| Rebuild-map module | Smoke check (Job C unless noted) |
|---|---|
| Shell: layout / session | SPA preview serves SmartMetadata; `POST /api/v1/users/login` returns `accessToken` |
| Discovery / catalog | `GET /api/v1/search/query?q=*&index=dataAsset`; open one table if seeded |
| Java server / spec / search / RBAC | Slim server from Job B tarball; `GET /healthcheck` on :8586 |
| Official UI / MCP / `ingestion/` DROP | `GET /` is not the CCL UI; `GET /mcp` unregistered; tarball gate (Job B) |
| Connector framework | `smartmetadata-ingest` static source against the live server; `${OM_JWT}` fail-closed |
| First connectors | Example JWT configs still require `OM_JWT` (fail-closed). Live warehouse readers are not Job C. |
| AI / MCP (stdio) | Optional `search_entities` over stdio when a JWT is available |
| System admin, lineage, governance, quality, services, collaboration | Shipped in the SPA (Phases 2–9); not in this minimal smoke. Exercise against a remote catalog from a laptop if needed. |

## Local commands (no Docker)

```bash
make verify-rebuild
python3 scripts/rebuild/test_live_smoke.py
python3 scripts/rebuild/test_rebuild_workflows.py
# only if a catalog is already reachable:
make live-smoke ARGS='--api-url http://localhost:8585 --admin-url http://localhost:8586'
```
