# Rebuild verification is an offline matrix; a live catalog is maintainer-only

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial) · v2 2026-10-22 (CI wiring authorized; live path is GHA Job C) · v3 2026-10-22 (product-path hints) · v4 2026-10-22 (purged-tree gate)
- **Deciders:** SmartMetadata rebuild (Phase 11)
- **Guard:** `scripts/rebuild/test_verify_rebuild.py` (pre-commit `verify-rebuild-contract`); `make verify-rebuild` (`scripts/rebuild/verify_rebuild.py`)
- **Related:** `docs/rebuild/PHASE11.md`; `docs/rebuild/VERIFY_RUNTIME.md`; ADR:2026-10-22-shippable-dist-excludes-ccl-modules; ADR:2026-10-22-rebuild-ci-is-a-separate-workflow; ADR:2026-10-22-ccl-trees-are-purged

## Context

Phases 0–10 shipped a slim Apache server, a clean-room Vue SPA, a clean-room
ingestion CLI, and a clean-room stdio MCP. Closing the rebuild needed one
command that CI and agent VMs can run. Those environments usually cannot start
MySQL + Elasticsearch + a migrated catalog, and a Playwright pass against a
missing server would flake.

## Decision

- `make verify-rebuild` runs UI test+build, ingestion pytest, MCP test+build,
  `check_ccl_free_dist.py`, `check_ccl_free_ingestion.py`,
  `check_ccl_free_mcp.py`, `check_purged_trees.py`, `check_product_path_hints.py`,
  `check_decision_records.py`, and the offline contracts for `live_smoke.py`
  / the rebuild workflow.
- It does not start Docker, the slim server, Vite `ui_dev`, Airflow, or a
  browser. `--require-tarball` is opt-in after `make slim-dist`.
- The live path (slim server + SPA + ingest + MCP against a real catalog) is
  documented in `docs/rebuild/PHASE11.md` as a maintainer checklist.
- GitHub Actions is not edited in the same change; when workflow edits are
  authorized, the job is `make verify-rebuild`.

## Consequences

A green `make verify-rebuild` means the product packages typecheck/test and
the license gates still hold. It does not mean a human logged in and searched
a populated catalog. Revisit only if a stable, in-repo catalog fixture exists
that does not pull CCL sample-data loaders or the official UI image.

## Amendment (v2 2026-10-22)

Bernie Bai authorized `.github/workflows` edits. The "do not edit GitHub
Actions in the same change" clause is superseded by
ADR:2026-10-22-rebuild-ci-is-a-separate-workflow. The offline matrix and the
rule that live e2e stays **out of** `make verify-rebuild` are unchanged. The
live path is GitHub Actions Job C (service containers), not a contributor
laptop Docker checklist.

## Amendment (v3, 2026-10-22)

`check_product_path_hints.py` joined the offline matrix. It asserts the
product-path docs and docker `I_UNDERSTAND_CCL_INGESTION` ack still exist. It
does not re-scan `openmetadata-dist` (that remains `check_ccl_free_dist.py`).

## Amendment (v4, 2026-10-22)

Official CCL trees were deleted. `check_purged_trees.py` joined the offline
matrix. Docker `-i true` always refuses; there is no
`I_UNDERSTAND_CCL_INGESTION` override. ADR:2026-10-22-ccl-trees-stay-reference-only
is superseded by ADR:2026-10-22-ccl-trees-are-purged.
