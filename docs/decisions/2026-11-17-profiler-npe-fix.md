# Profiler creation NPE: null-tolerant secret traversal plus an explicit metrics default in the AutoPilot mapper

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** Bai (direction C — guard plus mapper — fixed in design v2; idea review passed with corrections F1–F14)
- **Guard:** `ReflectionUtilTest` (null/duplicate/unnamed element keys); `SecretsManagerNullCollectionElementTest` (encrypt/decrypt of a fresh profiler POJO); `CreateIngestionPipelineImplTest.profilerAgentMetricsMatchTheSchemaDefault` (mapper output locked to the schema default)
- **Related:** upstream pin `a3012259ca`; design v2 `~/workspace/work/profiler-npe-fix/DESIGN.md`, idea review `~/workspace/work/profiler-npe-fix/IDEA-REVIEW.md`, root-cause report `~/workspace/work/profiler-npe-20261117/ROOT-CAUSE.md` (none in-repo; the design is the sole authority for this batch)

## Context

AutoPilot's profiler agent creation failed deterministically: three
live triggers died the same way, right after `Creating 'profiler'
Agent`, with a `NullPointerException` in
`SecretsManager.encryptIngestionPipeline`, reached through
`encryptPasswordFields` → `forEachTraversableElement` →
`getCollectionElementKeys` → `ReflectionUtil.readName`. The delegate
reported Failure and the instance terminated; the other four agents
in the same rounds succeeded. The failure is independent of the
connection input: the mapper never sets `metrics`, so the shape that
kills the traversal is built by the code itself, on every run.

Two layers, each fixed at its own level:

1. **A build-shape-dependent generated initial value.** What
   jsonschema2pojo 1.3.1 generates for the `metrics` default — an
   array whose items are a `$ref` to an enum — varies with the
   build shape: the deployed jar and incremental builds show a
   NULLS variant (20 `aconst_null` slots, proven from the deployed
   jar's constructor bytecode), while clean builds show a FROMVALUE
   variant (20 `MetricType.fromValue` defaults). The correlation
   with build shape was observed (clean → FROMVALUE 3/3,
   incremental → NULLS 4/4); the internal mechanism is unproven.
   The schema default itself lives in
   `databaseServiceProfilerPipeline.json`
   (`properties.metrics.default`, 20 values) and is correct; only
   the generated constructor's handling of it varies. The fix
   (guard plus mapper) makes both the AutoPilot product and
   traversal safety independent of which variant a build produces.
2. **A zero-tolerant traversal.** `ReflectionUtil.readName` calls
   `element.getClass()` with no null check, and its `catch` clauses
   do not include `NullPointerException`. The AutoPilot profiler
   mapper sets four filter patterns and never `metrics`, so the
   fresh POJO travels unchanged into `repository.create` and the
   secret traversal, where the first null element throws.

This is a latent bug on a pin-identical path, fixed as a bug fix —
not an official 1:1 port. The eight files of the root-cause chain
match the pin byte for byte except `SecretsManager.java`, whose
single pre-existing difference (the secret id is derived from the
pipeline name here, from the pipeline id in the pin) sits outside
the traversal/NPE path and is unrelated to this fix. Whether
upstream main has since fixed the same bug was not checked, and
this record makes no claim about upstream main.

Two mechanism bounds, recorded so the fix is never re-argued on a
false premise. First, the guard's justification is not a REST-path
NPE: a REST request body deserializes `SourceConfig.config` as a
`Map`, and a `Map` is neither an OpenMetadata object nor a
`Collection`, so it never enters `getCollectionElementKeys`; the
only production conversion to the profiler POJO happens at deploy
time in `ProfilerWorkflowConfig`, after which no secret traversal
runs. The traversal defect is general — any POJO-shaped config
carrying a null-element collection that reaches secret traversal
fails encrypt, decrypt, secret-field listing, deletion, and
masking — and the AutoPilot profiler is the proven instance. Second,
the Jackson bounds: `MetricType.fromValue` throws
`IllegalArgumentException` on an unknown non-null value; a POJO
materialized with `metrics` omitted keeps the constructor's
generated initial value (20 nulls in the NULLS variant; see item 1
above); an explicit JSON null element yields null directly
under Jackson's null-token semantics without calling `fromValue`.
The guard covers the latter two shapes.

## Decision

**D1 — `readName` answers null for a null element, before the
`try`.** The method's contract already reads "The name an element
reports, or null when it has none": a null element has no name, so
returning null is the contract made total, not new semantics.
`getCollectionElementKeys` already handles null names completely
(`occurrences` skips them; `usable` requires non-null), and its
contract already sends unnamed elements to position keys — a null
element gets `#<index>` exactly like any other unnamed element, and
the key list stays position-aligned with the collection. The guard
is silent, consistent with the existing empty-name path, and it
must stay before the `try`: the `catch` blocks themselves call
`element.getClass()`, so moving the guard inside would reintroduce
the NPE. Coverage is the two key-computation call sites times every
downstream operation: `SecretsManager.forEachTraversableElement`
(encrypt, decrypt, `getSecretFields`, `deleteSecrets`) and
`PasswordEntityMasker.walkCollection` (mask, unmask,
`buildPasswordsMap`), plus the `OwnedSecrets` walkers reached
through `PasswordFieldWalker`. Every downstream gate is null-safe
(`isOpenMetadataObject` and `isTraversable` both check null first),
so a null element is skipped after keying — which is semantically
safe, because a null element has no fields and no `@PasswordField`,
and nothing that could need encrypting. `forEachTraversableElement`
is deliberately untouched: filtering nulls there would shorten the
key list and misalign every later key, and skipping nulls there
would duplicate gates that already exist.

**D2 — The profiler mapper sets `metrics` explicitly, mirroring
the schema default.** `getDatabaseServiceProfilerPipeline` gains
`.withMetrics(new ArrayList<>(List.of(...)))` with the 20
`org.openmetadata.schema.profiler.MetricType` constants in exactly
the schema default's order (note the same-named
`org.openmetadata.schema.type.MetricType`, which must not be
imported). The `ArrayList` wrapper preserves the POJO's existing
mutable-list shape: `withMetrics` is a plain reference assignment
(proven from bytecode), so the list passed in is the list the POJO
holds, and the constructor's and Jackson's shapes are both
`ArrayList`. The 20 constants repeat the schema default; drift is
locked by a test that reads the schema JSON from the classpath and
compares value by value, in order, through
`MetricType.fromValue` — a schema change (added, removed, reordered,
or renamed value) or a missing resource fails the test.

**Rejected.** Deleting the schema's `metrics` default: a spec fork
that would also change UI seeding and runner semantics — the schema
says "If empty, then all metrics will be computed", so deleting the
default would silently widen "20 by default" to "all 36 when
empty" — and it would not fix the traversal. Fixing or upgrading
the generator: heavy, whole-spec regeneration blast radius, and
likewise leaves the traversal defect in place; the defect is
contained by the guard and bypassed by the mapper. Repository-layer
normalization: touches every pipeline type's pin behavior, and
filtering nulls to an empty list would trip the "empty means all"
semantics. Catching `NullPointerException` inside `readName`: would
also swallow genuine NPEs thrown inside `getName()`, hiding real
bugs. Filtering nulls inside `getCollectionElementKeys`: breaks
position alignment. Reading the schema default at runtime for the
mapper: I/O and parsing inside pure construction logic, over-design
when a test locks the drift.

No data migration is needed: the create path always failed before
storage, so no `[null × 20]` entity exists, and the REST path stores
a `Map`.

## Consequences

- Secret traversal is total over null collection elements on every
  walker path. A future mapper or conversion path that produces the
  same shape cannot re-trigger this failure; the guard is permanent
  infrastructure, not a profiler workaround.
- AutoPilot profiler agents are stored with a real 20-metric
  configuration instead of 20 nulls. The mapper's constant list must
  track the schema default; the drift test enforces it, and the gate
  must build through the reactor (spec module included) so a stale
  spec jar cannot fake the test green.
- The schema default must not be deleted to "fix" this, and the
  generator defect stays in place, contained. Revisiting the
  generator is a separate decision with its own blast radius.
- The guard's placement is load-bearing: it sits before the `try`,
  and any refactor that moves it into the `catch` or the calling
  loop reintroduces the NPE.
- Deployment rebuilds the server container (a Java change), with the
  UI container restarted after, per the standing rule. Live
  verification must trigger on a fresh service or delete the
  existing profiler agent first — `getOrCreate` deduplicates on
  (pipeline type, display name) and would otherwise skip `create`
  entirely. It asserts the API read-back of the new agent's
  `metrics` equals the 20 real values, no NPE in the server logs,
  and delegate success; a profiler run is not a must-pass item if
  the pipeline-client environment cannot run it.
