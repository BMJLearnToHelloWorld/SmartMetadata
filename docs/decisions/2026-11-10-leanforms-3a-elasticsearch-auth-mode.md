# ElasticSearch auth is a mode select, and a stored apiKey survives edit-save

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (ES payload, round-trip, redact, edit-loss)
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A condition 8, `elasticSearchConnection.json`, `common/sslConfig.json`

## Context

`elasticSearchConnection.json` defines `authType` as a oneOf
(`basicAuth` / `apiAuth`). The old builder lumped ElasticSearch and Ranger
into one branch: a typed apiKey replaced the whole `authType` (dropping a
typed username/password), and a blank apiKey on edit never read the stored
value — an existing ES apiKey was silently lost on every edit-save (live
defect, review §2-13). The old builder also never modelled the `sslConfig`
`certificates` oneOf (`sslCertPaths` / `sslCertValues`).

## Decision

- The form carries `elasticSearchAuthMode` (`basicAuth` / `apiAuth`, default
  `basicAuth`); the builder emits only the selected branch. A missing mode
  (raw forms) infers from the form / stored values: a typed or stored
  `apiKey` means `apiAuth`, anything else is `basicAuth`.
- basicAuth emits `username` + `password` (existing masked-password
  retention). apiAuth emits `apiKey` + `apiKeyId`. `apiKeyId` is an
  identifier, not a secret: it refills in plaintext and is never masked.
- `apiKey` edit retention is mandatory: a blank or masked apiKey restores
  `existing.config.authType.apiKey` when it is masked; a masked value with
  no stored key is omitted, never stored as the literal mask; a fresh
  literal follows the secret discipline. Tested for keep, retype, and
  basicAuth retention.
- The ES/Ranger shared builder is split. Ranger is basicAuth only and its
  behaviour is unchanged (the A9 test still passes).
- `sslConfig` gets its own explicit type: `ElasticSearchSslConfig`
  (`certificates?: EsSslCertPaths | EsSslCertValues`), distinct from the
  3-leaf `SslClientConfig` — the leaves are path/value pairs, not PEM
  contents. `sslCertMode` (`paths` / `values`, default `paths`) selects the
  branch; only the selected branch's leaves are emitted, so stale values in
  the hidden branch never leak into the other oneOf arm. The value leaves
  follow the secret discipline (masked previous preserved, redact masks
  them); the path leaves stay visible in redact — they are not secrets.
- `connectionTimeoutSecs` defaults to `30` with no self-set min/max;
  `connectionArguments` is a textarea parsed by `parseJsonMap`.

## Consequences

An existing ES apiKey is no longer lost on edit-save, and the emitted
`authType` always matches the selected branch. The `sslConfig` widening
(`SslClientConfig | ElasticSearchSslConfig`) is contained: no consumer
outside `ingestion/` reads `sslConfig`, and the 3-leaf helpers narrow with
`asSslClientConfig` instead of casts. Revisit if upstream adds a third
`authType` branch — it needs a new mode value, not a builder special case.
