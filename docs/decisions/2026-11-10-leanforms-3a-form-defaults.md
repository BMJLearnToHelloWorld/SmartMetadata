# lean-forms tier 3A spec defaults are prefilled in createEmptyServiceForm

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Bai
- **Guard:** `connections.test.ts` (empty-form defaults), `connectionFields.test.ts`
- **Related:** Wave 3 REVIEW-W3-LEANFORMS-3A condition 2, `RULING-lean-forms.md` §4.8, #146 Q5, ADR:2026-11-08-leanforms-tier2-form-defaults

## Context

The tier 3A specs carry defaults that the form must show, not silently omit
(the tier 1/2 precedent prefills them in `createEmptyServiceForm`, with
matching read-side defaults in `formValuesFromService`): OpenMetadata
`clusterName` `openmetadata`, `authProvider` `basic`, `secretsManagerProvider`
`db`, `secretsManagerLoader` `noop`, `apiVersion` `v1`,
`enableVersionValidation` `true`, `storeServiceConnection` `true`;
GoogleDrive `includeTeamDrives` `true`, `includeGoogleSheets` `false`;
Mcp `discoveryMethod` `ConfigFile`, `initializationTimeout` `60`,
`fetchTools`/`fetchResources`/`fetchPrompts` `true`; OpenAI `timeout` `60`,
`maxRetries` `3`; ElasticSearch `connectionTimeoutSecs` `30`,
`stagingDir` `/tmp/openmetadata-certs`.

## Decision

- `createEmptyServiceForm` prefills the values above; `formValuesFromService`
  falls back to the same values when a stored config omits the field. The
  builders emit each when set.
- Two spec defaults are NOT prefilled, and the omission is deliberate:
  - OpenAI `baseURL` (`https://api.openai.com/v1`) and OpenMetadata
    `hostPort` (`http://localhost:8585/api`) — the builder emits them only
    when the user types a value, so an empty form sends neither and the
    server applies its own default. The defaults stay visible: `baseUrl`
    keeps the spec URL as its placeholder, and the OpenMetadata group's
    `hostPort` placeholder is the spec example **with** `/api`
    (`http://localhost:8585/api` — the previous `http://localhost:8585`
    lacked it). `hostPort` could not be prefilled anyway: the form key is
    shared across types.
  - Mcp `connectionTimeout` (`30`) — the form key is shared with Databricks,
    whose spec default is `120`. Prefilling `30` would silently override a
    Databricks create's server default. The Mcp default applies on the read
    side (`formValuesFromService` defaults to `30` for Mcp services only)
    and via the server default on create (omitted means `30`). This is a
    deliberate deviation from the review's condition 2 prefill list, for
    the reason above; the review's intent (effective default `30`) is
    preserved.

## Consequences

A fresh 3A form sends the spec defaults above; a fresh Mcp create omits
`connectionTimeout` and relies on the server default `30`. A Databricks
create is unaffected by the Mcp default. Revisit if a spec default changes
upstream, or if the wizard gains per-type create-empty defaults (then the
Mcp `connectionTimeout` prefill can move there).

Acceptance note (review condition 16, residual R-W3-3A-4): tier 2 live
verification is still owed (7 types, no passing record) — 3A acceptance
must NOT rest on unit tests alone. Without real services, record "未验"
per type, never "通过".
