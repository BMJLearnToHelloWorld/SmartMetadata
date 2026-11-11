# Kafka, Redpanda and Prefect forms carry the persist-secrets checkbox

- **Status:** Superseded by ADR:2026-11-11-leanforms-save-secrets-as-entered
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `connectionFields.test.ts` (tier 2 field sets in spec order)
- **Related:** Wave 2 W2-5, `wave2/REVIEW-W2-LEANFORMS-T2.md` (follow-up found during implementation)

## Context

The product's connection forms persist typed secret literals only when the
form carries `storeConnectionSecrets: true` (`secretFieldValue` drops a
literal when the flag is off; only `${ENV}` placeholders and masked old
values pass through). The checkbox comes from the `storeSecretsField` entry
in each type's field group, and ~20 groups already have it. Kafka,
Redpanda and Prefect did not: Kafka gains secret fields in this batch
(`saslPassword`, `basicAuthUserInfo`, 6 SSL leaves), Redpanda gains
`saslPassword` / `basicAuthUserInfo`, Prefect already had `apiKey` /
`authString` / 3 SSL leaves. Without the checkbox, none of those literals
could ever be saved through the UI, so the batch's new secret fields would
fail the usability bar (writes must truly succeed).

The official UI at the pin has no persist-secrets checkbox at all (zero
hits for `storeSecrets` / `storeConnectionSecrets` in the pin UI): official
forms send secrets as entered. The product's checkbox is the existing
product-side pattern for the same server field, not an official feature
being invented — extending it to three more groups keeps the new secret
fields savable without changing the server contract.

## Decision

- Add `storeSecretsField` to the Kafka, Redpanda and Prefect field groups,
  placed after the last real field and before the trailing note (the same
  position as the other groups, e.g. S3).
- The checkbox is form-only: `storeConnectionSecrets` is not part of the
  connection payload (the full-payload key-set assertions are unchanged).

## Consequences

A user who checks the box can save typed secrets for these three types;
unchecked, literals are still dropped, exactly as in the other groups.
No spec, builder or server change is involved.
