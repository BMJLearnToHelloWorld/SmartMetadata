# AutoClassification clean-room engine: Presidio + spaCy, catalog enumeration, and the P-06 supersession for autoClassification only

- **Status:** Accepted
- **Revisions:** v1 2026-11-14 (initial); v2 2026-11-14 (review fix pass: parent decisions D-1–D-3, corrected overclaims, R-1 amendment, recorded residuals); v3 2026-11-14 (python-dateutil declared in the extra; stdlib date emulation kept as warned fallback only); v4 2026-11-14 (targeted re-review close-out: N-1 leaf-name content context, S-M1 residual narrowing, F-01/F-02 corrections, recorded LOW residuals)
- **Deciders:** Bai (2026-11-14: agent capabilities aligned, one round in two batches, source-level benchmarking, cleanup over accommodation); parent ruling RULING-CAPABILITY.md (D-C1/D-C2/D-C9/D-C10/D-C12/D-C13)
- **Guard:** `smartmetadata-ingestion/tests/classification/test_preprocessing.py`, `test_models.py`, `test_recognizers.py`, `test_analysis.py`, `test_candidates.py`, `test_scoring.py`, `test_columns.py`, `test_patching.py`, `test_engine.py`, `test_workflow_ac.py`, `test_cli_classify.py`, `test_sampler_registry.py`, `test_rest_ac.py`; `smartmetadata-airflow-apis/tests/test_builders.py`
- **Related:** RULING-CAPABILITY.md D-C1/D-C2/D-C9/D-C10/D-C12/D-C13; CAPABILITY-GAPS.md C-5; design-ac-engine.md; ADR:2026-11-11-pipeline-deep-dive-python (P-06, superseded for autoClassification only); ADR:2026-11-14-agent-capability-batch1 (batch-1 translation prerequisite)

## Context

The autoClassification agent could be created, deployed, and triggered,
but every run failed loudly: P-06 left `autoClassification` in the
runner's no-runner set because no runner implemented it (C-5). The
official classification chain cannot be ported — the tree census found
1219 CCL files against 4 Apache ones under the pin's ingestion tree,
none of the 4 in the chain — so the engine is built clean-room from the
behavioral spec in `design-ac-engine.md`, the `openmetadata-spec` JSON
schemas already in the tree, and third-party library APIs. The server
already ships the PII seed data (`piiTagsWithRecognizers.json`,
byte-identical in the fork); the engine needs no seeding step.

## Decision

**D-C1 — Clean-room basis.** Nothing in the chain is copied, ported, or
adapted from pin code: no pin glue, structure, or tests. The
implementation works only from the design spec, the spec schemas, and
the libraries' public APIs. All glue is fresh code under the fork's
Apache-2.0 header. Tests are written fresh from the spec, never
translated from pin tests.

**D-C2 — Dependency adoption.** `presidio-analyzer==2.2.358`,
`spacy>=3.8.2,<3.9`, `preshed<3.0.14` are an OPTIONAL extra
(`autoclassification`) of `smartmetadata-ingestion`, never core
dependencies: the core suite runs and the package imports without them,
and every Presidio/spaCy import in the classification package is lazy.
License: MIT for all three, confirmed from the installed
distributions' `METADATA` (`License: MIT` + the OSI Approved MIT
classifier; spaCy and preshed bundle `LICENSE` files; for
presidio-analyzer the declaration rests on the metadata, as with the
batch-1 collate-sqllineage caveat). Requires-Python is `>=3.9` /
`>=3.10` / `>=3.9`; the resolved image Pythons satisfy it — the ingest
image resolves to Python 3.11 (`Dockerfile.ingest` default
`python:3.11-slim`, live container 3.11.18) and the Airflow image to
Python 3.12 (`Dockerfile.airflow` default
`apache/airflow:3.3.2-python3.12`, live container 3.12.14). The shared
dependencies already in the live Airflow image (typer 0.27.2, pydantic
2.13.5, numpy 2.5.3, click 8.5.0, Jinja2 3.1.6, requests 2.34.2,
packaging 26.3, tqdm 4.70.1) all fall inside spaCy/thinc's required
ranges, so the extra installs without upgrading or downgrading any of
them; the remaining spaCy/Presidio dependencies are fresh installs.
Rejected alternatives stand rejected: regex-only (loses NER and the
seed's predefined recognizers), a different NER substrate (the seed's
recognizer configs are Presidio-shaped).

**D-C10 — Engine shape.** A `classification/` package under
`smartmetadata-ingestion` (`candidates`, `preprocessing`,
`recognizers`, `analysis`, `scoring`, `columns`, `engine`, `models`,
`patching`); an `AutoClassificationWorkflow` following the fork's
workflow shape (UsageWorkflow's prepare/close pattern, the base
step accounting); catalog enumeration over `RestClient.iter_collection`
scoped by `?service=`; the fork's samplers reused behind per-category
adapters; tag writes as direct JSON Patch operations on
`RestClient.patch` with optimistic-lock retry (3 attempts, weak ETag,
unconditional fallback after the same ETag is rejected twice).
Behavior constants are named module constants with why-comments;
`["PII"]` is the single constant `PII_CLASSIFICATION_FILTER`; the
language-to-model mapping is data, not branches. No UI and no server
changes: the Generated-tag badge and the recognizer-feedback approval
surface belong to the D-C14 follow-up batch.

**P-06 supersession (autoClassification only).** The runner's fail-loud
set loses `autoClassification` alone; `dbt`, `elasticSearchReindex`,
and `application` remain future work and still fail loudly. The
2026-11-11 record stays Accepted — it still governs the other three
types — and this record supersedes it only for autoClassification.
The stale builder docstring (which claimed the task ran a metadata
ingestion) is rewritten: the DAG task dispatches through
`run_workflow` to the real engine.

**Models into the images, no runtime download.** Both images install
the extra and provision the English model at build time
(`python -m smartmetadata_ingestion.cli
install-classification-models --languages en`). The provisioning
command resolves languages strictly (it refuses `any` and unknown
codes loudly) and installs pinned 3.8.0 wheels from absolute
github.com URLs with the running interpreter's pip, so a build-time
GitHub outage fails the image build loudly instead of shipping an
image that cannot classify. A missing model fails the run loudly at
warm-up, before any entity work: the engine pre-checks model presence
because Presidio's stock loader would otherwise download a missing
model on first use. The `classify` CLI subcommand runs an
autoClassification workflow and refuses any other workflow type.

**Hardened predefined variants, seed-used first.** The seven
seed-used predefined recognizers whose stock behavior the spec names
as hardened (CreditCard, Url, Ip, Nhs, Date, Iban, EsNif) are fresh
subclasses written from the spec's hardening descriptions, never
copied. Optional NER backends (Stanza, Transformers, GLiNER, Azure)
resolve-and-skip with a logged warning when absent; Azure is always
skipped because the schema carries no credentials. Custom-recognizer
execution, `requireExplicitMatch` behavior, datatype gating, and the
legacy single-tag processor are NOT built: the spec names no reader
for `requireExplicitMatch`, and inventing one would be invention.

**Per-category coverage.** Database: all 11 fork database types
sample through the profiler sampler bindings. Messaging (kafka,
redpanda): topic columns classify by NAME ONLY — the topic samplers
return message strings with no field attribution — a bounded
residual, recorded per category. Storage (s3): object-metadata rows
only (key/size/etag/lastModified/storageClass); file-content sampling
is a bounded residual. Unknown source types fail in `prepare()`; a
known category with no sampler binding warns and fails per entity,
never silently succeeding over zero entities.

**Spec readings fixed by this batch (implementation interpretations,
flagged for review).** The exception-list rule is the spec-silent
structural parse documented in `recognizers.py` (the seed carries zero
exception lists). "Already enhanced" means score above the pattern
score. The reason string's content follows the spec; its punctuation
is fresh. Column-name analysis reads the dotted path. The sampler
closes once at run end, never per entity: the fork's samplers share
one connection/consumer per run, and closing per entity would break
the remaining entities. Fetching topic samples is unconditional and
only persisting is gated by the store flag (which ANDs the pipeline
flag with the server profiler setting when present, else the pipeline
flag alone) — deliberately unlike the messaging metadata pipeline's
double gate, which governs fetching. The warning counted set gains
item 6 (autoClassification skips on the processor step, tag-PATCH
warnings on the sink step), folded in `_collect_warnings` per C-11/B-4.

**Section 6 cleanup correction.** The design's third cleanup item —
deleting the `timeoutSeconds`/`waitForCompletion` keys from the AC
node in `workflowLiveDefinitions.ts` — is REFUTED and NOT done. The
keys sit on all seven ingestion nodes, the UI schema transcribes them
from the official pin JSON, and the server's
`RunIngestionPipelineImpl` waits for pipeline completion up to the
timeout when the flag is set. They are live workflow behavior, not
inert keys; deleting them from the AC node alone would change
governance-workflow behavior and break sibling consistency. No UI
file is touched by this batch.

## Consequences

An autoClassification run now classifies for real: Suggested PII
labels land on matching columns with recognizer metadata, nothing
lands on non-matching columns, and a run that does nothing never
reports success. The seed's presence is an acceptance check, not a
design dependency: one GET of the PII tags confirming seeded
recognizers, run live after deploy. The full-model path is verified by
the live acceptance run, not by CI; CI runs the suite with stub
analyzers plus one live-engine test against the English model.

## Review fix pass (v2, 2026-11-14)

The parent review of this batch returned REJECT (4 HIGH / 10 MEDIUM /
33 LOW findings: recognizer/analysis-layer behavior parity failed on
seeded, live-reachable paths). The fix pass closed the code findings
listed below and re-gated; this section records the parent decisions,
the v1 claims it corrects, the R-1 record amendment, and the RECORD
dispositions. The v1 text above is untouched history. Clean-room
boundary for the fix: implementers worked only from the review's
behavioral descriptions and the behavior-only spec supplement
(`SPEC-SUPPLEMENT-B2.md`); pin AC source was never read for the fix,
and the one verbatim adoption (D-1) came through the supplement, not
from pin source.

**Parent decision D-1 (reason-string templates).** Pin's short
reason-string templates are adopted verbatim as observable behavior.
Boundary ruling: the templates are behavior/interface, like the ETag
`W/"<version>"` format already adopted as a required server contract,
not code structure. The fix worked only from the review's §5(c)
behavioral description plus supplement §17, never from pin source.
The v1 claim that the reason string's "punctuation is fresh" is
corrected: grouping is by recognizer identifier, groups sort by
identifier, headers use the adopted template, and pattern lines render
regexes (not names) sorted score-descending.

**Parent decision D-2 (exception-list rule).** The pin exact-link rule
is adopted: table-only, leaf-name-only, exact set membership, tested
per recognizer. The fork's generalized rule (entity-level links,
topic/container links honored) is rejected per pin-wins; topic and
container exception lists are inert under the rule, exactly as in
pin. No generalization without an explicit parent ruling recorded
here. The v1 "spec-silent structural parse" reading is superseded.

**Parent decision D-3 (dev-failure classifications).** The three
"TEST BUG" classifications in the implementation record were
re-verified from current-state evidence only (test + code + the
assertion that would have failed) and found EXPLICITLY UNVERIFIED —
all three (patching list-wrap, recognizers tokenization expectation,
analysis list-wrap/signature); see `D3-RECONSTRUCTION-B2.md`. No
worker-recall claim is made anywhere: no failing log exists, the
tests landed in a single commit with no later test-fix commit, and
multiple mutually exclusive reconstructions fit the current state.
The classifications stay unverified unless the parent explicitly
accepts them as such.

**Corrected overclaims.** The v1 claim about "the seven seed-used
predefined recognizers" is FALSE: pin has 20 recognizer factories,
13 were missing, and all 20 are now present — the 13 added are
UsLicense, AuTfn, InAadhaar, EsNie, SgUen, AuAbn, AuAcn, ItVat,
SgFin, UsBank, PlPesel, ItFiscalCode, and FiPersonalIdentityCode.
Date behavior is corrected two ways: the validator boosts parseable
dates to 1.0, keeps the score otherwise, and never rejects (the v1
implementation inverted this); the patcher implements the dateutil
two-default rule via the stdlib emulation recorded below. IBAN
hardening is match-time `IGNORECASE` at construction (the v1
uppercase-in-validation approach never saw lowercase matches).
Column-name analysis reads the leaf name with context None, not the
dotted path. "Already enhanced" is the Presidio metadata flag key
read from recognition metadata, not a score-above-pattern-score
proxy. Provisioning accepts `any` (the v1 "refuses `any`" is
corrected), requires the `--languages` flag, rejects empty segments
and non-enum identifiers, and distinguishes installed from
already-available models in its output.

**R-1 amendment (§6-correction legs).** The v1 §6 conclusion — the
`timeoutSeconds`/`waitForCompletion` keys stay — STANDS, but legs
(i) and (ii) as originally stated were wrong: (1) the keys are
schema-declared config with defaults true/3600; (2) the UI workflow
file is a LIVE deployment-server database dump, not a seed
transcription; (3) the seed JSON omits the keys on the Profiler and
AC nodes, relying on defaults (it carries them on only 5 of 7 nodes);
(4) the pinning test is `workflowNodeSchemas.test.ts`, not
`workflowSerializer.test.ts` (which asserts config drop on save and
would not fail on deletion); (5) the Profiler node shares the AC
situation exactly. Leg (iii) — the server waits up to the timeout
when the flag is set — was confirmed in full. Do not re-propose this
deletion. The same correction is amended into `design-ac-engine.md`
§6 item 2 and the RULING D-C9 adoption.

**Findings closed in code.** S-H1–S-H4, S-M1–S-M10, S-L1, S-L2, S-L3,
S-L4, S-L7, S-L8, S-L11, S-L12 (CLI strictness; the version-reconcile
simplification is recorded below), S-L14, S-L21, S-L22, S-L23, S-L24,
and S-L32 (the `Dockerfile.airflow` comment mirror). S-L10 and S-L26
are documentation fixes in the implementation record. Tests that
locked in divergent behavior were rewritten with the fixes at
same-or-greater strength.

**RECORD dispositions (no code change).** S-L5 `supportedEntities`:
passed only if the constructor accepts it; §18b divergence — pin
FAILS construction when the argument is passed to a hardened
factory, the fork silently succeeds — recorded, seed-safe today
(only the two Spacy configs carry `supportedEntities`, and spaCy has
no hardened factory). S-L9 sampled-fields granularity: the fork
always yields leaves; pin yields the matched node (possibly a
struct) when the sample has fields. S-L13 second sampler registry:
`SAMPLER_BINDINGS` duplicates the profiler bindings' keys — drift
risk noted, not derived. S-L15 priority 0: the fork applies the
default on None only; pin maps 0 to 50 via `or` semantics — edge
only, the seed's priority-0 tag is disabled. S-L16 store-flag None
edge: pin treats a present config with `storeSampleData=None` as do
not store; the fork's `is False` check stores — schema-default
dependent. S-L17 per-entity sample-count overrides are absent; the
fork uses the pipeline value only. S-L18 PATCH-after-store-failure:
the fork records the store failure but still PATCHes — a fail-forward
adaptation, where pin propagates and the PATCH is blocked. S-L19
candidate cache caches failures; pin refetches (immaterial: a single
call). S-L20 construction-failure propagation does not fit: warm-up
runs outside any per-column try (see below), so propagation would
abort the run rather than yield a per-column entry. S-L25 grouped
nits: duplicate `_ENTITY_COLUMNS` lists, the unbounded
`CandidateStore._cache` (single-filter invariant documented,
unenforced), the stringly-typed NHS check via class name, and the
`_messaging_sampler` re-enumeration duplicating `_AC_MESSAGING_TYPES`.
S-L27 thin dispatch test: asserts only the empty-report outcome, not
workflow class/engine construction; same-or-greater strength is
verified via the full suite. S-L28 preprocessing/walk/patch-accounting
nuances: sets flattened and `bytearray` skipped (pin drops sets and
converts `bytearray` via its Sequence branch), a global `visited` set
versus pin ancestor-chain tracking (immaterial — JSON entities cannot
share identity), and a patch fallback making 3 calls versus pin's 2
(outcome-equivalent, one wasted conditional attempt). S-L29
threshold-default materialization stays an open question (schema
default 0.6; the fork's absent-key behavior versus the pin factory
suggestion is unsettled — the generated model is not in the pin
tree); the seed moots it (all 43 configs carry explicit 0.6). S-L30
unknown source type RAISES in `prepare()` — a DELIBERATE fail-loud
deviation from pin's warn-and-run-sampler+sink, acknowledged; no fork
sampler exists for unknown types. S-L33: the implementation doc's
"regex would fail on 3.10" imprecision is recorded only; no `regex`
pin is added (pip would resolve an older compatible `regex`). Three
further synthesis §1 items are recorded deviations without finding
IDs: binary handling (the fork skips more than pin's bytes-only —
saner, kept), the classification filter applied uniformly including
messaging (pin's fetcher does not apply it), and `all_results` order
(content-first versus pin's winning-target-first, negligible).

**S-L20 evidence (why propagation does not fit).** `warm_up`
(`engine.py`) builds ALL analyzers once via `build_tag_analyzer` →
`build_tag_recognizers` → `build_recognizer` → `_build_predefined`
(catch → skip → None); `warm_up` is called once in
`workflow.py:_execute_records` BEFORE the entity loop, outside any
per-column try; per-column failure entries exist only in
`classify_entity`'s try/except around `_classify_column`, which runs
after warm-up. A propagated construction failure would abort the
whole run, not yield a per-column entry. `build_tag_analyzer` is
called only from warm-up (plus tests). No code changed.

**S-L6 connection test / service validation (RECORD).** No cheap
reuse exists, checked against fork code only. The UI-driven
TEST_CONNECTION runner (`automations/execute.py`) is definition-driven:
it needs a Workflow dict, a server-connection JWT, a workflow id, a
server definition fetch, and per-step PATCH-back; it returns step
results instead of raising, and supports ONLY mysql and doris (others
raise `UnsupportedServiceTypeError`). `test_live_connection` helpers
exist only in `connectors/mysql_common.py` and
`connectors/doris_common.py`. S3's `test_connection` lives on the
catalog reader (`S3Source.prepare`), not on the `S3Sampler` AC uses.
Kafka/Redpanda samplers are lazy (live consumer built on first sample)
with no probe method; database samplers are lazy via the
`binding.connect` factory with no uniform probe. Reuse would require
fabricating an automation-workflow context plus a server definition
fetch per run, covering only 2 of 14 source types — building the rest
is a new per-dialect check framework, out of scope. Standing behavior:
lazy connect with per-entity sampling failures recorded loudly and run
state following them.

**S-L12 version-reconcile simplification (RECORD).** Provisioning is
presence-only: no installed-version-vs-3.8.0 check, no fresh-subprocess
load/NER/version verification, no constraints-pinned pip install. What
pin checks, per supplement §16: spaCy AND Presidio presence; the
installed spaCy version within the extra's declared range AND within
every requested model's declared spaCy range; equal-version models
still load-verified in a fresh subprocess (loads, provides an NER
component, reported version equals the pinned version, installed spaCy
satisfies the model's own declared compatibility); differing or absent
models installed with spaCy pinned to the currently installed version
via a constraints file, then version- and load-verified; provisioning
stops at the first failure, retaining prior work. The fork's plain pip
install is recorded as a simplification, not assumed equivalent.

**S-M1 application-point equivalence.** The predicate is the pin
exact-link rule; its APPLICATION is post-analysis in
`analysis.py:_apply_decorators`, BEFORE corroboration and scoring —
not pre-creation. Ordering evidence in the merged flow:
`_analyze_content` calls `_apply_decorators`, then the date/NER
patchers, then `_apply_corroboration`; `_apply_decorators` checks
`recognizer_excluded_for_column` FIRST, before enhancement and the
threshold filter, and an excepted match never enters `kept`, so it can
never corroborate, never score, and never reach reason strings; the
column-name pass applies `_apply_decorators` only and has no
corroboration. Test
`test_excepted_match_cannot_corroborate_an_uncontextualized_ner_result`
proves an excepted match cannot corroborate an uncontextualized NER
result. Post-analysis exclusion before corroboration/scoring is
observably equivalent to pre-creation; restructuring to per-column
pre-creation was explicitly not done (the fork builds analyzers once
per tag/language at warm-up).

**S-M7 warn-and-drop + production-occurrence analysis.** Results
whose recognizer name resolves to no configured pair are warned about
explicitly and dropped (fail-closed). They cannot occur through
`_run_engine` in the current codebase: identity resolves from
recognition metadata stamped by the engine (the recognizer's current
name plus its construction-fixed identifier), and
`build_tag_analyzer` holds only configured recognizers whose current
names equal their effective config names. The proof depends on every
recognizer stamping its own current name; a future analyze-level
override remapping results (as the S-M6 hardenings do) could break it
— hence warn-and-drop stays, rather than silent passthrough.

**Date emulation (bounded deviation; OPEN PARENT DECISION).** The
two-default rule is emulated with the stdlib: `python-dateutil` is NOT
installed in the capability venv, no installed distribution requires
it, and no dependency was added (not authorized). All 52 supplement
smoke cases pass. Documented edges, unasserted: `March 32` parses as
a date (the number is read as a year; dateutil behavior unverified);
dotted `12.31`/`3.14` parse as dates; compact `20180314` does not
(possible dateutil divergence, not a supplement case); the `19.99`
validator outcome is deliberately unasserted. OPEN PARENT DECISION:
add `python-dateutil` to the `autoclassification` extra (pin depends
on it) versus keep the stdlib emulation with these documented edges.

**Fork-constructed pattern names and judgment calls.** UsLicense
pattern NAMES are fork constructions — the supplement specifies
shapes, regexes, and scores, not names; names surface in the §12
metadata triples, so this is a known approximation (regexes + scores
follow the supplement). CreditCard candidate characters include tabs
alongside spaces and dashes (the supplement says "spaces" — a judgment
call). The context builder passes no global regex flags
(PatternRecognizer's default I|S|M applies); case-insensitivity comes
from the inline `(?i)` per the supplement.

**S-L12 82-language interpretation.** Provisioning accepts all 82
`ClassificationLanguage` identifiers (transcribed from the fork schema
JSON, count verified programmatically), with unmapped enum languages
resolving to the multilingual fallback — otherwise the fallback model
would be unprovisionable once `xx` is rejected, and supplement §16
states the mapping sends unmapped languages to it.

**S-L8 streaming enumeration.** Enumeration now streams instead of
materializing the full entity list; mid-stream enumeration failures
surface after partial processing (a semantic change from the
materialized form, tested).

**TFN raise behavior (specified, tested, no validator fix).** A
labeled-TFN match (`TFN:` prefix) raises `ValueError` from the stock
validator (`invalid literal for int() ... 'T'`), propagating uncaught
out of the engine's analyze path; in the fork flow it surfaces as a
per-column failure entry via `classify_entity`'s try/except. This was
probe-verified through the real AnalyzerEngine (unlabeled TFNs score
1.0); no validator fix was made, per the supplement's probe
instruction. Locked by
`test_hardened_au_tfn_patterns_and_labeled_raise`.

**§19 flag-rule correction.** Supplement §7's attribution — that the
lemma-based enhancer sets the enhancement flag — was WRONG, as
probe-verified in supplement §19: the flag has exactly two writers,
the decorator-equivalent (0.3 floor, skip already-flagged) and the
UsBank override (no floor, skip already-flagged); the NHS override is
flag-neutral (suppression only, no metadata/flag/explanation touches);
the lemma enhancer only READS the flag (skipping already-flagged
results) and never sets it. §7 was corrected in place per §19.4 and
§19 is retained as the audit trail. A lemma-only-enhanced NER result
still requires corroboration: a raised score is not evidence of flag
enhancement.

**Decision-process retention on every AC-chain engine call (W5).**
`return_decision_process=True` is now passed on the sole
`AnalyzerEngine.analyze` call, in `_run_engine` (`analysis.py:275`);
both engine paths (`analyze_text` and `analyze_text_spacy_only`)
funnel through it, so the content pass, column-name pass, and second
NER pass all retain explanations. Call-site inventory: the three
`super().analyze` calls in the CreditCard/Url/Ip overrides must NOT
get the flag — `EntityRecognizer.analyze` takes no such parameter and
passing it would raise `TypeError`; no other `AnalyzerEngine`
construction or engine call exists in the package. Without retention,
the S-H4 reason pattern lines and the S-L4 metadata pattern triples
are empty in production (explanations stripped), while scores,
corroboration, and tag selection are unaffected.

**`context_matches` duplication (documented).** `analysis.py` and
`recognizers.py` each implement the §6.1 rule (`context_matches` and
`_context_matches`): the UsBank override needs the rule in
`recognizers.py`, and importing the analysis copy would be circular.
The two implementations were read in full and verified identical in
behavior (same split regex, token-set rule, whole-token and literal
multi-part branches with the same boundary guards); the only
differences are call-site-shaped (input coercion/guards). Both
docstrings cross-reference the duplication and the rationale;
`_context_matches` stays for UsBank. No code was moved between
modules.

**S-L31 mirror-fallback procedure.** Index mirrors do NOT cover the
direct-URL model wheel (models are not on PyPI; index config cannot
rewrite direct URLs). The fallback procedure, recorded here and NOT
baked into the repo: retry once; pre-download the wheel and scp it to
the server; make a temporary server-side Dockerfile edit, verify, and
restore. NEVER commit a mirror or workaround into the repo.

**S-M9/D-3 note on the deleted test.** The D-3-referenced test
`test_context_word_matches_contiguous_runs_only` was DELETED in the
merge (W6: `context_word_matches_column` was orphaned — zero
production callers after the analysis branch removed its import/call —
so the function, its import, and its test were removed as cleanup).
Its removal is cleanup, not evidence about the original
classification, which stays UNVERIFIED per D-3 above. The §6.1 rule
stays covered by the `context_matches` tests and the UsBank tests.

## Follow-up: python-dateutil declared (v3, 2026-11-14)

**Parent decision (option (a)).** The v2 OPEN PARENT DECISION recorded
in "Date emulation (bounded deviation...)" above is decided: add
`python-dateutil` to the `autoclassification` extra (pin-faithful —
the reference engine imports the dateutil parser at module level in
both Date paths), rather than keep the stdlib emulation with its
documented edges on a seeded live path. This section supersedes that
paragraph; the v1/v2 text is left untouched.

**Dependency.** `python-dateutil==2.9.0.post0`, declared in
`smartmetadata-ingestion/pyproject.toml` alongside the existing extra
pins. License evidence, read from the published wheel's METADATA
(verified 2026-11-14): `License: Dual License`, classifiers
`License :: OSI Approved :: BSD License` and
`License :: OSI Approved :: Apache Software License`, bundled LICENSE
file containing both the Apache-2.0 and BSD-3-Clause texts;
`Requires-Python: !=3.0.*,!=3.1.*,!=3.2.*,>=2.7` (covers the fork's
`>=3.10`); sole runtime requirement `six >=1.5` (installed: six
1.17.0, `License: MIT` in its METADATA). Resolution against the extra's pins verified in the
capability venv: presidio-analyzer 2.2.358, spacy 3.8.18, preshed
3.0.13 undisturbed, no conflicts. The 2.x line is pinned deliberately:
3.0.0/4.0.0 postdate the behavior the supplement specifies, and 4.0.0
requires Python >=3.11.

**Behavior change (both Date paths).** The provisioned path now calls
the real parser: the hardened Date validator runs a plain parse, and
the date-spelling patcher runs the two-default rule against
`dateutil.parser.parse` with probe defaults 1 January 1900 and 23
July 2222. The stdlib emulation survives ONLY as the not-installed
fallback, and fallback use warns loudly, once per process, naming the
missing dependency and the emulation's edges — never silent. The core
suite still runs without the extra (extra-gated skips, no import-time
crash); both modules keep conditional imports. Fallback behavior is
covered by tests in both suites (simulated absence with the extra
installed, real absence in the no-extra run).

**Verified edge outcomes (dateutil 2.9.0.post0, run 2026-11-14).** The
four former emulation edges, validator (single parse) / patcher
(two-default): `March 32` True / True (the parser reads "32" as year
2032 — the emulation matched here; the unverified edge is now
verified); `12.31` True / False (only the day agrees — the emulation
diverged); `3.14` True / False (same); `20180314` True / True (the
compact date parses — the emulation diverged); `19.99` True / False
(the validator outcome, deliberately unasserted under the emulation,
is now asserted). Two further divergences surfaced by running the
real parser: `14/03` parses under the emulation but the parser raises
(patcher False); `on March 14` is rejected by the emulation but the
parser accepts it (patcher True). The two affected assertions were
retargeted to the parser outcomes at the same strength, as intended
changes; all other 50 smoke-case outcomes agree under both
implementations.

**Dockerfiles.** No change needed: both `Dockerfile.ingest` and
`Dockerfile.airflow` install the extra (`.[...,autoclassification]`)
and neither pins the extra's contents. The airflow image build remains
the verification point for coexistence with the base image's own
dateutil (unverified until deploy, as with the model provisioning).

## Targeted re-review close-out (v4, 2026-11-14)

The targeted re-review (source-level, post-fix) returned
APPROVE-WITH-FINDINGS: no HIGH-severity divergence remains, the four
HIGH and ten MEDIUM fixes are verified, the gates re-ran green, and
clean-room holds. This section lands its merge conditions: one code
fix (N-1) and the record corrections below. The v1/v2/v3 text is left
untouched; where this section corrects it, it says so explicitly.

**N-1 content context uses the leaf name (FIXED).** The content pass
split the full dotted path for its context tokens, so a nested
column's parent segments leaked into context matching (lemma
enhancement, the UsBank override, `_enhance_match`, NHS suppression):
a parent segment's context word could boost or suppress the column's
matches. The reference engine computes context from the leaf name
only. The fix splits the exact leaf name read from the column object
in `engine.py:_classify_column` — the same derivation the column walk
uses — and is locked by
`test_nested_column_parent_segment_cannot_boost_content_match`, which
fails on the pre-fix code. Top-level columns are unaffected (dotted
path == leaf name). The `column_dotted_path` argument is otherwise
unchanged: it still feeds only the column-name pass text, the
exception-link predicate, FQN construction, and diagnostics.

**F-01 correction: the S-L6 split.** The v2 S-L6 paragraph is headed
"(RECORD)" and discusses only the connection test, and S-L6 is
omitted from the v2 "Findings closed in code" list — but the fix pass
DID add service-existence validation in code:
`AutoClassificationWorkflow.prepare` calls `_validate_service_exists`
(`workflow.py`, via `_AC_SERVICE_GETTERS`), backed by the new
`get_messaging_service_by_name` / `get_storage_service_by_name`
getters (`client/rest.py`). A bad service name now fails the run
loudly at prepare time instead of silently "succeeding". What stays
recorded (no code change) is ONLY the per-engine connection test: no
cheap reuse exists, covering 2 of 14 source types, as the v2
paragraph states. The split is: validation fixed, connection test
recorded.

**F-01 correction: the S-M2 dotted-leaf limitation.** The column-name
pass recovers the leaf name as the last dot-separated segment of the
dotted path, so a leaf name containing a literal dot is
indistinguishable in that representation: the analyzed text would be
the trailing fragment, not the full leaf name. The limitation is
inherent to the dot-joined representation the column walk and sample
mapping share, and it applies wherever the leaf is recovered from the
dotted path by last-segment split (the column-name pass text and the
exception-link construction). It is recorded here because it bounds
shipped behavior; the N-1 content path does NOT share it (the exact
leaf name comes from the column object). The exact leaf name is one
field away (`leaf.column["name"]`), so a future exact fix for the
column-name pass is small plumbing — not done in this batch.

**S-M1 residual narrowing (WITHDRAWAL).** The v2 paragraph "S-M1
application-point equivalence" claims post-analysis exclusion before
corroboration/scoring is "observably equivalent to pre-creation".
That UNQUALIFIED claim is WITHDRAWN. What stands: the predicate is
the pin exact-link rule, and the ordering equivalence holds for
scoring, corroboration, reason strings, metadata triples, and counts
— an excepted match never enters `kept` and cannot leak downstream
through any path (verified in the merged flow and by the W7 ordering
test). Two engine-time residuals are real and are recorded here:

(a) Validator raises from excepted recognizers surface in the fork
and never occur in the reference engine, which never creates the
recognizer: the excepted recognizer still runs inside
`engine.analyze`, and a validator raise (the TFN labeled case is the
proven instance; stock Presidio has no try/except on that path)
aborts the whole `analyze` call for that column, surfacing as a
per-column failure where the reference engine would classify the
column normally. Trigger scope: an excepted recognizer whose
validator raises on the column's content.

(b) Engine-internal duplicate removal can displace a kept result:
stock `remove_duplicates` drops a result contained in a
higher-scoring same-entity-type result, so if an excepted
recognizer's result displaces a kept result's span, post-analysis
exclusion removes the excepted one and both are lost; in the
reference engine the excepted recognizer never runs, so the kept
result survives. Trigger scope: two same-entity-type recognizers
with overlapping spans, one excepted — narrow in the 43-config seed,
where entity types are mostly unique per recognizer.

Neither residual justifies re-architecting to per-column pre-creation
exclusion in this batch (the fork builds analyzers once per
tag/language at warm-up); both are recorded as known divergences with
the trigger scopes above.

**F-02 correction: S-L25 grouped nits.** The v2 RECORD paragraph lists
"the stringly-typed NHS check via class name" among the standing
nits. That check was DELETED by the fix pass (zero `__name__`
comparisons remain in the package); it is not a standing nit. The
other three S-L25 nits (duplicate `_ENTITY_COLUMNS` lists, the
unbounded `CandidateStore._cache`, the `_messaging_sampler`
re-enumeration) stand as recorded.

**Recorded LOW residuals (no code change in this batch).** Each was
verified against the reference source by the targeted re-review;
each is narrow-trigger. The behavior spec supplement was corrected
alongside (pin wins) where it misstated the reference behavior
(§1.1, §1.9, §3.1 step 2, §3.3 step 6, §11); the fix-pass authors had
followed it in good faith.

- F-H1a UsLicense shapes: the reference letter-dash shape has four
  groups of 3 digits (the fork has three, missing the four-group
  shape); the fork lacks the no-separator `[A-Z]{3}\d{4}` shape; the
  reference uses `\s` in ~35 space-separated shapes where the fork
  uses literal spaces, so tab-separated values are missed; the
  pattern name is "US Driver License" versus the reference "US
  Driving License". Trigger scope: US license values in those
  shapes, tab-separated values, and §12 metadata triples (names).
- F-H1b pattern names: CreditCard uses one shared name in the
  reference versus fork brand names; Aadhaar "AADHAAR" versus
  "AADHAAR (Very Weak)"; ABN/ACN "(hyphenated)" case; ItVat name
  wording. Names surface only in §12 metadata triples.
- F-H1c Aadhaar `\d` versus `[0-9]` (Unicode digits under the
  `regex` module); ABN/ACN guard classes (the fork blocks
  tab-separated digits where the reference does not). Trigger scope:
  non-ASCII-digit input.
- F-H1d SgFin ASCII-check order: the fork checks `upper.isascii()`;
  the reference checks the original text first. Trigger scope:
  non-ASCII lookalikes that uppercase into a valid FIN
  shape+checksum. Inconsistent with the fork's own NIF/NIE
  convention, which checks the original.
- F-CCa CreditCard tabs: the reference candidate class is
  digits/spaces/dashes only; the fork adds `\t` (candidate regex,
  shape collapse, sanitization, prefix whitespace). Trigger scope:
  tab-separated card candidates.
- F-CCb CreditCard prefix-exit semantics: the reference exits the
  candidate on prefix-found regardless of results and returns
  without trying the quantity prefix when a date prefix matches but
  is an invalid date; the fork exits only when results are produced,
  falls through otherwise, and tries quantity after an invalid date
  prefix. Trigger scope: prefixed card candidates.
- F-CCc CreditCard quantity-label lookbehind: the reference guards
  the quantity label with `(?<![\w.+-])`; the fork's lacks it (e.g.
  `myqty` triggers the fork). Trigger scope: quantity labels
  adjoining word characters.
- F-URL: the fork keeps port-0 URLs; the reference drops ports
  outside 1..65535 (`urlsplit().port` does not raise for 0).
  Trigger scope: `:0` URLs.
- F-IPa Ip port check: the fork uses `isdigit` then `int()`; a
  non-decimal digit (e.g. superscript `²`) makes `int()` raise
  uncaught, surfacing as a per-column failure. The reference uses
  `isdecimal()` and drops. Trigger scope: non-decimal digit port
  tokens.
- F-IPb Ip CIDR "shortened" rule: the fork drops label-skipped
  tokens with a CIDR suffix; the reference checks only end
  movement, so such a token with a valid CIDR suffix is kept.
  Trigger scope: label-skipped tokens with CIDR suffixes.
- F-IPc Ip URI-authority check: the fork searches before the
  original token start with a broader userinfo class and no
  lookbehind; the reference checks before the label-adjusted start
  with a `(?<![\w.+-])` guard and a narrower class. Trigger scope:
  URI-authority contexts.
- F-CTX context recognizer: the fork interpolates the context word
  ungrouped, so a top-level `|` in a context word leaks
  alternation; the reference wraps the interpolation in
  non-capturing groups. Trigger scope: context words containing a
  top-level `|` — the seed ships no context recognizers, so moot on
  seed data today.
- F-FLOOR decorator floor: the fork emulates the context-enhancement
  decorator post-hoc, after the engine's lemma enhancement, so its
  0.3 floor reads the post-lemma score; the reference decorator
  runs before the lemma stage. Trigger scope: a sub-0.3 pattern
  result lemma-boosted across 0.3 with a matching context word.
- F-CM `context_matches` zero-part edge: the reference multi-part
  regex branch matches empty words; the fork skips zero-part words.
  Trigger scope: separator-only/empty context words against
  punctuation-bearing column names. Negligible.
- F-CAPS all-caps predicate: the fork gate (alphabetic char +
  `text == text.upper()` + no digits) passes cased-less alphabetic
  text (e.g. pure CJK) that the reference gate (`isupper()` + no
  digits) rejects, running a redundant second NER pass; duplicates
  collapse downstream except for an inflated reason-string match
  count. Trigger scope: cased-less alphabetic values.
  Reason-count-only.
