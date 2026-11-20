# Usage/lineage binding runs on structured identifiers with a shared naming rule, and fails closed instead of guessing

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** Bai (D-L2c design v3 conditionally accepted + eleven-question rulings, 2026-11-16; the column-rule purpose reading in this record was confirmed by Bai on 2026-11-17 after a source-level benchmark against the official pin, see Decision)
- **Guard:** `smartmetadata-ingestion/tests/test_dl2c_*.py` (the §6 matrix: binding, context, naming, MySQL, Postgres, CSV, Redshift lock, branches, CALL, UDF/column entry, identifiers, parser extraction, fixups, and the matrix-completion file)
- **Related:** upstream pin `a3012259ca`; ADR:2026-11-16-live-issues-batch-parity (which recorded D-L2c as an unresolved defect); D-L2c design draft v3 (out-of-repo working papers, `DESIGN-DRAFT-D-L2C.md`)

## Context

D-L2c was recorded unresolved in the live-issues batch: usage and lineage
bound parsed SQL names to catalog entities through inconsistent, lossy
paths, and the defects were not confined to context-less fallback.

- **MySQL hierarchy confusion (main path).** The MySQL history SQL wrote
  `CURRENT_SCHEMA` — the physical database — into `database_name` with
  `schema_name` always NULL, and both chains handed the row to the
  resolver with no hierarchy conversion, so the physical database landed
  in the catalog's synthetic-database layer. With
  `databaseName=warehouse`, physical database `sales`, and catalogued
  table `svc.warehouse.sales.orders`, a bare `orders` row built no
  candidate and `sales.orders` searched for `svc.sales.sales.orders`.
  Unifying the defaults on `databaseName` alone could not fix this path:
  fallback is per-field, so the row's `database_name` overrode the
  connection default.
- **Default drift.** The usage and lineage default expressions differed
  by two levels (`databaseName` and the `schema` fallback), so the same
  connection produced different defaults depending on which chain read it.
- **Scope escape × three chains, plus parser information loss.** The
  table, procedure, and UDF resolvers all fell back to "list the context
  schema, compare only the leaf name" after an exact miss, discarding
  the scope SQL wrote — `wrongdb.wrongschema.Orders` could bind to a
  table in the default context. Upstream of that, the parser flattened
  names to strings and lost information: four-part names lost a middle
  segment, a quoted dotted schema (`sales.eu`) became three segments, a
  `CALL` name was truncated to three parts by regex, and a real quoted
  `"<default>"` segment was indistinguishable from the library's
  unquoted placeholder.
- **Postgres/Timescale wrong database + multi-engine double counting.**
  The history SQL stamped every row with the reading connection's
  database (`current_database()`), although `pg_stat_statements` is a
  cross-database view; fixing the label alone would turn mis-binding
  into duplicate counting, because each engine in multi-engine mode
  reads the whole view and the stage accumulates per row.
- **Case folding gap.** Exact matching compared written spellings, so an
  unquoted `Orders` on Postgres (which folds to `orders`) or Snowflake
  (which folds to `ORDERS`) could exact-hit a quoted mixed-case catalog
  object before the case-insensitive fallback ever ran.
- **Redshift context loss.** The product read `NULL AS schema_name`,
  discarding context the official shape recovers through `stl_scan`
  joined to `svv_table_info` (or `SYS_QUERY_DETAIL` on serverless).

## Decision

**Structured identifiers, extracted before the lossy conversion.**
Binding works on `StructuredIdentifier` — an ordered segment sequence
where every segment keeps its written text and quoted flag — and never
splits a string on `.`. Each parser branch (SqlGlot, SqlFluff, SqlParse)
extracts names from its own parse of the same text under the same
dialect, carrying role, alias, statement scope, and a fidelity mark;
a branch that cannot prove fidelity does not bind its names, and no
branch falls back to the string path. The quoted flag is the only thing
separating a real `"<default>"` segment from the unquoted placeholder.
`table_aliases` is keyed by structured identifiers. Association between
an extracted name and a runner endpoint requires a unique structural
identity (segments, quoted flags, alias, role, scope); appearance order
is never consulted as identity proof, and unconfirmed endpoints are
conservatively skipped. Over-long names with no mapping are skipped
with a warning, never truncated.

**Case folding before exact candidates, as specification data.** The
per-engine folding table (`FOLDING_TABLE`) carries separate unquoted and
quoted rules: Postgres-family folds unquoted to lowercase, Snowflake to
uppercase, quoted segments are preserved where case-sensitivity is
established; Redshift's quoted handling is UNKNOWN (it depends on the
`enable_case_sensitive_identifier` configuration the binding layer
cannot see), and engines whose semantics depend on unseen configuration
(MySQL, MSSQL, Databricks/UnityCatalog) fold nothing. Folding applies
only to parsed SQL identifiers, before exact candidates are built; row
context and connection defaults already carry catalog spellings and are
never folded. A quoted segment with an established case-sensitive rule
never enters the case-insensitive fallback; the fallback itself compares
whole FQNs within the candidate's own schema and binds only on a unique
match.

**One candidate construction, one context type, counted skips.** All
three chains share `build_candidate`: SQL qualifier segments are never
overwritten by row context or defaults; three-part names carry their
own segments, two-part names take only the database from context, and
one-part names take both. Row context travels as the frozen
`BindingContext` (values plus per-field input sources: native row,
swapped native row, CSV row, missing, or the entity's own catalog
position for view lineage), constructed once per flow at its channel boundary
and passed as `context=` through every binding call. Skips are counted
separately (missing database / missing schema / both missing, 404,
ambiguity, unsupported qualifier, fidelity-unproven skip per winning
branch, read failure, and per-segment default-bound counts), and
unresolved warnings carry both provenance levels (input field sources
and final candidate sources). Missing context still warns and skips:
unique-candidate discovery was not approved and is not built.

**Shared naming, separated requiredness.** The single selection rule
`resolve_connection_defaults` (per-engine priority chains as data,
independent of any query-log spec) is shared by metadata naming and
binding defaults: the MySQL family reads
`databaseName → database → "default"`, the `database` family reads
`database`, Databricks/UnityCatalog read `catalog`, and the schema chain
is `databaseSchema → schema` (the `schema` compatibility key is kept).
Only the selection is shared, never the requiredness: the shared
function returns `None` for a missing segment and never raises, because
binding defaults are optional — a fully qualified SQL name or a
two-column CSV row binds with an empty connection — while each metadata
method keeps its own required check (Postgres still raises when
`database` is absent, inside its own method). Both binding call sites
invoke the same function.

**MySQL: approach 1 (change the native SQL alias).** The template now
reads `CURRENT_SCHEMA AS schema_name, NULL AS database_name`, and the
database segment comes from the shared naming rule. This was chosen
over a row-handling swap because the template is the native rows' only
producer (the alias change is the swap's only site, and the SQL text
itself documents the correct contract), CSV rows never pass through the
template so file input is naturally unaffected, NULL `CURRENT_SCHEMA`
rows fall through to the defaults with no extra branch, and a
row-handling swap would have left the misleading alias in the SQL while
having no implementation point inside the owning module. The two
approaches must never be combined: swapping twice would restore the
defect. The swapped rows are marked `row_native_swapped` at the input
source level.

**Postgres/Timescale: `dbid` join plus a multi-engine filter seam.** The
template joins `s.dbid` to `pg_catalog.pg_database` for the database
name (the official shape), and `schema_name` stays NULL as in the
official shape. In multi-engine mode (`ingestAllDatabases`) each
engine's statement additionally restricts the shared view to its own
database (`s.dbid = (SELECT oid FROM pg_database WHERE datname =
current_database())`), applied through the query-log base's
connection-dependent filter hook (`QueryLogSpec.conditional_filters`),
so the single-engine statement keeps its unfiltered official shape and
a history row is read by exactly one engine. A custom statement source
must expose a `dbid` column; without it the query fails loudly with a
SQL error and never silently falls back to the current database.

**Column attribution: alias consistency, not occurrence count
(purpose reading, confirmed 2026-11-17).** The design's column rule
required an identifier to appear exactly once, which by definition can
never hold for a temporary table (written once, read once) and dropped
baseline temporary-table lineage wholesale. The implemented rule
confirms column attribution when all occurrences of the identifier
carry the same alias text (no alias counts as one value) and the
existing alias-pinning check against the endpoint still holds: the
confirmed object is the attribution target, not the occurrence count,
and alias-consistent occurrences present a single target with no
guessing. The design's explicit failure mode is preserved — a
multi-alias self-join still skips — and single-occurrence behavior is
unchanged. This is a purpose reading of the design rule by the
implementing coordinator (the design never discussed temporary tables
and never approved dropping a baseline capability). Bai confirmed
this purpose reading on 2026-11-17 after a source-level benchmark:
the official engine's Table identity ignores alias and occurrence
count, and its intermediate-table mechanism requires the same table
to occur in both a write and a read statement, so a single-occurrence
rule would destroy baseline temporary-table lineage the design never
approved dropping. The rule stays stricter than official on
multi-alias self-joins (skip, not collapse), per the design's
fail-closed stance.

**Explicitly not done.** Unique-candidate discovery; deleting the
`schema` compatibility key; copying the Redshift join; widening
cross-service resolution (explicit list, exact-only, first-hit, and
source-context reuse are retained as recorded limits); new query-log
specs; any Java or connection-schema change. The scan-range fallback
(`databaseSchema` as the default schema) is retained as conditional
old-behavior compatibility only: it is correct only when the session's
schema happens to equal the scan range, and the per-segment
default-bound counts make the exposure measurable.

## Consequences

Residuals and limits carried out of this batch:

- **Redshift alignment is a separate follow-up, not done here.** The
  Redshift SQL is untouched and its current behavior (NULL schema) is
  locked by tests. The official shape (`LEFT JOIN scans` +
  `SELECT DISTINCT`) turns one query into many rows when several tables
  are scanned, so row cardinality and context ownership need their own
  design, and `svv_table_info` permissions plus the serverless /
  non-serverless branches need separate verification.
- **SqlFluff CREATE VIEW targets are not emitted on Exasol/TSQL.**
  Those dialects place the view name in `view_reference` /
  `object_reference` segments the walker does not visit, so the target
  name never reaches binding (fail-closed: the unconfirmed endpoint is
  skipped, with no dedicated count for this omission). TSQL usually
  resolves through the SqlGlot winner, narrowing the impact. Fixing it
  needs new segment handling, not a role tweak.
- **The SqlParse branch silently drops names after a truncated name in
  the same list.** For `SELECT * FROM t.1, u`, the truncated `t` is
  reported as an unsupported occurrence, but `u` — a legal name hidden
  in the same non-table-position identifier list — is dropped with no
  occurrence and no dedicated count. Triggering it needs a malformed
  table-position input, and the direction is fail-closed (no
  mis-binding); fixing it needs rework of how the walker consumes the
  list following a table position, beyond this batch's scope.
- **CTE references are marked INTERMEDIATE as a defensive tightening.**
  Names the extraction marks INTERMEDIATE (CTE references) are never
  binding candidates. This changes no baseline behavior: the baseline
  runner views likewise contain no CTE name, and a CTE name has no
  endpoint and is never reachable through endpoint association.
- **Built-in functions differ by branch — resolved (D-L2c H, 2026-11-20).**
  The SqlFluff/SqlParse extractors emit built-in function names (e.g.
  `COUNT`) as function occurrences while the SqlGlot branch's model
  excludes them. The column-path heuristic does not filter them — it
  matches only the `NAME(` shape, so `COUNT(*)` was a UDF candidate
  under SqlFluff — and the real gate was the `resolve_udf` catalog
  lookup, which skips on a 404. That gate is no longer the only one:
  `udf_names_from_extraction` now filters a bare, unquoted call whose
  leaf is in `BUILTIN_FUNCTION_NAMES` (596 names, `lineage/udf_names.py`),
  before any catalog lookup, so a same-named catalog UDF is never
  expanded by a built-in call on any branch. The filter predicate is:
  single-segment, leaf unquoted, leaf upper-cased in the table.
  Qualified names (`sch.COUNT`) and quoted names (`"COUNT"`) are never
  filtered — a qualifier or quotes are the caller naming a catalog
  object on purpose. Generation method (DRAFT-H §2.3):
  `B = E_fluff ∩ E_parse ∩ M_glot` over the sqlglot 29.0.1 `exp.Func`
  subclasses' `sql_names()` (601 names), probed under mysql and postgres
  and intersected across dialects (591), union the design's fixed
  appendix-corpus probe (61 names, 5 not in the enumeration:
  `BIT_AND`, `BIT_OR`, `LTRIM`, `RTRIM`, `STRING_AGG` — sqlglot models
  them under differently-named classes); `M_glot` is a node-class check
  (a modeled, non-`Anonymous` `Func` node), never a name comparison.
  The table is signed-in explicit data, locked by a test that recomputes
  the triple live over the fixed corpus. New count key
  `builtin_function_filtered` (`BINDING_COUNT_KEYS`), via an optional
  `on_builtin_filtered` callback into `resolver.note_builtin_filtered`;
  no per-call logging (`COUNT(*)` is too common). **Baseline change:**
  `COUNT(*)` no longer reaches `resolve_udf`, so `unresolved_udf_count`
  no longer contains built-in noise — compare that number across the
  deploy with this item deducted. **Not 1:1:** official has no such
  filter (the SqlGlot exclusion is structural); the yardstick is the
  product's own SqlGlot branch behavior, basis: implementation method /
  branch-consistency convergence. The filter itself is a named,
  reasoned deviation: it removes an active mis-action (wrongly
  expanding a UDF body), not a miss. **Residual:** the table was
  generated with sqlparse 0.6.0; the pin is 0.6.1, unpublished at
  generation time — regenerate with the pin version once published and
  re-run the lock-table test. Known boundary (method's, not an
  omission): sqlglot-unmodeled builtins (`JSON_AGG`, `NOW` — `Anonymous`
  in 29.0.1) and dialect-only names (`DATE_FORMAT`, `CONVERT`) are not
  in the table; a same-named catalog UDF for those is still expanded
  identically on all three branches.
- **The `ENTITY` input source exists for view lineage only.**
  `FieldSource` gained an `ENTITY` value because the view channel's
  context comes from the processed entity's own catalog position —
  neither a log row nor a CSV row, and labelling it as either would
  mislabel it. It is a closed minimal extension: its only use is
  `view_lineage.py:205-206`, where both fields are always `ENTITY`.
- **`view_parent_schema_tables` is verdict-gated, and its schema is
  corrected.** View parents now derive only from association-confirmed
  endpoints: an unconfirmed endpoint contributes no parent, where the
  baseline (`clean_table_name(...).split(".")`) never dropped a
  source. Four-part names and quoted dotted schemas now yield the
  correct schema segment, where the baseline yielded a wrong one.
  Both changes are retained — the gating is fail-closed, and the
  schema change corrects a baseline error — and they affect the view
  metadata ingestion of 11 metadata connectors.
- **`read_failure` counts single-entity lookups only.** A
  schema-listing failure is not counted: it propagates along the old
  behavior, which likewise counted nothing and propagated. Only a
  non-404 error from a single-entity lookup counts, and still raises.
- **Usage loses the fidelity count for a failed extraction with no
  involved tables.** When `parse_sql_statement` returns `None` before
  a `ParsedData` exists, the extraction-level counts have nothing to
  attach to, so such a query loses its fidelity count on the usage
  chain while the lineage chain counts it before its own early
  return. The trigger is narrow — a winner must exist, `involved`
  must be empty, and extraction must fail — and fixing it needs a
  design decision first: the `None` semantics of
  `parse_sql_statement` must not change, since an empty-table
  `ParsedData` would wrongly add a cost record.
- **Unknown engines keep a narrowed guarantee.** Where folding is
  UNKNOWN, exact matching uses the written spelling and the fallback
  stays available; the case-related mis-binding risk is not claimed
  solved for those engines. When an engine's semantics are established,
  only the folding table and its tests change.
- **Custom Postgres statement sources must expose `dbid`.** The
  requirement is a documentation-level contract (recorded in the spec
  module); the name-shape pattern does not check columns.
- Live acceptance still needs Bai's transient login and a rebuilt
  service (the catalog is empty): a multi-schema MySQL service for the
  bare / two-part / three-part walk-through, a multi-database Postgres
  service for per-`dbid` binding without duplicate counting, and the
  stored-config read for the `supports*` flags.
