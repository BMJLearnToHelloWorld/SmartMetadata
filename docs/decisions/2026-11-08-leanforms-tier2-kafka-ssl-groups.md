# Every sslConfig group gets its own independent form-key triplet, builder call, and redact branch

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (Kafka two-group non-interference + redact), `connectionFields.test.ts` (key order)
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` conditions 4, 5, and 7, `RULING-lean-forms.md` §4.8

## Context

Four sslConfig groups coexist in tier 2, all with the same
`validateSSLClientConfig` shape (caCertificate, sslCertificate, sslKey):
Kafka's `consumerConfigSSL` and `schemaRegistrySSL`, Superset's nested
`connection.sslConfig`, and Prefect's top-level `sslConfig`. The tier 1
helper `sslConfigFromForm` reads a single fixed key triplet
(`sslCaCertificate` / `sslCertificate` / `sslKey`). Reusing that triplet
for a second group in the same form would write one group's PEM into the
other; reusing the `config.sslConfig` redact branch would leave the other
groups' PEMs in plain text on the detail page.

## Decision

- Form keys are per group, never shared: `consumerConfigSSL*`,
  `schemaRegistrySSL*`, `supersetSSL*`, and the existing single-group keys
  for Prefect (which has only one sslConfig). `verifySSL` is the one shared
  key — it is a single enum value, not a group.
- `sslConfigFromForm` is reimplemented on a parametrized variant
  (`sslConfigFromFormKeys`: key triplet + previously stored group object);
  Kafka calls it twice, Superset and Prefect once each. The form table
  mirrors this with `sslConfigLeavesFor` (key/label/testId triplets) and
  the single-group `sslConfigLeaves` delegating to it.
- `redactConnectionForDisplay` masks all four groups: `config.sslConfig`,
  `config.consumerConfigSSL`, `config.schemaRegistrySSL`, and
  `config.connection.sslConfig`, over the shared `SSL_CONFIG_LEAF_KEYS`.
- `ServiceConnectionConfig` gains explicit `consumerConfigSSL?`,
  `schemaRegistrySSL?`, `sslConfig?`, and `connection.sslConfig?` fields
  of the shared `SslClientConfig` shape.

## Consequences

Filling different certificates into Kafka's two groups saves each into
its own object, and no PEM ever renders in plain text. Any future second
sslConfig group in one form must add its own triplet; reusing the
single-group keys for it is a regression this record forbids.
