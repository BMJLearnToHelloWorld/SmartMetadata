# Product Make and default developer commands execute rebuilt surfaces only

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (execution isolation)
- **Guard:** `scripts/rebuild/check_product_path_hints.py`; `scripts/rebuild/test_require_reference_stack.py`; `make yarn_start_dev_ui` / `make install` refuse unless `I_UNDERSTAND_REFERENCE_STACK=1`
- **Related:** ADR:2026-10-22-ccl-trees-stay-reference-only; `docs/rebuild/PRODUCT_PATH.md`; ADR:2026-10-22-rebuild-ci-is-a-separate-workflow

## Context

CCL trees stay in git as read-only reference (the earlier record). The remaining
hole was **execution**: root `Makefile` set `PY_SOURCE ?= ingestion/src` and
`include ingestion/Makefile`, so `make help` listed `install` /
`yarn_start_dev_ui` / `generate`, and a developer running `make` without knowing
executed historical Collate Community License code. Product CI already used
`make slim-dist` / `make verify-rebuild` / `make live-smoke`; the default Make
namespace did not match that path.

Deleting the trees is out of scope (purge stays a counsel ADR). Fail-closed
wrappers are the option that keeps the trees readable.

## Decision

- `.DEFAULT_GOAL` is `help`. `make help` lists rebuilt targets only:
  `slim-dist`, `ui_*`, `ingest_*`, `mcp_*`, `verify-rebuild`, `live-smoke`,
  `check-*`.
- `include ingestion/Makefile` and the former CCL root recipes live in
  `Makefile.reference` and are parsed only when `I_UNDERSTAND_REFERENCE_STACK=1`.
  Without that env, those target names exist as stubs that refuse with a
  substitute (`make ui_dev`, `make ingest_install`, …).
- `scripts/dev_setup.sh` and `docker/docker-compose-quickstart/up.sh` use the
  same hatch. Docker `-i true` keeps `I_UNDERSTAND_CCL_INGESTION=1`; that ack
  does **not** unlock Make.
- Product Jobs A/B/C never set the hatch and never invoke the reference trees.
- Do not add a root `package.json` workspace that installs `openmetadata-ui`.
- `make -C ingestion` is left ungated: historical Collate CI cds into that
  tree. It is not the product Make entry. Gating it would fail those jobs
  unless every workflow set the hatch (workflow edits are out of scope).

## Consequences

`make` / `make help` / former CCL target names are safe to run on a product
checkout: they either do rebuilt work or refuse. Reference-stack demos remain
possible with an explicit env. Trees stay in git until a purge ADR.
