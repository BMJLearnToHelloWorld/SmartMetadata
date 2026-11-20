# The typed SSO secret maps onto the candidate's oidcConfiguration.secret, and the save op fires only when the stored document can accept it

- **Status:** Superseded by ADR:2026-11-20-sso-candidate-secret-mapping-superseded
- **Revisions:** v1 2026-11-18 (initial) · v2 2026-11-20 (superseded by ADR:2026-11-20-sso-candidate-secret-mapping-superseded)
- **Deciders:** Settings A-group design (DESIGN.md §8.2, Q1 ruling (a) revised 2026-11-18) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/admin/ssoConfiguration.test.ts` (carriesOidcSecret, storedAcceptsOidcSecret, candidate secret matrix, managed pin-back); `smartmetadata-ui/src/views/admin/SsoSettingsView.test.ts` (secret op emission, six-condition negatives, save guard, clear-to-save)
- **Related:** upstream pin `a3012259ca`; design `~/workspace/work/settings-agroup-batch/DESIGN.md` (not in-repo, sole authority for this batch); ADR:2026-11-18-sso-candidate-preserves-full-security-document; ADR:2026-11-18-sso-test-login-pass-binds-to-candidate-content

## Context

The SSO form holds a flat `clientSecret`, but the schema has no root-level
`clientSecret` field: `authenticationConfiguration.json` closes the object
(`additionalProperties: false`) and carries the secret only inside the
`oidcConfiguration` block, and the server's secret restore only recognizes
`oidcConfiguration.secret`. The save op this page used to send,
`/authenticationConfiguration/clientSecret`, wrote a field the server never
reads, so a typed secret never reached the stored block.

Server verification (Q1) showed the leaf op to the nested path is only
accepted under two stored conditions: the patch filter drops every op
mentioning `oidcConfiguration` unless the *stored* provider is OIDC
(`SystemRepository.filterInvalidPatchOperations`, pin
`SystemRepository.java:1892-1965`), and JSON Patch application creates no
intermediate objects, so a leaf `add` into a missing block throws and the
save fails with a 500 (`JsonUtils.applyPatch`, pin `JsonUtils.java:334-399`;
the generic catch in `patchSecurityConfig`, pin `SystemResource.java:1351-1353`).
Sending the op unconditionally would therefore either silently drop the
secret or fail the whole save, depending on the stored configuration.

The candidate and the save need different rules. Validate and Test Login
must see the intended configuration — the typed secret included — or the
gate proves something other than what the admin meant. The save can only
carry what the server accepts. Where the two diverge, the save must refuse
visibly rather than store the old secret under a proof made with the new
one. This record is the re-ruling that
ADR:2026-11-18-sso-candidate-preserves-full-security-document required
before the inert secret mapping point (`applyEnteredSecret`) could be
activated.

## Decision

- The typed secret maps to `oidcConfiguration.secret` in the candidate.
  An empty secret leaves the candidate untouched, so the stored value
  rides along. A non-empty secret lands only when the effective provider
  is OIDC and the effective client type is `confidential`; otherwise the
  stored block is left exactly as loaded.
- When the stored document has no `oidcConfiguration` block and the
  secret carries, the builder creates a block holding only the `secret`
  key — never synthesized siblings. When a block exists, only its
  `secret` key is written and every other key is preserved. This matches
  the pin's form/cleanup shape, which shows the `oidcConfiguration`
  section only to confidential clients
  (`useSsoConfiguration.ts:599-623`) and deletes the block for public
  clients while keeping it otherwise (`SSOUtils.ts:488-500`).
- The effective side is judged by one shared pure function,
  `carriesOidcSecret(provider, clientType)`, used by both the candidate
  builder and the save side, so the two can never disagree about what
  carries. It judges only the provider/clientType dimensions; an empty
  secret and a managed secret stay the call sites' to handle.
- The stored side is judged by `storedAcceptsOidcSecret(rawDocument)`,
  evaluated only on the save side, never by the candidate builder. Its
  provider test mirrors the server's positive definition in
  `SystemRepository.isOidcProvider` (pin `SystemRepository.java:1967-1976`):
  the lowercased provider contains `oidc`, or equals `google`, `azure`,
  `okta`, `auth0`, `aws-cognito`, or `custom-oidc`. It deliberately does
  not reuse the UI's reverse exclusion table: an unknown stored value
  must fail closed here, because the server filter judges by the stored
  provider. The block test requires an existing, non-null
  `oidcConfiguration` object for the leaf op to land in.
- The save op moves to `/authenticationConfiguration/oidcConfiguration/secret`
  (`add`, which replaces an existing member per RFC 6902) and fires only
  when all six conditions hold: effective provider OIDC, effective client
  type confidential, secret non-empty, secret not managed, stored
  provider OIDC, stored document carries a block. Otherwise no secret op
  is sent.
- Both managed checks move to the leaf key `oidcConfiguration/secret`
  (the save gate and the secret input's `:disabled`), matching the leaf
  pointers the deployment template hands down
  (`DeploymentTemplate.parse`, pin `DeploymentTemplate.java:75-91`). A
  managed secret is pinned back to its stored value by the builder's
  existing managed step, which runs after the secret mapping.
- The save guard: when the form secret is non-empty, the effective
  provider is OIDC, the effective client type is confidential, and either
  stored condition fails, `save()` sends no PATCH and reports
  `message.error(t('sso.secretSaveBlocked'))` before any op is built.
  Clearing the secret lets the other changes save. The guard reuses the
  two predicates and writes no condition of its own.

The guard has no pin counterpart, and that is declared rather than
disguised: the pin's structure makes the guarded state unreachable, in
three ways. First, the provider field is always hidden in the pin's
existing-configuration form (`useSsoConfiguration.ts:580-584`), and the
client type is hidden there too (`:587-598`), so a PATCH save's provider
always equals the stored provider the filter keys on. Second, changing
provider resets through a PUT: the Change provider button
(`SSOConfigurationForm.tsx:449-454`) clears the saved data and builds a
fresh form state (`useSsoConfiguration.ts:280-281`), and the save
dispatches to the full-document PUT (`:831-841`), which never passes the
PATCH filter. Third, the pin's form state holds the whole document, so an
added block travels as a whole-block `add` whose parent already exists.
(The one hook path that selects a provider without clearing saved data,
`handleProviderSelect` at `:1118-1130`, renders only when no
`onChangeProvider` handler is passed, and the production renderer always
passes one, so it is unreachable in production.) The guard exists only
for this product's PATCH-plus-flat-form architecture, its wording is
newly written with no pin source text, and it is removed by the S23 batch
when the PUT save lands.

The residual cases — a stored non-OIDC configuration, or a stored
configuration with no block — cannot carry a secret over PATCH at all:
the flat form holds none of the block's required fields
(`id`/`discoveryUri`/`tenant`, `oidcClientConfig.json:108`), so no
well-formed block can be expressed. They are reported upstream as design
item A4 and resolve with the S23 PUT save and the S12–S22 field groups,
which is also when the guard loses its purpose and is removed.

## Consequences

In every case the server accepts, the tested candidate and the stored
configuration agree: a fresh secret travels through the restore logic
untouched (`TestLoginCandidates.restoreOidcSecret`, pin
`TestLoginCandidates.java:128-139`, restores only masked or missing
values), so the op genuinely rewrites the stored secret. In the residual
cases, a typed secret is refused visibly instead of mis-stored, and an
untyped save stays consistent with the candidate — under a stale block
both sides hold the same restored old secret, and with no usable secret
the server fails the save visibly at validation
(`validateOidcConfiguration`, pin `SystemRepository.java:2173-2203`) —
so no save succeeds holding something other than what was tested.

No write path may send a root-level `clientSecret` op again, and any new
write path must reuse the two predicates and the single candidate
builder rather than restating the conditions. If the server's
`isOidcProvider` definition changes, `storedAcceptsOidcSecret` must be
mirrored to it in the same change. The asymmetry between the two
predicates — exclusion on the effective side, positive definition on the
stored side — is deliberate and fail-closed, not an inconsistency to be
unified.
