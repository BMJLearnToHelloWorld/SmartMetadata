# MCP Batch B: sparql_query over the REST API (clean-room)

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; I group, I-D5, I-D9)
- **Guard:** `smartmetadata-mcp/tests/sparql.test.ts` (new), `tests/tools.test.ts`, `tests/server.test.ts` (targeted runs only; full gates staggered by the parent)
- **Related:** `~/workspace/work/milestone-20261107/wave3/REVIEW-W3-MCP-BC.md` (APPROVE + 16 conditions), `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-MCP-A.md`, `docs/decisions/2026-11-08-mcp-batch-a-read-tools.md`

## Context

Batch B adds the single remaining TypeScript-side tool, `sparql_query`,
implemented clean-room against the REST API: only the tool name and
parameter contract were read from the pin's `tools.json` and
`SparqlQueryTool.java`; no official implementation was copied. The
catalog grows from 23 to 24 tools. Batch C (`entity_neighborhood`,
`describe_entity_type`, the `ontology_describe` resource path) is
explicitly out: its REST endpoints do not exist, no Java server code
is written here, and no TS stub is invented for it — the resource path
keeps Batch A's explicit "Batch C" error.

## Decision

1. **Two REST paths, split by a fresh admin check.** Every
   `sparql_query` call first GETs `/v1/users/loggedInUser` and branches
   on `isAdmin` (DECISIONS-RESOLVED I-D9 (a)). Administrators POST the
   full `SparqlQuery` (`{query, format, inference}` — note the REST
   field is `inference`, not `inferenceLevel`) to `/v1/rdf/sparql`;
   everyone else POSTs only `{query}` to `/v1/rdf/sparql/agent`,
   which runs SELECT-only JSON under the server's own row cap, and the
   agent response's `metadata.completeness` (status + reason only) is
   passed through. `POST /v1/rdf/sparql/update` is never called.
2. **The admin check is never cached.** `fetchLoggedInUser` is a
   shared helper in `src/userContext.ts` (single source; `get_user_context`
   now uses it too — same single GET, no behavior change), and every
   caller issues a fresh GET per call. Caching admin identity across
   calls would branch wrong after a privilege change and misattribute
   the audit.
3. **Non-admin option checks use the pin's wording, before any agent
   call.** A non-admin asking for `format` other than `json` gets
   `"'format' must be 'json' unless you are an administrator; got
   '<raw>'"`, and `inferenceLevel` other than `none` gets the same
   shape with `'inferenceLevel' must be 'none' ...`. Unset values
   count as the defaults (`json`/`none`), never as a refusal, and the
   comparison is case-insensitive. On the review's condition 6 audit
   point: the pin records the refusal inside
   `AgentSparqlAudit.record`; TS has no audit-write API, so the
   explicit `isError` tool result carrying the pin's exact wording IS
   the TS-equivalent record — the refusal is surfaced to the caller,
   never silent. No server audit event is emitted for pre-call option
   refusals; that is a known, recorded difference, not a silent drop.
4. **Admin format and warning come from the response, not the
   request.** The reported `format` is resolved from the response
   `Content-Type` (`application/sparql-results+json` → `json`,
   `text/tab-separated-values` → `tsv`, and so on), falling back to
   the requested format when the media type is unknown. `warning` is
   the `X-OpenMetadata-Inference-Warning` response header, present
   only when the server sends it (admin path only).
5. **`queryType` is derived only where the response can tell it.**
   JSON results (`results` → SELECT, `boolean` → ASK), XML result
   documents (`<results` / `<boolean`), and CSV/TSV (a lone
   `true`/`false` row → ASK, anything else → SELECT). Graph results
   (turtle/jsonld/ntriples/rdfxml) carry no marker — a CONSTRUCT and
   a DESCRIBE serialize identically — so `queryType` is omitted
   rather than guessed. TS does no SPARQL parsing; closing this needs
   a server-side query-type signal (R-W3M-3).
6. **Byte budget follows the Batch A rule, in shared code.** `maxBytes`
   defaults to 80000 and clamps to [1024, 80000] via the shared
   `clampRdfMaxBytes`; bodies are cut with the shared `boundBody`
   (UTF-8 boundary, `byteCount` is the original length). The
   non-admin `completeness` is extracted from the parsed agent
   response BEFORE the raw text is bounded — pin's reason for putting
   it at the end of the JSON ("a bounded body cuts first").
7. **The pin description is the contract, transcribed verbatim.**
   The registered spec description is pin `tools.json`'s
   `sparql_query` description word for word (PAGING guidance: ORDER
   BY a stable key + LIMIT 250 + OFFSET stepping, `truncated` →
   lower LIMIT and repeat OFFSET, `completeness.status=TRUNCATED` →
   add an explicit LIMIT; VOCABULARY guidance: `om:` prefix,
   `https://open-metadata.org/entity/{type}/{uuid}`,
   `om:fromColumn`/`om:toColumn` column lineage), and the contract
   test asserts equality against `tools.json` on disk. `format` and
   `inferenceLevel` stay plain strings in the zod schema on purpose:
   pin types them as strings, and the handler must see every value
   to refuse a non-admin's non-json format with the pin's wording —
   a zod enum would reject it first with a zod message instead.
8. **Condition 16① verified before implementation.** The REST admin
   path `querySparqlPost` → `executeSparqlQuery` →
   `SPARQL_EXECUTION_GUARD.execute(principal, () ->
   sparqlService().query(...))` uses `new RdfSparqlService(repository,
   getFederationGuard())` — the same service + `SparqlFederationGuard`
   as pin's admin tool path — and `RdfSparqlService.query(String)`
   rejects non-SELECT/ASK/DESCRIBE/CONSTRUCT via `parseReadOnlyQuery`
   ("Only read-only SPARQL queries are accepted"), so UPDATE rejection
   is present on the REST path. Equivalent to pin's admin tool path;
   no server-side gap to record.
9. **Batch A carried gaps ①② closed in this batch.** `tools.json`
   now carries the two metric-family sentences pin has
   (`semantic_search`: `parent`/`childrenCount`/`metricGroup` +
   the `parentId` clarification; `find_context`: `parent`/
   `childrenCount`) — both descriptions verified byte-identical to
   pin. `.env.example` and `README.md` now document
   `OM_MCP_READ_ONLY` (`true`/`1` = on, default off) and
   `OM_MCP_DISABLED_TOOLS` (comma-separated, default empty, unknown
   names warn only), both read at startup — restart to change.
   Carried gap ③ (Batch A live re-verification) is NOT closed here:
   it needs a data-bearing environment and belongs to live
   acceptance (R-W3M-1).
10. **I-D5 covers the new tool.** `sparql_query` is `readOnlyHint:
    true` and in `TOOL_READ_ONLY`; disabling it by name hides it from
    the list and refuses its calls with the Batch A wording (covered
    by a dedicated test, including the call-time refusal after the
    access flips). Defaults unchanged (read-only off, disabledTools
    empty). RDF fail-closed is unchanged: a server 503 passes through
    as an `isError` result, never an empty result; no `tools/list`
    RDF gating and no startup RDF status fetch were added.
11. **Not in this batch.** Batch C tools and their server endpoints
    (`entity_neighborhood`, `describe_entity_type` + creationSpec
    alignment with `create_entity`, the `ontology_describe` resource
    path, `violationCount` response header), the D-batch
    `search_entities`/`get_lineage` parameter extensions, the generic
    response truncator, `tools/list` RDF gating, any new dependency.

## Consequences

- The tool catalog grows from 23 to 24 tools; `sparql_query` is
  read-only.
- A non-admin can only run SELECT as JSON with no inference; an
  admin gets the full pin surface (ASK/DESCRIBE/CONSTRUCT, all eight
  formats, all four inference levels) subject to the server's own
  enforcement.
- Residuals: R-W3M-1 (Batch A live verification — carried, live
  acceptance must re-verify the 9 Batch A tools alongside this one);
  R-W3M-3 (NEW: no `queryType` for graph results — needs a
  server-side query-type signal, a Batch C server decision).
