# AGENTS.md

Always-loaded guidance for every session — **the only instruction file:** every `CLAUDE.md` and
`.github/copilot-instructions.md` is a symlink to the `AGENTS.md` beside it
(ADR:2026-10-09-agents-md-is-the-one-instruction-file). Path-specific rules live in
`.claude/rules/*.md`; procedures live in skills. Read [ARCHITECTURE.md](ARCHITECTURE.md),
[DEVELOPER.md](DEVELOPER.md), and [docs/index.md](docs/index.md). Product path:
[docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md)
(ADR:2026-10-22-ccl-trees-are-purged).

## About SmartMetadata

Apache OpenMetadata **server** plus a clean-room Vue 3 UI, ingestion CLI, and stdio MCP.
Official Collate Community License UI / ingestion / MCP trees are **not in this repo**.

## Stack at a glance

- **Backend**: Java 21 + Dropwizard. Product server: `make slim-dist`.
- **Frontend**: Vue 3 + Ant Design Vue in `smartmetadata-ui/` (`make ui_dev`).
- **Ingestion**: Python `>=3.10` in `smartmetadata-ingestion/` (`smartmetadata-ingest`).
- **MCP**: Node stdio server in `smartmetadata-mcp/`.
- **Database**: MySQL (default) or PostgreSQL. **Search**: Elasticsearch or OpenSearch.

## Environment setup

```bash
make prerequisites
source env/bin/activate   # first time: python3.11 -m venv env
make ingest_install ui_install mcp_install precommit_install
make slim-dist            # Apache server tarball
make verify-rebuild       # offline product gate
```

- **Java**: Java 21; `mvn`. **UI/MCP**: `npm` in the `smartmetadata-*` packages.
- **Docker**: `./docker/run_local_docker.sh` (no CCL ingestion). `-i true` always refuses.

## Repository layout

Maven modules: `openmetadata-spec`, `openmetadata-sdk`, `common`, `docker/rdf-store`,
`openmetadata-shaded-deps`, `openmetadata-service`, `openmetadata-k8s-operator`,
`openmetadata-integration-tests`, `openmetadata-dist`, `openmetadata-clients`.

Not Maven: `smartmetadata-ui/`, `smartmetadata-ingestion/`, `smartmetadata-mcp/`,
`bootstrap/sql/`, `conf/`, `docker/`.

**Purged (must not return):** `openmetadata-ui/`, `openmetadata-mcp/`, `ingestion/`,
`openmetadata-airflow-apis/`, `openmetadata-ui-core-components/`. Gate:
`scripts/rebuild/check_purged_trees.py`.

## Hard cross-cutting constraints

**Secrets.** Never commit secrets. Auth is JWT; RBAC lives in Java entities; config in
`conf/openmetadata.yaml`. **Do not modify `.github/workflows/**` unless the user authorizes
it (`CLAUDE_ALLOW_WORKFLOW_EDITS=1`).** Product rebuild CI is already authorized:
ADR:2026-10-22-rebuild-ci-is-a-separate-workflow.

**All caches MUST be bounded.** Never use a bare `dict` / `HashMap` / `Map` as a cache without
an explicit size cap (100–1000). Python: `lru_cache` / `OrderedDict`; Java: Caffeine/Guava
`maximumSize(N)`. TypeScript: `lru-cache`.

**Comments explain *why*, never restate code.** Testing: assert observable outcomes, not mock
wiring. Prefer ITs over heavily-mocked units.

**License.** Root and rebuild packages are Apache-2.0. Do not reintroduce Collate Community
License source. Schema-first: edit `openmetadata-spec/` JSON, then regenerate Java via Maven —
never hand-edit generated POJOs.

**Do not contribute upstream** to `open-metadata/OpenMetadata`.

## Pointer index

| Rule file | When editing |
|---|---|
| `java.md` / `java-impact-map.md` | `**/*.java` — style, spotless, ITs, impact map |
| `smartmetadata-ui.md` | `smartmetadata-ui/**` — Vue console |
| `python-ingestion.md` | `smartmetadata-ingestion/src/**/*.py` |
| `schema-first.md` | `openmetadata-spec/.../schema/**` |
| `migrations.md` | `bootstrap/sql/**` |

Conventions: `docs/design-patterns.md`, `REVIEW.md`, `docs/decisions/` (`ADR:<date>-<slug>`).

Skills: `dev-setup`, `planning`, `tdd`, `systematic-debugging`, `test-enforcement`,
`java-affected-tests`, `verification`, `code-review`, `java-checkstyle`, `pr-checklist`.

Harness integrity (`make harness-check`) **warns** on dead refs, rule-glob misses, doc-size
budgets (this file ≤ 200 lines, ARCHITECTURE.md ≤ 300, a rule ≤ 100), and dangling `ADR:` citations.

## Git commit conventions

Never add "Co-Authored-By" lines or any AI-attribution trailers. The commit is authored by me;
you are a tool, not a co-author.
