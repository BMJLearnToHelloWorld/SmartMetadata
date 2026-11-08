# Superset and Prefect verifySSL / sslConfig are always visible, with no showWhen linkage

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `connectionFields.test.ts` (Superset/Prefect key order), `connections.test.ts`
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` condition 7, `RULING-lean-forms.md` §4.8

## Context

`supersetApiConnection.json` and `prefectConnection.json` declare
`verifySSL` (enum `no-ssl` / `ignore` / `validate`, default `no-ssl`) and
`sslConfig` (`validateSSLClientConfig`, three PEM leaves) as plain
properties. Neither spec states any linkage between them — that
certificates only matter when `verifySSL = validate` is common-sense
inference, not a spec rule. The tier 1 pattern gates sslConfig leaves on
`sslMode`, but no `sslMode` exists in either tier 2 type, so there is
nothing to gate on.

## Decision

- `verifySSL` is a select (`no-ssl` / `ignore` / `validate`, default
  `no-ssl`); `sslConfig` is three textarea leaves. Both are always
  visible in the Superset and Prefect forms — no `showWhen` in either
  direction.
- Superset's pair lives nested in `connection` (the oneOf API variant);
  Prefect's pair lives top level. The two types share the `verifySSL`
  form key; their sslConfig leaves use independent triplets
  (`supersetSSL*` vs the single-group keys).
- The builder emits `verifySSL` when set and the sslConfig group when at
  least one leaf survives the secret discipline; `formValuesFromService`
  falls back to `no-ssl` when the stored config omits `verifySSL`.

## Consequences

The form never hides a field the spec provides, and never invents a
visibility rule the spec does not state. If a future spec version adds
an explicit linkage, it is implemented then — not inferred now.
