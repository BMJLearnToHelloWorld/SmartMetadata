# Collate Community License source trees are purged from this repository

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** Bernie Bai (authoritative: delete CCL / reference trees; keep Apache core + SmartMetadata rebuild)
- **Guard:** `scripts/rebuild/check_purged_trees.py`; `make verify-rebuild` includes that gate; `scripts/rebuild/check_product_path_hints.py`
- **Related:** ADR:2026-10-22-ccl-trees-stay-reference-only (superseded); ADR:2026-10-22-shippable-dist-excludes-ccl-modules; `docs/rebuild/PRODUCT_PATH.md`; `docs/rebuild/PARITY.md`

## Context

ADR:2026-10-22-ccl-trees-stay-reference-only kept official Collate Community
License (CCL) modules in git so later clean-room work could read them. Counsel
has now reversed that Non-goal: this repository must not keep official CCL
code as reference. Bernie will un-fork later; this change removes the trees.

The product is the Apache OpenMetadata server plus the SmartMetadata rebuild
(`smartmetadata-ui/`, `smartmetadata-ingestion/`, `smartmetadata-mcp/`).

## Options

1. **Keep reference-only (rejected).** Contradicts the purge instruction.
2. **Move to `reference/` (rejected).** Still ships official CCL in the default
   checkout.
3. **Delete the CCL trees (chosen).** Product path stays Apache core + rebuild.

## Decision

- Delete from the default tree: `openmetadata-ui/`, `openmetadata-mcp/`,
  `ingestion/`, `openmetadata-airflow-apis/`, `openmetadata-ui-core-components/`,
  and Collate-image compose (`docker/docker-compose-quickstart/`,
  `docker/docker-compose-ingestion/`, `docker/docker-compose-openmetadata/`).
- Keep Apache modules the slim product uses (`openmetadata-spec`, `common`,
  `openmetadata-shaded-deps`, `openmetadata-service`, `openmetadata-dist`,
  SDK/clients/operator/ITs) plus the three `smartmetadata-*` packages.
- `openmetadata-airflow-apis/` is deleted despite a directory Apache LICENSE:
  source headers are CCL and it is not on the slim product path.
- `openmetadata-ui-core-components/` is deleted despite `package.json`
  `Apache-2.0`: no module LICENSE, not required by the Vue product UI, and it
  existed to serve the purged React UI.
- Root reactor, Makefile, and product Docker must not list or build the
  deleted trees. `./docker/run_local_docker.sh -i true` always refuses.
- Reintroduction is a gate failure, not a docs-only event.

## Consequences

Clone size drops. Historical CCL CI that assumed those paths is leftover
upstream surface and is not the SmartMetadata product gate
(`.github/workflows/smartmetadata-rebuild.yml`). Dist Enforcer
`ban-ccl-modules` still refuses those artifacts if they return as Maven
dependencies. Capability gaps versus the deleted product surfaces are recorded
in `docs/rebuild/PARITY.md`.
