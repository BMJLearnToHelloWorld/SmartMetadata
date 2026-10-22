# ARCHITECTURE

The system map: what OpenMetadata *is as a running system*, where its parts live, and the boundaries
that actually hold. Not the product pitch (see README) and not a how-to (see
[DEVELOPER.md](DEVELOPER.md), [`skills/standards/`](skills/standards/), and
[`.claude/rules/`](.claude/rules/)). Structural claims trace to the measured module graph or a file
path; numbers come from a read-only audit of this tree (module edges from the POMs; package/import
counts by grep/Tarjan).

---

## PART 1 — Bird's-eye view

SmartMetadata is **one Java backend** (`openmetadata-service`, Dropwizard/JAX-RS) fronting a
**MySQL/Postgres** catalog and an **Elasticsearch/OpenSearch** index, with a **Vue 3 SPA**
(`smartmetadata-ui/`) and a **Python ingestion CLI** (`smartmetadata-ingestion/`) that feeds the catalog
*through the same REST API*. Everything is typed by JSON Schemas in `openmetadata-spec`, from which
Java POJOs are generated. The backend is a **mid-graph hub**: the operator, integration tests, and
distribution depend on it; it depends only on `common`, `openmetadata-spec`, and the shaded search
clients. Official CCL UI / MCP / ingestion trees are **purged**. See
[docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md) and
[docs/rebuild/PHASE0.md](docs/rebuild/PHASE0.md)
(ADR:2026-10-22-shippable-dist-excludes-ccl-modules,
ADR:2026-10-22-ccl-trees-are-purged).

**Path A — an API request** (e.g. `POST /v1/tables`). Enters `openmetadata-service` at
`OpenMetadataApplication.java` (Jersey). A JAX-RS resource in `service/resources/**` (e.g.
`resources/databases/…`) delegates to a repository in `service/jdbi3/**` (extends `EntityRepository`),
which persists via `jdbi3/CollectionDAO` / `EntityDAO` (JDBI SQL-objects; 129 sub-DAOs) → the SQL DB.
A non-GET response also fans out to `service/events/` (change events) and `service/search/` (index
update). **Exit:** JSON response + a persisted row + an async index write. *A "create/update returns the
wrong field" bug lives in `resources/` or `jdbi3/` — or in the schema that typed it.*

**Path B — an ingestion run.** Starts in `smartmetadata-ingestion/` (Python CLI
`smartmetadata-ingest`). `source.type` selects a factory in `connectors/registry.py`; the source
yields records; `sinks/metadata_rest.py` **PUTs them to the backend REST API** — i.e. Path A.
**Exit:** catalog rows created/updated. *A "Snowflake tables missing" bug lives in
`smartmetadata-ingestion/src/smartmetadata_ingestion/connectors/snowflake.py`.*

**Path C — a search query.** The SPA issues it from `smartmetadata-ui/` → the backend
`resources/search/SearchResource` → `service/search/` → ES/OS via the **shaded** `es.*`/`os.*`
clients (`openmetadata-shaded-deps`). Indexes are (re)built by `service/search/indexes/*Index.java` on
entity writes (Path A) or by a reindex app in `service/apps/`. **Exit:** ranked results in
`SearchView.vue`. *"Stale/incorrect results" → `service/search/`; "search box is broken" →
`smartmetadata-ui/`.*

---

## PART 2 — Codemap

### Maven modules + rebuild packages
Dependencies/dependents are the **measured Maven edges** (module POMs). Official CCL Maven
modules were purged (ADR:2026-10-22-ccl-trees-are-purged).

| Module | Responsibility (one line) | Entry point | Depends on → / ← depended by | Look here first |
|---|---|---|---|---|
| `openmetadata-spec` | The 904 JSON Schemas + generated POJOs — the typing source of truth | `src/main/resources/json/schema/` | → `common` · ← `sdk`, `service` | `…/json/schema/entity/` |
| `common` | Shared utilities (`CommonUtil`, `nullOrEmpty`, …) | `common/…/common/utils/CommonUtil.java` | → none · ← `spec`, `service` | `…/common/utils/` |
| `openmetadata-shaded-deps` | ES + OS Java clients relocated behind `es.*`/`os.*` so both link at once | `elasticsearch-dep/pom.xml`, `opensearch-dep/pom.xml` | → external only · ← `service` | the two child poms (do **not** edit) |
| `openmetadata-service` | The core backend: REST API, repositories, migrations runner, search, apps | `…/service/OpenMetadataApplication.java` | → `common`, `spec`, `es-deps`, `os-deps` · ← `k8s-operator`, `integration-tests`, `dist` | `service/resources/` |
| `openmetadata-sdk` | Java client SDK for the API | `…/sdk/client/OpenMetadata.java` | → `spec` · ← `integration-tests` | `…/sdk/client/` |
| `openmetadata-k8s-operator` | Kubernetes operator running OM jobs | `…/operator/OMJobOperatorApplication.java` | → `service` (provided) · ← `integration-tests` (test) | `…/operator/` |
| `openmetadata-integration-tests` | Backend API ITs (`*IT.java`, concurrent) | `src/test/java/org/openmetadata/it/tests/` | → `sdk`, `service`, `k8s` (test) · ← none | `…/it/tests/` |
| `openmetadata-dist` | Packaging/assembly of the shippable **CCL-free** server | `openmetadata-dist/pom.xml` | → `service` · ← none | the assembly pom |
| `openmetadata-clients` | Published client artifacts | `openmetadata-clients/openmetadata-java-client/pom.xml` | → none · ← none (**isolated** in the Maven graph) | `openmetadata-java-client/` |
| `smartmetadata-ui/` (not Maven) | Vue 3 console (Apache-2.0) | `smartmetadata-ui/src/` | REST client of Path A | `src/router/index.ts` |
| `smartmetadata-ingestion/` (not Maven) | CLI Source→Sink (Apache-2.0) | `smartmetadata-ingestion/src/` | REST client of Path A | `connectors/` |
| `smartmetadata-mcp/` (not Maven) | stdio MCP (Apache-2.0) | `smartmetadata-mcp/src/` | REST client of Path A | `src/tools.ts` |

Go-live: `docs/rebuild/PHASE11.md` (`make verify-rebuild`) and `docs/rebuild/VERIFY_RUNTIME.md`.
Gaps vs purged official surfaces: `docs/rebuild/PARITY.md`.

### `openmetadata-service` internals (package = `…/service/`; 1,777 main `.java`)
Intended flow (sampled, 08a Pass 2): **`resources/*Resource` → `jdbi3/*Repository` → `jdbi3/CollectionDAO`/`EntityDAO` → SQL.** But the packages are **not** acyclically layered (Part 3).

| files | dir | role |
|---|---|---|
| 294 | `search/` | ES/OS indexing + query (`indexes/*Index.java`) |
| 233 | `resources/` | JAX-RS entry points; largest domains `ai/` (34, flat, grew its own seed/service tier) and `services/` (32, sub-packaged) |
| 160 | `apps/` | pluggable applications / schedulers (incl. reindex) |
| 157 | `migration/` | migration runner (`MigrationWorkflow`) |
| 147 | `jdbi3/` | repositories (`EntityRepository`) + DAOs (`CollectionDAO`, 129 sub-DAOs) |
| 128 | `util/` · 98 `security/` · 93 `governance/` · 27 `events/` | shared utils · authN/Z · workflow engine · change events |

### `smartmetadata-ui/` internals (`src/`; Vue 3 + Ant Design Vue)
| dir | role |
|---|---|
| `views/` | route screens (search, asset detail, lineage, admin, governance, quality, ingestion, collaboration) |
| `layouts/` | `AppShell.vue` |
| `components/` | lineage graph + service-connection fields |
| `api/` | REST helpers for Path A (the only intended caller of the backend) |
| `router/index.ts` | Vue Router table |

### `smartmetadata-ingestion/` internals
| dir | role |
|---|---|
| `connectors/` | `postgres`, `mysql`, `kafka`, `snowflake` (`@register_source`) |
| `sinks/metadata_rest.py` | PUTs entities to the backend API |
| `runner.py` / `cli.py` | Source→Sink + `smartmetadata-ingest` |
| `client/rest.py` | JWT / login HTTP client |

---

## PART 3 — Invariants

The boundaries the code **actually keeps** (08a measured them ≥ ~95%), plus schema-first and
migration append-only. "Not enforced" is stated plainly. Documented rules the code does **not** keep are
listed at the end as non-invariants, so they aren't mistaken for these.

**I1 — Modules form an acyclic, downward-only dependency graph.** Every internal Maven edge points from
a higher-level consumer to a lower-level provider. Official CCL Maven modules were purged; the root
reactor is Apache modules only (ADR:2026-10-22-ccl-trees-are-purged). *Enforces:* **not enforced** — there
is no `maven-enforcer` ban-cycles rule; it holds by construction. *Breaks if violated:* the reactor can
no longer order the build.

**I2 — Product connectors register by `source.type`.** `smartmetadata-ingestion` ships four connectors
(`postgres`, `mysql`, `kafka`, `snowflake`) via `@register_source` / `connectors/registry.py`. Official
CCL `service_spec.py` plugins were purged. Coverage gaps: [docs/rebuild/PARITY.md](docs/rebuild/PARITY.md).
*Enforces:* `check_ccl_free_ingestion.py` refuses `metadata` / `openmetadata_ingestion` imports.
*Breaks if violated:* the CLI cannot load the source, or the CCL-free gate fails.

**I3 — Generated Java POJOs are a pure sink.** Java models live in `openmetadata-spec/target/` and
depend only on the spec. Product Vue/ingestion do **not** consume a generated TS/Pydantic client from
purged trees. *Enforces:* [`.claude/rules/schema-first.md`](.claude/rules/schema-first.md). *Breaks if
violated:* a hand-edit is overwritten by the next Maven generate.

**I4 — Schema-first: schemas generate Java models, never the reverse.** The **904** JSON Schemas under
`openmetadata-spec/src/main/resources/json/schema/` are the source of truth. Product generation is
**jsonschema2pojo** → Java POJOs. Official Pydantic/quicktype trees were purged. Runbook:
[`.claude/rules/schema-first.md`](.claude/rules/schema-first.md).

**I5 — Migrations are append-only.** Files under `bootstrap/sql/migrations/{flyway,native}` are never
edited once shipped; a change is a *new* version (`bootstrap/MIGRATION_SYSTEM.md`). *Enforces:* **not
enforced** — there is no CI check and no runtime checksum-abort (the stored per-version checksum is not
validated to fail startup). *Breaks if violated:* an edited applied migration **silently** never re-runs on
existing databases (its version is already in `SERVER_CHANGE_LOG`) yet *does* run on fresh installs →
schema drift with no error. Runbook: [`.claude/rules/migrations.md`](.claude/rules/migrations.md).

### Non-invariants — documented rules the code does NOT keep (do not treat as invariants)
- **Java `resources → jdbi3 → DAO` layering is not acyclic.** `resources ↔ jdbi3` is a mutual cycle
  and most service package-pairs are cyclic; only `security/` is a partial sink. The intended one-way
  flow is contradicted by repository→resource imports (value types under `resources/`).
- **Connector count is not official-product parity.** Four clean-room connectors vs the purged 106
  `service_spec.py` set — see [docs/rebuild/PARITY.md](docs/rebuild/PARITY.md).
