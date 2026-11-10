# OpenMetadata A group is 12 items, not 11; the B group stays unmodelled

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (OM payload, round-trip, redact, jwtToken edit-loss), `connectionFields.test.ts` (key order)
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A §2-4 and condition 6, `openMetadataConnection.json`

## Context

The ruling counted the OpenMetadata A group as 11 items and the B group as
17. The review corrected the split against `openMetadataConnection.json`
(34 properties, `required: [hostPort]`, denoised 28): `hostPort` belongs to
the A group, so the A group is **12** items and the B group is **16**.

## Decision

- A group (12, spec order): `clusterName`, `hostPort`, `authProvider`,
  `verifySSL`, `sslConfig`, `securityConfig` (`jwtToken`), 
  `secretsManagerProvider`, `secretsManagerLoader`, `apiVersion`,
  `enableVersionValidation`, `storeServiceConnection`, `extraHeaders`.
  `hostPort`'s placeholder is the spec example with `/api`
  (`http://localhost:8585/api`).
- B group (16, residual R-W3-3A-2): the 13 `include*` booleans,
  `limitRecords`, `forceEntityOverwriting`, `elasticsSearch`. None is
  modelled in this batch — the product has no modelling for them, and
  inventing one would violate the dual standard.
- `securityConfig` gets the nested type `{ jwtToken?: string }`; `jwtToken`
  is a password control with the mandatory edit-loss fix:
  `secretFieldValue`-style masked-previous retention, a
  `redactConnectionForDisplay` `config.securityConfig.jwtToken` branch, and
  a test proving an edit-save without retyping keeps the original masked
  value.
- `storeServiceConnection` gets its own form key,
  `omStoreServiceConnection` — it must differ from the product's
  `storeConnectionSecrets`, which gates whether a typed literal secret is
  persisted; this flag is the spec's own "whether to save the service
  connection when creating the service". The label says exactly that.
- `sslConfig` uses its own independent triplet
  (`openMetadataSSLCaCertificate` / `openMetadataSSLCertificate` /
  `openMetadataSSLKey`); `extraHeaders` is a textarea parsed by
  `parseJsonMap` (invalid JSON or non-string values throw).

## Consequences

The batch's corrected workload is **31** new denoised attributes, not the
ruling's "47 + 2 variants" — the PR description must say "31", never "47".
The B group stays a named residual (R-W3-3A-2) for Wave 4, not a silent
omission.
