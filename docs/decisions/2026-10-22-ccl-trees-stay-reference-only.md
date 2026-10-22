# Collate Community License trees stay in git as reference-only until a purge ADR

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (tree hygiene)
- **Guard:** `scripts/rebuild/check_product_path_hints.py`; docker `I_UNDERSTAND_CCL_INGESTION=1` before `-i true`. Dist classpath stays with ADR:2026-10-22-shippable-dist-excludes-ccl-modules (`ban-ccl-modules` / `check_ccl_free_dist.py`) — do not duplicate that scan here.
- **Related:** `docs/rebuild/PRODUCT_PATH.md`; `docs/rebuild/PHASE0.md`; `docs/rebuild/PHASE11.md`; ADR:2026-10-22-shippable-dist-excludes-ccl-modules; ADR:2026-10-22-product-make-is-rebuild-only

## Context

The product path is CCL-free: slim `openmetadata-dist` plus `smartmetadata-ui/`,
`smartmetadata-ingestion/`, and `smartmetadata-mcp/`. Historical
`openmetadata-ui/`, `ingestion/`, and `openmetadata-mcp/` remain in the same git
tree as **reference-only**. Contributors still hit them as if they were product:

- `./docker/run_local_docker.sh -i true` starts the CCL ingestion container.
- `docker/docker-compose-quickstart/` pulls Collate images.
- A full-root `mvn package` still compiles CCL reactor modules.

Deleting those trees in one commit would drop the reference material later
clean-room work still uses, and would break historical CI that resolves
`-pl !openmetadata-ui`. Moving them to a `reference/` submodule is reversible
but is a repo-layout change that needs counsel and a follow-up ADR.

## Options

1. **Keep in place, harden against product misuse (chosen).** Trees stay where
   they are. Document the product path. Gate the cheap misuse entry points.
   Dist already refuses CCL jars.
2. **Move to `reference/` (optional later, possibly a submodule).** Makes the
   non-product boundary obvious. Costs a large git move, CI path updates, and a
   submodule or subtree policy. Revisit after counsel agrees the trees may
   leave the default checkout.
3. **Delete the CCL directories.** Irreversible without git history archaeology.
   Out of scope until counsel records a purge ADR. This record does **not**
   authorize deletion.

## Decision

- Keep `openmetadata-ui/`, `openmetadata-mcp/`, `ingestion/`,
  `openmetadata-airflow-apis/`, and `openmetadata-ui-core-components/` in the
  default tree as reference-only. Do not delete them in the same change as
  this record.
- The product command is `make slim-dist` (and the `smartmetadata-*` packages).
  A root-reactor `mvn package` is not a product demo.
- `./docker/run_local_docker.sh -i true` must print a warning and refuse unless
  `I_UNDERSTAND_CCL_INGESTION=1`. Collate quickstart compose is not a product
  demo.
- `docs/rebuild/PRODUCT_PATH.md` is the prominent map. README points at it.
- VERIFY leftovers stay for counsel, not for this PR to “fix”:
  - `openmetadata-airflow-apis/` directory LICENSE is Apache 2.0; many `.py`
    headers point at `ingestion/LICENSE` (CCL).
  - `openmetadata-ui-core-components` has no module LICENSE (`package.json`
    says Apache-2.0) and is already excluded from dist.

## Consequences

Misuse is harder; the trees are still cloneable. Revisit option 2 or 3 only
with a new ADR after counsel. Restoring CCL artifacts to `openmetadata-dist`
remains forbidden by the Phase 0 record.
