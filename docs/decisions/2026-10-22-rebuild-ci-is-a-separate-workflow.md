# CCL-free rebuild CI is a separate GitHub Actions workflow; live catalog checks stay out of make verify-rebuild

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** Bernie Bai (explicitly authorized `.github/workflows` edits)
- **Guard:** `scripts/rebuild/test_rebuild_workflows.py`; `.github/workflows/smartmetadata-rebuild.yml`
- **Related:** ADR:2026-10-22-rebuild-verify-is-offline; `docs/rebuild/VERIFY_RUNTIME.md`; `docs/rebuild/PHASE11.md`

## Context

Phase 11 shipped `make verify-rebuild` as an offline matrix and left GitHub
Actions unwired because workflow files are a supply-chain surface (`AGENTS.md`).
Bernie Bai then authorized wiring that target into `.github/workflows` and asked
for runtime assurance that does not reuse Collate / official Playwright /
`docker-openmetadata-ingestion` jobs. His local machine cannot run Docker, so a
maintainer-laptop compose path cannot be the go-live live-smoke venue.

## Decision

- Add `.github/workflows/smartmetadata-rebuild.yml` as a **separate** CI
  surface. Do not call, `workflow_call`, or copy Collate / Playwright /
  ingestion-image workflows. Do not run `yarn_*` against `openmetadata-ui`.
- Job A (`verify-rebuild`) is the required PR + `main` push gate:
  `make verify-rebuild`. Fail-fast, no Docker, no live catalog.
- Job B (`slim-dist`) runs on `main` push and `workflow_dispatch` (not every
  PR): `make slim-dist` then
  `python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball`. Needs
  Java 21 and Maven.
- Job C (`live-smoke`) is `workflow_dispatch` first. It uses GitHub-hosted
  **service containers** for MySQL + Elasticsearch, starts the slim server from
  the Job B tarball, and runs `scripts/rebuild/live_smoke.py`. It is not part
  of `make verify-rebuild`.
- Contributor machines without Docker only talk to an **already-running**
  remote catalog (API URL + JWT / bootstrap login). They do not start MySQL,
  Elasticsearch, or compose locally.
- `OM_JWT` is never hardcoded. Job C uses bootstrap login for HTTP smoke and
  `${{ secrets.OM_JWT }}` only as an optional bot-token override (`# TODO` until
  the secret exists).

## Consequences

A green Job A means the product packages typecheck/test and the license gates
hold. A green Job B means the shippable tarball exists and is CCL-free. A green
Job C means a GitHub runner logged in, searched, and opened an asset against a
real slim server. Revisit Job C's `workflow_dispatch`-only trigger if a cheap
nightly is wanted; do not move live e2e into `make verify-rebuild`.
