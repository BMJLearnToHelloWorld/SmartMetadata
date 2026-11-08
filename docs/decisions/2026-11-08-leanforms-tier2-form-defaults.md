# lean-forms tier 2 form defaults follow the spec values, prefilled in createEmptyServiceForm

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (empty-form defaults), `connectionFields.test.ts`
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` condition 2, `RULING-lean-forms.md` §4.8, #146 Q5

## Context

The tier 2 specs carry defaults that the form must show, not silently omit:
`saslMechanism` defaults to `PLAIN` (`saslMechanismType.json`), `verifySSL`
defaults to `no-ssl` (`verifySSLConfig.json#/definitions/verifySSL`),
`schemaRegistryTopicSuffixName` defaults to `"-value"`
(`kafkaConnection.json`, `redpandaConnection.json`). The tier 1 precedent
prefills such spec defaults in `createEmptyServiceForm` (alongside
`provider: 'db'`), and the builder emits them when set.

## Decision

- `createEmptyServiceForm` prefills `saslMechanism: 'PLAIN'`,
  `verifySSL: 'no-ssl'`, `schemaRegistryTopicSuffixName: '-value'`; the
  builders emit each when present. `formValuesFromService` falls back to the
  same three values when a stored config omits the field.
- `securityProtocol` is NOT prefilled: the form default stays `''`, the
  builder omits it, and the server defaults to `PLAINTEXT`. Unifying it
  with the prefilled defaults would change what an empty form sends.
- `numberOfStatus` (10) and `dagsterTimeout` (1000) already have read-side
  defaults; they are not touched.

## Consequences

A fresh Kafka/Redpanda form sends `saslMechanism: 'PLAIN'` and
`schemaRegistryTopicSuffixName: '-value'`; a fresh Superset/Prefect form
sends `verifySSL: 'no-ssl'`. These are spec values, not product inventions,
so a server that applies its own defaults sees the same effective config.
Revisit if a spec default changes upstream.
