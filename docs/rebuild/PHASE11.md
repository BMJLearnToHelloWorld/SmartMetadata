# Phase 11 — Production hardening and full verification

This is the **go-live / acceptance document** for the SmartMetadata CCL-free
rebuild. Phases 0–10 already shipped the product surfaces. Phase 11 does not
add connectors, UI routes, or a Prefect/Airflow operator. It records what was
delivered, the residual risks, the offline verification matrix, a maintainer
live checklist, and a production sketch.

Earlier phases: [PHASE0.md](PHASE0.md)–[PHASE10.md](PHASE10.md).
ADR:2026-10-22-rebuild-verify-is-offline.
ADR:2026-10-22-shippable-dist-excludes-ccl-modules still applies.

## What Phases 0–10 delivered

| Phase | Product surface | Tree / artifact | License |
|---|---|---|---|
| 0 | Slim Apache server dist (no UI / MCP / ingestion jars) | `openmetadata-dist` + `scripts/rebuild/check_ccl_free_dist.py` | Apache 2.0 |
| 1 | Login, search, table/topic detail | `smartmetadata-ui/` | Apache 2.0 |
| 2 | Users, teams, roles, bots, settings | same SPA | Apache 2.0 |
| 3 | Upstream/downstream lineage graph | same SPA (Vue Flow + dagre) | Apache 2.0 |
| 4 | Glossary, classifications/tags, domains/data products, asset PATCH | same SPA | Apache 2.0 |
| 5 | Test definitions/cases/suites, incidents, alerts, profiler/sample (read) | same SPA | Apache 2.0 |
| 6 | Source→Sink runner, REST client, Postgres connector, CLI | `smartmetadata-ingestion/` | Apache 2.0 |
| 7 | MySQL, Kafka, Snowflake connectors + `source.type` registry | same package | Apache 2.0 |
| 8 | Services + ingestion-pipeline console (CLI run, no Airflow trigger) | `smartmetadata-ui/` | Apache 2.0 |
| 9 | Activity, conversations, tasks, announcements, custom properties | same SPA | Apache 2.0 |
| 10 | stdio MCP (JWT → Apache REST, OSS tools only) | `smartmetadata-mcp/` | Apache 2.0 |

Historical `openmetadata-ui/`, `openmetadata-mcp/`, and `ingestion/` stay in git
as **reference-only**. They are not product dependencies. See
[PRODUCT_PATH.md](PRODUCT_PATH.md)
(ADR:2026-10-22-ccl-trees-stay-reference-only).

## Residual risks (do not treat as shipped)

These are accepted leftovers, not Phase 11 bugs.

| Risk | Why it remains | What to do instead |
|---|---|---|
| **Live catalog not exercised in agent VMs** | No guaranteed MySQL + ES + migrated server in this environment | GitHub Actions Job C (`workflow_dispatch`); laptop without Docker talks to a remote catalog — [VERIFY_RUNTIME.md](VERIFY_RUNTIME.md) |
| **CLI vs Airflow trigger** | Slim dist has `PipelineServiceClient` disabled. Console does not call `/trigger` or `/deploy` | `smartmetadata-ingest run --config …` (ADR:2026-10-22-ingestion-console-runs-via-cli) |
| **Persona landing skipped** | No thin non-AI `uiCustomization` path in Phase 9 | Default AppShell nav; do not invent Collate AI widgets |
| **In-tree CCL source** | Anyone can still `mvn package` UI/MCP or `pip install ingestion/` | Shipping policy is dist classpath + the three gates |
| **Profiler / DQ job execution** | Phase 6 stubs only; Phase 5 UI is catalog CRUD + read of results | Results stay empty until a later runner writes them |
| **MCP is stdio only** | No HTTP/SSE transport; official `/mcp` stays unregistered | Point the MCP host at `node smartmetadata-mcp/dist/index.js` |
| **SPA is not in `openmetadata-dist`** | Serving Vue from the Java process needs a new ADR | Static host or Vite dev proxy |
| **Empty catalog** | Fresh migrate has login + empty search | Seed via API or `smartmetadata-ingest`, not CCL sample-data loaders |
| **Compose still defines an ingestion service** | Historical reference (`docker/development/`, quickstart) | Default `./docker/run_local_docker.sh` does **not** start it. `-i true` requires `I_UNDERSTAND_CCL_INGESTION=1` |
| **`openmetadata-airflow-apis/` and `ui-core-components`** | VERIFY for counsel; not in the tarball | Do not import either into product modules |
| **ITs may pull CCL MCP on the test classpath** | `openmetadata-integration-tests` test-scoped `openmetadata-mcp` | Dist / runtime classpath still exclude it |

## Offline verification matrix (CI-like)

One command, no live catalog:

```bash
make verify-rebuild
# equivalent:
python3 scripts/rebuild/test_verify_rebuild.py
python3 scripts/rebuild/test_check_product_path_hints.py
python3 scripts/rebuild/verify_rebuild.py
```

`scripts/rebuild/verify_rebuild.py` runs, in order:

1. `smartmetadata-ui` `npm test` then `npm run build`
2. `smartmetadata-ingestion` `pytest` then `check_ccl_free_ingestion.py`
3. `smartmetadata-mcp` `npm test` then `npm run build`
4. `check_ccl_free_dist.py` (static pom + assembly; tarball scanned only if present)
5. `check_ccl_free_mcp.py`
6. `check_product_path_hints.py` (docs + docker ack; does not re-scan dist)
7. `scripts/harness/check_decision_records.py`
8. `scripts/rebuild/test_live_smoke.py` and `test_rebuild_workflows.py` (offline contracts; not live e2e)

Install steps (`npm ci` in the two Node packages, `pip install -e smartmetadata-ingestion/[dev]`)
run automatically when `node_modules` or the Python package is missing. Force or skip:

```bash
make verify-rebuild ARGS='--install'
make verify-rebuild ARGS='--skip-install'
python3 scripts/rebuild/verify_rebuild.py --list
```

`--require-tarball` is **opt-in** and belongs on a machine that already ran
`make slim-dist`. Default verify must stay green in a VM that cannot compile
the Java dist.

This command does **not** start Docker, MySQL, Elasticsearch, Airflow, Vite
`ui_dev`, or Playwright against a running server. Live catalog checks are
GitHub Actions Job C — see [VERIFY_RUNTIME.md](VERIFY_RUNTIME.md). Do not add
a flaky catalog e2e to this target
(ADR:2026-10-22-rebuild-verify-is-offline).

GitHub Actions: `.github/workflows/smartmetadata-rebuild.yml` (authorized;
ADR:2026-10-22-rebuild-ci-is-a-separate-workflow). Job A is
`make verify-rebuild`. Job B is `make slim-dist`. Job C is live-smoke on
GitHub-hosted service containers, not a laptop Docker session.

Pre-commit already runs the three CCL gates on the matching trees,
`check_decision_records.py` on every commit, and
`scripts/rebuild/test_verify_rebuild.py` when the verify runner changes.

## Live catalog (not a laptop Docker requirement)

Go-live live-smoke is **GitHub Actions Job C**, not a contributor machine
with Docker. Full steps, OSS-capability mapping, and the three venues:
[VERIFY_RUNTIME.md](VERIFY_RUNTIME.md).

1. **Preferred:** `workflow_dispatch` the `SmartMetadata rebuild` workflow
   (Job C uses GHA MySQL + Elasticsearch **service containers**, the Job B
   tarball, SPA preview, login → search → open asset).
2. **Optional:** a remote VM or Kubernetes cluster that already has a
   container runtime — not a Windows/Mac laptop without Docker.
3. **Laptop without Docker:** point `make ui_dev`, `smartmetadata-ingest`,
   and `smartmetadata-mcp` at an **already-running** remote catalog
   (`VITE_API_PROXY_TARGET` / `OM_API_URL` + JWT or bootstrap login). Do not
   start MySQL, Elasticsearch, or compose locally.

Do **not** start `./docker/run_local_docker.sh -i true` or rely on the CCL
`ingestion` compose service / official UI jar for a product demo. That flag
now requires `I_UNDERSTAND_CCL_INGESTION=1`.

## Production notes

### Topology (safest default)

Four processes, none of which embed a CCL package:

```
[browser] --HTTPS--> [SPA static host] --same-origin /api--> [slim openmetadata-server]
[operator] --CLI--> smartmetadata-ingest  --HTTPS + Bearer-->  same server
[agent host] --stdio--> smartmetadata-mcp --HTTPS + Bearer-->  same server
[MySQL or Postgres] + [Elasticsearch or OpenSearch]
```

- **Server:** `make slim-dist` tarball / image built from it. Config in
  `conf/openmetadata.yaml` plus env overrides. No `openmetadata-ui` jar, no
  `openmetadata-mcp` jar, no `openmetadata-ingestion` wheel.
- **SPA:** `cd smartmetadata-ui && npm ci && npm run build` → static files in
  `smartmetadata-ui/dist/`. Host with nginx/Caddy/S3+CDN. Reverse-proxy
  `/api` to the slim server so the browser stays same-origin (Vite does this
  in dev via `VITE_API_PROXY_TARGET`). Cross-origin only if you set
  `VITE_API_BASE_URL` at **build** time **and** enable the server's
  Dropwizard `web.cors` for that origin. Prefer the proxy.
- **Ingest:** CLI/process (`smartmetadata-ingest run`). Cron/systemd/k8s
  Job is enough. A Prefect or native Airflow operator is a later ADR.
- **MCP (optional):** `node smartmetadata-mcp/dist/index.js` as a stdio
  subprocess of the agent host. Not registered on the Java server.

### Secrets

| Secret | Where it lives | Do not |
|---|---|---|
| Bot JWT / PAT (`OM_JWT`) | env of ingest + MCP | commit, bake into SPA, share an admin PAT in a desktop MCP config |
| Source passwords (`PG_PASSWORD`, …) | env of the CLI job | persist on the catalog service entity (`storeConnectionSecrets` defaults false) |
| Login password | typed at `/login`, Base64 to `POST /v1/users/login` | send in query strings or store in git |
| Session JWT | browser `localStorage` key `sm.auth.v1` | treat as equivalent to the user's password |

### Security / ops checklist

- JWT auth on every product client (`Authorization: Bearer`). MCP and ingest
  fail closed if `OM_JWT` is missing.
- SPA cookie-less session; XSS in the static host is a token theft. Serve the
  SPA over HTTPS. Do not enable a wildcard CORS `*`.
- RBAC is the Apache server. Least-privilege bots for ingest and MCP.
- Do not restore CCL modules to `openmetadata-dist` (Enforcer
  `ban-ccl-modules` + `check_ccl_free_dist.py`).
- Do not ship the sample CCL Docker UI path (`-m ui` does not package the
  official UI after Phase 0; `-i true` starts the reference ingestion
  container — not a product image).
- Official `/mcp` stays off. Do not add the CCL jar “just to get HTTP MCP”.
- Brand/NOTICE/trademark sweep of the Apache fork is VERIFY for counsel, not
  done here.

## OSS capability acceptance

Rebuild-map modules → shipped SmartMetadata surfaces. Collate-only stays DROP.

| Rebuild-map module | Shipped surface | Status |
|---|---|---|
| Shell: layout / session | `AppShell` + JWT login + Vite `/api` proxy | Shipped (P1) |
| System admin UI | Users, teams, roles, bots, settings | Shipped (P2) |
| Discovery / catalog | Search + table/topic detail | Shipped (P1) |
| Asset detail extras | Governance PATCH, DQ, profiler/sample, activity, custom props | Shipped (P4/P5/P9) |
| Lineage visualization | Vue Flow + dagre, `GET /v1/lineage/{entity}/name/{fqn}` | Shipped (P3) |
| Governance: glossary / tags / domain | List/detail + asset owners/tags/domain | Shipped (P4) |
| Quality / observability | Definitions, cases, suites, incidents, webhook alerts | Shipped catalog UI (P5); job execution residual |
| Services / collection console | Database + messaging services, pipeline CRUD, CLI YAML | Shipped (P8); trigger residual |
| Collaboration | Activity, conversations, tasks, announcements | Shipped (P9); persona residual |
| AI / MCP UI | Standalone stdio MCP (OSS tools) | Shipped process (P10); Collate AI Studio DROP |
| Connector framework | Clean-room runner + REST sink | Shipped (P6) |
| First connectors | Postgres, MySQL, Kafka, Snowflake | Shipped (P6–P7) |
| Java server / spec / search / RBAC | Apache `openmetadata-service` in slim dist | KEEP (P0) |
| Official UI / MCP / `ingestion/` | In-tree reference only | DROP from product |

## Non-goals (still later, still need an ADR where noted)

- Copying CCL code or restoring UI/MCP into `openmetadata-dist`
- Full live Docker UI recording against the CCL sample stack
- New connectors, Prefect/Airflow operators, or SPA-in-Java
- Persona landing / Collate AI Studio
- HTTP MCP transport
- GitHub workflow edits without explicit authorization (rebuild CI is
  authorized: ADR:2026-10-22-rebuild-ci-is-a-separate-workflow)
- Live catalog e2e inside `make verify-rebuild`
- Documenting contributor-laptop Docker as a go-live requirement

## Open questions (safest default already taken)

1. **Add a live-catalog e2e to `make verify-rebuild`?** **No.** Job C is
   `workflow_dispatch`; do not flake the PR gate on a missing catalog.
2. **Embed the SPA or MCP in the slim Java process?** **No** — existing ADRs.
3. **Wire `make verify-rebuild` into `.github/workflows`?** **Yes** — Job A
   of `.github/workflows/smartmetadata-rebuild.yml` after explicit
   authorization (ADR:2026-10-22-rebuild-ci-is-a-separate-workflow).
4. **Ship `-i true` / official UI Docker as a product path?** **No.**
5. **Require Docker on a contributor laptop for go-live?** **No.** Job C
   runs on GitHub-hosted runners.

## Verification checklist

1. `python3 scripts/rebuild/test_verify_rebuild.py`
2. `python3 scripts/rebuild/test_check_product_path_hints.py`
3. `make verify-rebuild` (or `python3 scripts/rebuild/verify_rebuild.py`)
4. Confirm the three CCL gates and `check_product_path_hints.py` print pass
5. Confirm `check_decision_records.py` and the live-smoke / rebuild-workflow
   contracts are in the same run
6. Optional: `workflow_dispatch` Job C (see [VERIFY_RUNTIME.md](VERIFY_RUNTIME.md))
