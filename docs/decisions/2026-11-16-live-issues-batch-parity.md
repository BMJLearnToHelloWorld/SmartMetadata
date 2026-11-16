# Live-issues batch: sink constraint split, filter-step restoration, connection/schema-selection alignment, and edit-form parity with official

- **Status:** Accepted
- **Revisions:** v1 2026-11-16 (initial)
- **Deciders:** Bai (rulings 2026-11-16: D-L6 Option B — all 46 edit-form rows in one batch; D-L2a/b/c all in this batch, fixed per official)
- **Guard:** `smartmetadata-ingestion/tests/test_constraints.py` (pin split shapes); `smartmetadata-ui/src/views/ingestion/AddServiceView.test.ts` (D-L3 merge legality + reset); the `updateIngestionPipeline` header regression test; `PlatformHealthWidget.test.ts` (UUID navigation); `smartmetadata-ui/src/i18n/referencedKeys.test.ts` (lockstep catalogs)
- **Related:** upstream pin `a3012259ca`; ruling + evidence `~/workspace/work/live-issues-20261116/` (RULING.md, EVIDENCE-ISSUE{1,2,3,4,5}.md, EVIDENCE-SINK-PK.md — not in-repo)

## Context

Bai reported five live problems on the deployed stack (2026-11-16): (1) a
MySQL default schema produced doubled schema FQNs, a blank one spliced in
`default`, and wizard schema scoping failed with an encrypt error naming
`includeSchemas`; (2) creating a data source auto-created only one Metadata
Agent instead of five; (3) editing an agent and saving failed with a
media-type error; (4) the edit-service and edit-agent screens differed from
official in layout and language; (5) clicking a connected service on the
homepage Platform Health widget landed on a 404. Investigation at pin-source
level found a sixth, blocking defect underneath (2): every metadata run
failed in the sink, so zero tables landed and the AutoPilot workflow aborted
after its first node.

## Decision

**D-L1 — constraint split (ingestion).** The shared `SchemaConstraints`
layer emits exactly one representation per key group, per pin's
`sql_column_handler.py`: a single-column PRIMARY KEY or UNIQUE tags its
column only; a composite PRIMARY KEY or UNIQUE becomes a table constraint
only, with no column tags. The pin-identical server check
(`DatabaseUtil.validateConstraints`) rejects the both-representations shape
the fork previously emitted. No per-connector changes; no new
`list_constraints` readers for the four connectors that lack them
(databricks, doris, redshift, unitycatalog) — that absence is a capability
gap, recorded as a residual, and the shared-layer fix makes those connectors
safe whenever readers land.

**D-L2 — FQN law untouched; form guidance via the doc panel.** Pin and fork
FQN law are identical (`service.(databaseName|"default").<schema>.<table>`);
the doubled FQN and the `default` segment are pin-identical behavior for
the stored config, so the builder is NOT deduped. The fork defect was the
connection form's bare labels. Descriptions surface through the ported doc
panel on focus (the pin mechanism); no inline hints are added. The
fix-pass Q-2 change (A′ + C′) bundles the connector markdown and
ports the fetch, so field descriptions surface through the doc
panel; where the doc has no section for a field, the parsed schema
title/description renders instead (see Consequences).

**D-L2a — `databaseSchema` selection.** Pin's layering: `databaseSchema`
restricts the candidate set to exactly that one schema; the pipeline
`schemaFilterPattern` then filters the candidate set on top. The fork's
either/or + prefix-regex reading is replaced by restrict-then-filter in the
one shared helper (`select.is_configured_schema`) and all nine call sites.
Pin's restriction covers only the five connection schemas that declare
`databaseSchema` (mysql, mariaDB, doris, databricks, unityCatalog); for
greenplum, mssql, redshift, and timescale — whose schemas declare no
`databaseSchema` — the restriction is a reconcile-consistent fork
convention, not pin behavior. Postgres is pattern-only: pin's
`postgresConnection.json` declares no `databaseSchema`, so the shared
rule never restricts it, and the fork's reconcile scope table likewise
gives Postgres no schema fallback. Snowflake is untouched (pin's
Snowflake connection schema has no `databaseSchema` field, so
pattern-only is already pin-correct).

**D-L2b — connect-builder preference.** All four pymysql builders
(`mysql.py`, `mysql_common.py`, `mariadb_common.py`, `doris_common.py`)
use the shared `connection_database` rule from pin's
`get_connection_url_common`: the URL path is `/database` if the connection
carries `database`, else `/databaseSchema` if set; `databaseName` never
enters the URL. The MariaDB/Doris extension landed in the fix pass under
the Group-A ruling (Bai 2026-11-16 15:27): both schemas declare
`databaseName` + `databaseSchema` and neither declares `database`/`catalog`
(the same shape as MySQL), so the shared rule applies identically and the
sibling builders call it rather than duplicating it.

**D-L2c — usage/lineage default database: UNRESOLVED consistency and
naming-semantics defect.** The asymmetry is fact: usage builds its
resolver with `default_database` from `database`/`catalog`, while
lineage adds a `databaseName` level (`database`/`databaseName`/`catalog`)
and a `schema` fallback for `default_schema`. The defect is NOT confined
to context-less fallback. MySQL's query log writes the physical database
(`CURRENT_SCHEMA`) into `database_name` with `schema_name` always NULL,
and usage/lineage hand the row to the resolver with no hierarchy
conversion, so the physical database lands in the catalog's
synthetic-database layer: with `databaseName=warehouse`, physical
database `sales`, and catalogued table `svc.warehouse.sales.orders`, a
bare `orders` row (CURRENT_SCHEMA=sales) builds no candidate and is not
found, while `sales.orders` searches for `svc.sales.sales.orders`.
Fallback is per-field, not whole-row (`database = database_name or
default`): the row's `database_name` overrides the connection default, so
unifying on `databaseName` does NOT fix this main path and does not cover
the unconfigured-`databaseName` case where metadata uses `default`. The
case-insensitive fallback can mis-bind: after exact lookup fails,
`_resolve_case_insensitive` uses only the leaf name plus row/default
context, discarding the scope SQL wrote, so `wrongdb.wrongschema.Orders`
can bind to the wrong existing table in the default context and keep
writing usage/lineage. Pin evidence, corrected: pin's shared
query-parser source reads database/schema from the row only and
establishes NO general connection-derived rule — exactly TWO
engine-specific overrides exist (Snowflake falls back to `database`,
`snowflake/query_parser.py:84-90`; ClickZetta to
`databaseName`/`databaseSchema`, `clickzetta/query_parser.py:206-210`).
`get_database_name_for_lineage` is called by dashboard sources AND the
Atlas source and Tableau pipeline, but still does not govern the
database query-parser path. "MySQL NULL" holds only for the built-in
history SQL (the CSV path can carry context); 16 connections declare
`database` (not 15); of 8 built-in query-log channels only MySQL is
`databaseName`-only, so the realistic object of this defect is mainly
MySQL. Pin's usage resolves via EntityResolver (exact /
case_insensitive_exact / wildcard, possibly multiple entities), not the
sql_lineage table lookup, and table lineage also has a precise API
(`get_by_name`), a schema fallback, and synonyms. Two questions stay
OPEN, with no option selected: Q2, whether the `schema` level is a
compatibility alias — `trino_common.py:79` reads
`connection.get("schema")` and `SourceConfig.connection` is a bare dict,
so it must be confirmed before any cleanup and is NOT a dead branch; Q3,
the product decision on the fork's REST/exact-plus-unique-match
resolution — pin behaviors remain alignable (symmetric context
extraction, qualified-name vs row-context precedence, single-database
`databaseName`/`default` naming semantics, engine special cases), while
multi-candidate search and multi-entity binding need a separate
mis-binding-risk assessment, not mechanical copying. No A/B/C or
per-engine selection is made here. The required follow-up is a shared
usage/lineage rule normalizing binding context per engine against the
metadata naming model: the synthetic database name separated from the SQL
physical database/schema; the MySQL catalog database segment aligned to
`databaseName`/`default` with CURRENT_SCHEMA in the schema segment;
explicit qualifiers keeping scope; case-insensitive fallback never
escaping scope; only truly-missing segments filled; context-less rows
explicitly either unique-candidate discovery or warn-and-skip. Both fork
readers are left byte-identical in this batch; the defect is recorded
unresolved, not as a convention to be ratified by picking an option.
Design input for the follow-up: the B-group D-L2c design verification
(11-question checklist + per-mechanism mis-binding risk assessment,
VERIFY-D-L2C-DESIGN.md); the shared-rule design starts after this batch
lands (Bai 2026-11-16 15:38–15:39).

**D-L3 — filter-pattern step restored.** The wizard's step 3 emits exactly
the `*FilterPattern` properties declared in the kind's connection schema
(pin's `isFilterSchemaProperty`/`getOrderedFilterEntries` mechanism), each
a `{includes, excludes}` object. All invented flat keys (`includeSchemas`,
`includeViews`, `generateSampleData`, kind-gated siblings) are removed from
the wizard merge; the edit-time carry-over carries only `*FilterPattern`
keys; the filter form resets on kind and type change. A kind with no
declared patterns shows pin's empty state. The composer-card UI for these
fields is Issue-4 scope (D-L6), not silently bundled here. The wizard
filter step renders the Issue-4 shared `FilterPatternCard` composer via
`SchemaField`, not two text inputs as D-L3's wizard scope assumed; the
D-L3 boundary was crossed in effect by reuse of the shared component, not
by new wizard scope — the wizard built no filter UI of its own.
Filter-card seeding is settled: the wizard passes pin's step-2 options
(first-two-open, `hasExistingData` false on fresh create, schema-default
plus Snowflake system excludes) through `SchemaField`'s options prop, and
seeded values reach the parent only on first user edit (pin behavior), so
no wizard/edit seeding asymmetry remains. Workflow-form cards take no
step-2 options, matching pin's options-less uiSchema. LLM/MCP kinds have
no pin wizard counterpart; the filter-step mechanism for them is
extrapolated from pin's kind-driven design, not verified against pin
rendering (O-2).

**D-L4 — no AutoPilot chain change.** The chain is pin-identical (29 server
files md5-identical; wizard trigger a faithful port). The instance cause
was the workflow aborting after the D-L1 sink failure. The latent
`supports*`-flags gap (the fork wizard never sends the flags) is settled at
live acceptance via a fresh-service stored-config read, not by a silent
wizard change. The 2026-11-14 C-1 refutation covered the OLD `icrm_monorepo`
service only and does not extend to the new service.

**D-L5 — PATCH content type at the call site.** `updateIngestionPipeline`
sends `Content-Type: application/json-patch+json`, matching the fork's
per-call opt-in convention (the other 25 PATCH sites). Pin's global axios
interceptor is NOT replicated; that divergence is a noted design
difference, not a residual.

**D-L6 — edit-form parity, all 46 rows.** Both edit forms are rebuilt to
pin parity: two-step wizards with steppers, sectioned renderers (pin's
`getPropertySections` / `groupProperties` rules), the doc panel, composer
cards for filter patterns, the 4-branch auth selector, file-or-input SSL,
map editors, toggles, the test-connection card (edit view and create
wizard), the cron summary card, the success screen + deploy modal, and all
wording rows including pin-EN-residual schema titles on connection fields.
Deliberate fork conventions and deviations, all recorded: S-08 —
displayName/description fields stay on the edit-connection page because the
fork entity header has no display-name edit affordance (the page is the
only display-name/description editor for services); the edit save keeps the
PUT transport (no per-kind PATCH service API exists in the fork) while
preserving pin's empty-diff-leaves semantics via a fast-json-patch compare;
the navigation guard is dirty-gated rather than pin's unconditional
blocker; step-1 Back navigates to the service detail page (fork
convention); no service logo; the doc panel fetches bundled connector
markdown (fix-pass Q-2; see Consequences); the S-05 IP alert is ported in the edit-service view only (the
wizard does not render it; see Consequences); GCP `projectId` is
single-value only, external-account `credentialSource` renders as a JSON
textarea, and GCP Path/ADC branches do not preserve a stored `projectId`
beyond the form value; pin's what-to-ingest description renders
with `{brandName}` = iSmart instead of the literal "Collate". The cron
summary card renders the effective cron (pin's mount quirk shows schedule
text for on-demand pipelines); test-connection validation is a sync
missing-required-count check approximating pin's RJSF `validateForm`; the
breadcrumb category link lands on the unfiltered services list; and the
invented `FilterPatternCard` `schemaDescription` paragraph was REMOVED in
the fix pass (pin never renders it) — no such prop or binding remains.

**D-L7 — widget passes the UUID.** The Platform Health widget navigates
with the service UUID its rows already carry. Re-architecting the detail
flow to FQN-addressed (pin's end-to-end shape) is a recorded residual, not
done here.

## Consequences

Residuals and open questions carried out of this batch:

- **S-05 IP alert (landed in the fix pass, UI-only).** Correction of the
  earlier record: the endpoint EXISTS in the fork server —
  `GET /v1/services/ingestionPipelines/ip`
  (`IngestionPipelineResource.getHostIp`) returns 200 `{ip}` when the
  pipeline client is enabled and IP info is on, 204 with an empty body
  when `ingestionIpInfoEnabled` is false, and 200 plain-text
  `Pipeline Client Disabled` when no pipeline client exists (verified
  read-only against fork source; identical shape at pin `a3012259ca`).
  No runner concept was needed: pin reads the runner from
  connection-form data, and `ingestionRunner` appears in zero
  connection schemas, so the runner clause is inert and the predicate
  collapses to the Hybrid-platform check the edit view already
  computes via `getOrchestratorStatus()`. The port is one API client
  function (`getPipelineServiceHostIp`) plus `fetchHostIp` /
  `shouldShowIPAlert` in `EditServiceConnectionView.vue`, rendering
  pin's alert on step 1 before TestConnection with pin-verbatim
  locale values. The fork's availability predicate additionally
  excludes the disabled platform, where the banner — not an
  `[unknown]` IP alert — is the fork's answer. The wizard does not
  render the alert (out of scope for this pass; pin's shared form
  renders it there too).
- **S-18 connection-field placeholders (closed in the fix pass).**
  Verified against pin `a3012259ca` (VERIFY-PLACEHOLDER.md): the pin
  shows NO placeholder text on plain connection fields — the connection
  uiSchema carries no placeholders, connection schemas carry no
  `examples`, and RJSF defaults the placeholder to `""`. The fork-extra
  placeholders were deleted, deletions only: 43 literal `placeholder`
  props, 2 `placeholderKey` props, 17 `passwordPlaceholder` flags (16
  `true` + 1 explicit `false`), the `hostPort()` placeholder parameter,
  the four `ConnectionFieldDef` placeholder members, the
  `connectionFieldPlaceholder` / `connectionPasswordPlaceholder`
  readers, the `PASSWORD_PLACEHOLDERS` table, and the now-dead
  `connection.apiKeyHint` / `connection.prefectAuthStringHint` locale
  values (lockstep). The dead `ingestion.pipelines.enableDebugLog`
  locale key (sole consumer: the removed external debug checkbox) was
  deleted lockstep in the same pass; `quality.testSuites.enableDebugLog`
  is live and untouched. Pin-aligned surfaces were left untouched
  (filter-composer placeholders, `MapEditor` key placeholder,
  `ScheduleIntervalField` cron placeholder, `CustomizeMyData`'s local
  variable); env-var secret syntax keeps working, with `secretHint`
  text and the doc panel remaining as the guidance surfaces.
- **Doc-panel descriptions on connection forms (landed in the fix pass,
  Q-2: A′ + C′).** The "external docs-site dependency" premise was
  wrong: pin's `ServiceDocPanel` fetches relative
  `${language}/${serviceType}/${serviceName}.md` paths via `/locales/`
  from files bundled under `public/locales/` (`CONNECTORS_DOCS` is only
  the docs-link root). A′ bundles 51 pin markdown files verbatim (the
  fork-supported subset of the wizard's 49 service types, both
  connector and workflow docs, plus the one image `Mssql.md`
  references) under `smartmetadata-ui/public/locales/` and ports the
  fetch into the panel with pin's stale-request guard (request-id ref)
  and English fallback; pin ships no `zh-CN` markdown, so the EN
  fallback covers ZH. C′ keeps the section framework: the field area
  prefers a valid `$$section` block and falls back to the parsed schema
  title/description only when no usable field description exists, with
  no-markdown and missing-section kept distinct and loading handled
  separately; identity and workflow branches keep their original
  behavior, and an empty schema description shows the explicit generic
  message, never a faked description. Types with no bundled file
  (`WEBHOOK`, `Sklearn`, `Collibra`, `MetadataES`, `SharePoint`, all
  LLM types, `Mcp`, `VertexAI` by case, and the `application` /
  `policyAgent` / `reverseMetadata` / `TestSuite` workflow docs) fall
  back to schema descriptions. Original C (wholesale
  `buildFieldDocDetails` swap) was not implemented. Follow-ups: the
  `SmMarkdown` image-rendering follow-up for bundled docs, and the
  `getActiveFieldNameForAppDocs` non-port (the fork has no
  `Applications` kind to port it for).
- **STATIC `profileSampleConfig` rejected by validation (fixed by the
  Q-3 layered fix in this batch).** Validity now runs AJV over the
  FULL schema: the `oneOf`/`anyOf` branches stay intact and AJV
  resolves the `$ref`s, so a value matching zero or several branches
  keeps its object-level error instead of being judged against one
  branch's fields; `resolveBranches`/`branchSignature` (branch
  collapsing for validation) were removed. `selectBranch` is
  presentation/defaults only and gained a key-overlap step (the
  profile-sample arms have neither discriminators nor `required`, so
  only their keys tell them apart) — `sampleConfigType` was NOT
  written into it, no discriminator was added to the official
  schemas, and pin's `transformErrors` filtering was NOT copied. The
  G-13 field already matched pin's `ProfileSampleConfigField`
  (`pickConfigForType` render filtering, switch cleanup both
  directions) and needed no change; the defect was in the layers
  around it (validity + seeding). Residual: pin's
  `testSuitePipeline.json` (byte-identical to pin `a3012259ca`)
  carries six dangling `$ref`s (GCP `projectId` pointers written
  against a shape that does not exist), which make a raw full-schema
  AJV compile throw; `neutralizeUnresolvableRefs` drops only those
  unresolvable branches, so the three affected `projectId` nodes
  accept any value until pin fixes the generator. Known limitations
  left as-is: `const` discriminators are ignored by `selectBranch`;
  nested oneOf errors block save without inline display
  (pre-existing); render-time `deref` can still throw on the dangling
  TestSuite refs (pre-existing, out of scope).
- **D-L2c** is an unresolved defect (above), not a residual awaiting an
  option pick. The **FQN-addressed detail flow** (D-L7) and the
  **missing `list_constraints` readers** on four connectors (D-L1)
  stay recorded residuals.
- **Create-flow debug/supports asymmetry (R2) — RESOLVED in the fix
  pass.** The add-ingestion page now reads both gating flags from the
  loaded service's connection config and binds the debug flag inside
  the workflow form (first in Scope & Behaviour), matching the edit
  view and pin's single `AddIngestion` component; the external debug
  checkbox is gone. The pipelines-list create modal reads both flags
  from the selected list record's stored connection config. The modal
  deliberately binds no debug flag: pin has no list-page create modal
  (`IngestionWorkflowForm`'s only consumer is the add/edit page), so
  there is no pin debug surface to mirror there, and the modal keeps
  sending no `loggerLevel`.
- Live acceptance still needs Bai's transient login and a re-created
  service (the catalog is empty): fresh-service stored-config read
  (settles D-L4 flags), AutoPilot workflow-instance inspection, a metadata
  run against single-PK/composite-PK/PK-less tables, an agent-edit save, a
  Platform Health click, wizard schema scoping, and the `default`-FQN
  by-design check.
