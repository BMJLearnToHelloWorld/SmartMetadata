# GoogleDrive credentials must take the gcpConfig wrapper (J-Q3 verdict: (b))

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (GoogleDrive payload, round-trip, redact, edit-loss, invalid-JSON), `connectionFields.test.ts` (key order, oneOf gates)
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A condition 7, `gcpCredentials.json`, `googleDriveConnection.json`

## Context

The ruling assumed the old bare passthrough — the service-account JSON
pasted as-is into `credentials` — was acceptable. The review required
verification of the `credentials` morphology (J-Q3) before touching emit.

## Verification (method + conclusion)

Checked against pin `a3012259ca` (via git objects) and main:

1. Schema: `gcpCredentials.json` has `required: ['gcpConfig']` and
   `additionalProperties: false` — a bare service-account JSON
   (`{type: 'service_account', private_key: ...}`) is schema-invalid: no
   `gcpConfig`, extra properties.
2. Python ingestion: `set_google_credentials`
   (`ingestion/src/metadata/utils/credentials.py`) dispatches on
   `gcpConfig` type (GcpCredentialsPath / GcpCredentialsValues /
   GcpExternalAccount / GcpADC); `gcpConfig=None` (bare JSON) matches none
   and raises `InvalidGcpConfigException`. Any ingestion / test-connection
   run with a bare-JSON GoogleDrive service fails.
3. Official workflow example
   (`ingestion/src/metadata/examples/workflows/googledrive.yaml`): the
   canonical shape is
   `credentials: { gcpConfig: { type: service_account, projectId,
   privateKeyId, privateKey, clientEmail, ... } }`.
4. Official UI: schema-driven FormBuilderV1 with oneOf handling renders
   the `gcpConfig` selector — it sends the wrapper, not bare JSON.
5. Server: no strict JSON-schema validation of connections at creation
   was found, so creation with bare JSON likely succeeds silently and only
   fails at ingestion time — a silent broken-service trap, which is why the
   frontend must emit the wrapper.
6. The product ingestion drive path is byte-identical to pin
   (`ingestion/source/drive/googledrive/connection.py`,
   `utils/credentials.py`).

Conclusion: **(b) — the `gcpConfig` wrapper is REQUIRED**; the current bare
passthrough is broken.

## Decision

- The form has a `gcpConfigType` select (`gcpValues` /
  `gcpCredentialsPath` / `gcpExternalAccount` / `gcpADC`, default
  `gcpValues`) plus per-branch inputs: `credentialsJson` textarea (values
  branch), `gcpCredentialsPath` text (path branch),
  `gcpExternalAccountJson` textarea (external branch); ADC needs no input.
  Branch identification is by `gcpConfig.type`, a const in all four
  branches (`service_account` / `gcp_credential_path` /
  `external_account` / `gcp_adc`). `gcpImpersonateServiceAccount`
  (`{impersonateServiceAccount, lifetime}`, default `3600`) is emitted
  when an email is set.
- The builder ALWAYS emits wrapped credentials:
  `credentials: { gcpConfig, gcpImpersonateServiceAccount? }`. A blank
  branch input preserves the stored credentials (blank means "keep what
  you have", never "delete the credentials").
- Refill: the branch selector, the path, and the impersonate fields
  refill; the credential JSON textareas refill EMPTY (secret discipline —
  the builder preserves the stored credentials when blank).
- Legacy bare credentials (no `gcpConfig`) infer the `gcpValues` branch
  and are re-wrapped on edit-save — a content-preserving normalization,
  not a drop.
- A stored `projectId` on the path/ADC branches is preserved opaquely
  (no form field — it is optional per spec, and the renderer has no
  multi-value showWhen for a shared field).
- `redactConnectionForDisplay` masks the whole `credentials` object with
  `'********'` — never just the `private_key` leaf. The old code had no
  `credentials` branch, so the service-account JSON rendered in plaintext
  on the detail page (live defect, fixed in this batch).

## Consequences

- New GoogleDrive services are schema-valid and ingestable.
- Residual R-W3-3A-7: GoogleDrive services created before 3A with bare
  credentials are schema-invalid and fail at ingestion; any edit-save
  re-wraps them (content-preserving), so they are fixed the next time the
  service is saved — no manual re-entry is needed, but the service stays
  broken until then.
