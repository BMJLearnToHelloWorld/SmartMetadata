# MCP Batch A: nine read tools over the REST API (clean-room)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; I group, I-D5, I-D6)
- **Guard:** `smartmetadata-mcp/tests/batchA.test.ts`, `tests/paging.test.ts`, `tests/vector.test.ts`, `tests/aiContextMarkdown.test.ts`, `tests/personaContext.test.ts`, `tests/userContext.test.ts`, `tests/rootCause.test.ts`, `tests/rdfTools.test.ts`, `tests/server.test.ts`, `tests/config.test.ts` (targeted runs only; full gates staggered by the parent)
- **Related:** `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-MCP-A.md` (APPROVE + 18 conditions), `~/workspace/work/milestone-20261107/wave2/PLAN.md` §1 W2-4, `~/workspace/work/milestone-20261107/RULING-mcp-tools.md` (I group), `~/workspace/work/milestone-20261107/DECISIONS-RESOLVED.md` (I group)

## Context

Batch A adds nine read-only MCP tools to the TypeScript MCP server,
implemented clean-room against the REST API: only the tool names and
parameter contracts were read from the pin's `tools.json` and tool
sources; no official implementation was copied. The nine tools are
`company_context`, `semantic_search`, `get_persona_context`,
`get_user_context`, `find_context`, `get_concept_context`,
`root_cause_analysis`, `shacl_validate` and `ontology_describe`.
The Java server-side work in the same batch (K-C4 vector-service
resolution, K-6-1/6-6 metric authorization + announcement visibility)
is a separate commit on the same branch.

## Decision

1. **Shared plumbing, single-source.** The vector POST client, the
   cursor codec, the response-budget helpers and the metric attach live
   once, in `src/vector.ts`, `src/paging.ts` and `src/budget.ts`; Batch D
   reuses them. `get_user_context` calls `GET /v1/search/query`
   directly with its own `query_filter`; it does not go through D's
   `search_entities` extension.
2. **I-D5 access config is env-only.** `OM_MCP_READ_ONLY` (`true`/`1`
   = on, default off) and `OM_MCP_DISABLED_TOOLS` (comma-separated,
   default empty) are read by `loadConfig(process.env)` into
   `RuntimeConfig`, the same env-only channel the other settings use.
   Difference from the Java server, recorded here: the Java server's
   config is read at startup and a read-only flip hides write tools
   from `tools/list` only after a restart; this side applies both the
   list filtering and the per-call refusal at registration time, so a
   call is rejected from the moment the server starts in this mode.
   The two levels use the exact official wording
   ("The MCP server is in read-only mode, so <name> is unavailable" /
   "<name> is disabled on this MCP server"), read-only checked first,
   returned as an `isError: true` tool result, never silent, never a
   crash. An unknown disabled name warns only. Every spec carries
   `annotations.readOnlyHint` (9 new tools true; the 4 existing write
   tools + `create_conversation` false), and `WRITE_HELPER_TOOLS =
   {describe_entity_type}` is defined now for Batch C.
3. **Cursors are opaque and strict.** A cursor is the base64url
   encoding (no padding) of `{"t":"o","v":<offset>}` — the same wire
   shape the server-side paging contract uses — and a cursor wins over
   `from` when present. Unlike the server side, which silently falls
   back to the first page on a malformed token, this side returns a
   400-style error: a cursor the caller cannot act on is a bad
   argument, not a first page.
4. **Vector errors pass through.** A REST 503 ("Vector search is not
   enabled") becomes the tool's `isError` result verbatim, never empty
   results.
5. **Company-context FQN half (condition 8).** A pill is exposable
   iff `sourceType == FILE_EXTRACTION` and `status == APPROVED` and
   `visibility == Shared`; anything else is reported with the same
   not-found message as a missing pill
   ("No Company Context knowledge pill found for '<fqn>'") — no
   refusal reason, no existence leak. Deliberate simplification
   versus the Java side, which also reads org-wide and own pills by
   name through a caller-aware visibility check; this side applies the
   review's Shared-only rule. `query` and `fqn` together, or neither,
   is a 400-style error. The caller-supplied FQN is passed through
   `encodeURIComponent` unchanged; the Java side re-quotes it with
   `FullyQualifiedName.quoteName`, so callers must pass the FQN as
   stored.
6. **Metric attach (I-D7).** `semantic_search` and `find_context`
   metric hits carry `parent` / `childrenCount` / `metricGroup` read
   through `GET /v1/metrics/name/{fqn}` (the same path
   `get_entity_details` uses), as one bounded batch of at most 10
   metrics per call. A failed read degrades to no attach fields for
   that metric, stated in `metricHierarchyNote` — never a whole-batch
   failure, never silent missing fields. `semantic_search` slims the
   parent and group to their FQNs; `find_context` keeps the full
   reference objects.
7. **Markdown rendering.** `find_context` markdown is rendered in
   TypeScript per the official `AIContextMarkdown.renderFound`
   structure (definitions, metric, articles, candidate assets, in
   that order, with the stale cue and the excerpt hint).
   `get_concept_context` markdown is only passed through — it is
   server-rendered. Content arriving from REST is rendered verbatim
   after trimming; the server-side HTML sanitization policy
   (`PromptText.forPrompt`) is not re-implemented here.
8. **Budgets.** `maxResponseChars` default 100000; a persona part
   budgets `cap − 10000`, with part 1 further reduced by the
   serialized instructions it carries, split at line boundaries (a
   single over-long line is cut at the largest character prefix that
   fits, so paging always advances). `shacl_validate` and
   `ontology_describe` `maxBytes` default 80000, clamped to
   [1024, 80000] — the pin's `RdfBody.maxBytes()` (0.8 × the 100000
   dispatch cap); the review's 100000 was a misreading and is not
   followed. No generic response truncator this batch
   (residual R-W2M-7).
9. **RCA depth correction.** The REST `getDataQualityLineage`
   endpoint adds one to the depth it receives before calling the
   service, while the tool contract counts levels upstream of the
   root — so the REST call takes `upstreamDepth − 1` (default 3 →
   REST 2; depth 1 → REST 0 → root only). Downstream depth passes
   through unchanged. The data-quality walk already returns only
   assets with failing tests; the root is split out by FQN, never
   counted as upstream. Per failing node, the failing test cases are
   read with `GET /v1/dataQuality/testCases?testSuiteId=<id>&
   testCaseStatus=Failed&fields=testCaseResult&limit=100`, filtered
   client-side by the test case's `entityLink` FQN — the REST
   `entityFQN` parameter is deliberately not passed, because its auth
   path hardcodes TABLE `VIEW_TESTS` and would mis-authorize
   non-table roots. Difference from the server-side time-series
   filter, recorded here: the REST list filter matches on the test
   case's LATEST result status, so a test case whose latest run passed
   is not reported as failing (the "currently failing" reading); the
   server-side filter applies Failed before taking latest, which can
   surface a stale failure. `resultsTruncated` comes from
   `paging.total > data.length`; the root-only completeness note uses
   the TypeScript cap 100, not the server-side 10000.
10. **RDF tools.** `shacl_validate` builds the entity URI as
    `baseUri + "entity/" + type + "/" + id`, with `baseUri` read once
    from `GET /v1/rdf/status` and cached in-process; a failed status
    call is an explicit error, never a guessed base URI.
    `violationCount` is NOT available from the REST validate endpoint
    (conformance arrives only through the `OM-SHACL-Conforms`
    header), so it is omitted rather than counted out of the report
    text. `ontology_describe` serves the default path only
    (`scope: "full-ontology"`), which works even with RDF off; a
    `resource` DESCRIBE fails with an explicit Batch C error, and an
    illegal IRI fails with a 400-style error first. No `tools/list`
    RDF gating this batch (difference from the official list-hiding,
    recorded here).
11. **`get_user_context` warnings (condition 18(i)).** `warnings` is
    NOT a partial-failure semantic: it is populated only when
    `ownedFilter` is an unrecognized non-blank value, which falls back
    to NONE with the message
    "Unrecognized ownedFilter '<raw>'; returned all owned entities
    without gap filtering. Valid values: NONE, MISSING_DESCRIPTION,
    MISSING_TIER, ANY_GAP."
12. **Text responses need a text path.** `RestClient.request()` always
    JSON-parses the body, so `requestText` was added (returns
    `{text, headers}` so `shacl_validate` can read the
    `OM-SHACL-Conforms` header and the media type). The review's
    "no client extension needed" was wrong for the two markdown tools
    and the two RDF text tools.
13. **Not in this batch.** Batch B (`sparql_query`), Batch C
    (`entity_neighborhood`, `ontology_describe` resource,
    `describe_entity_type` + its server endpoint design), TestCase PII
    masking (I-D6 — no masking logic in the search tools, no Java
    `TestCaseSearchMasker`), the 5 product-only tools, the
    `find_by_tag` backend switch, `search_entities` / `get_lineage`
    parameter extensions (D batch), `ignorePersonaScope` (no REST
    counterpart; the `semantic_search` description states persona
    scope always applies), `tools/list` RDF gating, the generic
    response truncator.

## Consequences

- The tool catalog grows from 14 to 23 tools; all 9 new tools are
  read-only and carry `readOnlyHint: true`.
- `OM_MCP_READ_ONLY=true` hides the 5 write tools from `tools/list`
  and refuses their calls with the official wording.
- The Java call-point patch (K-6-1/6-6) and the C4 vector-service fix
  ship in the same branch as separate commits; they need a
  server-side Maven compile gate (local Java networking is blocked).
- Residuals: R-W2M-7 (generic response truncator), R-W2M-9 CLOSED
  with zero work (C3 IT increment is zero — the files live in
  `openmetadata-integration-tests/`, the ruling's "0 hits" was a grep
  path error).
