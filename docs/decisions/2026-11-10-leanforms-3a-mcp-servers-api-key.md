# Mcp servers are textarea JSON with apiKey restore-by-name

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (Mcp payload, round-trip, redact, edit-loss, invalid-JSON), `connectionFields.test.ts` (key order, no showWhen)
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A condition 10, `mcpConnection.json`, `mcpServerConfig`

## Context

`mcpConnection.json` defines `servers` as an array of `mcpServerConfig`
objects (`required: [name]`; `url` for SSE/StreamableHTTP transport;
`apiKey` format password, "API key for authenticated MCP servers"). The
product has no structured server editor: the field is a textarea holding a
JSON array. Each item's `apiKey` is a secret that must survive edit-save
without ever rendering in plaintext, and the array needs strict parsing —
invalid JSON or a non-object element must throw instead of sending a
schema-invalid config.

## Decision

- `servers` is parsed by `parseJsonArray` (new, next to `parseJsonObject`):
  invalid JSON throws, a non-array throws, a non-object element throws.
  `configFilePaths` uses the same helper with a string-element check.
  `servers` is typed `Array<Record<string, unknown>>` in
  `ServiceConnectionConfig` — a loose object type, because the field is
  free-form textarea JSON, not structured form fields.
- Edit refill stringifies `config.servers` with each item's `apiKey`
  replaced by the mask (`maskServerApiKeys`, shared with redact). Redact
  walks `config.servers` and masks each `apiKey`; the detail page never
  shows a stored server apiKey in plaintext.
- Retention is restore-by-name: a masked or blank apiKey restores the
  previous value matched by server `name`; a fresh literal follows the
  secret discipline. A masked apiKey with no name match — e.g. the server
  was renamed — is omitted from that entry: never store the literal mask,
  and never claim retention after a rename. Tested for keep (two servers),
  rename, and retype.
- Blank means keep, matching password fields: there is no clear-apiKey
  affordance — a server pasted without an apiKey keeps the previous key
  for that name.
- No showWhen linkage between `discoveryMethod` and
  `configFilePaths`/`servers`/`registryUrl`: the spec defines none, so all
  three stay visible and the hints say which `discoveryMethod` each
  applies to. No fields for the deprecated stdio leaves (`command`/`args`/
  `env` — the spec marks them "Deprecated: Stdio transport has been
  removed"). `connectionTimeout` lost its `min: 1` (§2-11); the number
  fields carry no self-set min/max.

## Consequences

The Mcp `servers` textarea round-trips losslessly, including per-server
apiKeys, except across a server rename — that boundary is documented here
and tested, not silently papered over. `parseJsonArray` and the
restore-by-name mechanism are reusable for the 3B textarea-JSON arrays;
the 3B reuse list (Sftp/Alation/OpenSearch `authType` oneOf branches,
SageMaker/Bedrock `awsConfig` nesting, VertexAI two types' `credentials`
shape) must not re-decide them.
