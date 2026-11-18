# The SSO candidate is the whole stored security document, deep-copied, with the form overlaid and managed fields pinned back

- **Status:** Accepted; secret-mapping inertness superseded by ADR:2026-11-18-sso-candidate-secret-mapping
- **Revisions:** v1 2026-11-18 (initial) · v2 2026-11-18 (secret-mapping inertness superseded)
- **Deciders:** Settings A-group design (DESIGN.md §7–§9, S24–S26) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/admin/ssoConfiguration.test.ts` (overlay, deletion, providerName condition, managed pin-back, non-mutation, isolation); `smartmetadata-ui/src/views/admin/SsoSettingsView.test.ts` (shared candidate reaches Test Login and the gate)
- **Related:** upstream pin `a3012259ca`; design `~/workspace/work/settings-agroup-batch/DESIGN.md` (not in-repo, sole authority for this batch); ADR:2026-11-18-sso-test-login-pass-binds-to-candidate-content; ADR:2026-11-18-sso-candidate-secret-mapping

## Context

Validate, Test Login, and the save gate all judge a candidate — the configuration the form
describes, before it is saved. The form shows eight fields, but the stored document carries
more: the server's checks read fields the form never shows (emailClaim, jwtPrincipalClaims,
the OIDC/SAML blocks), and the secret-restore logic reads the whole document too. A candidate
built from the form alone would fail checks the stored configuration passes, and a Test Login
that passed on a truncated candidate would prove something other than what the save stores.
Three consumers building three candidates would drift the same way: the gate could unlock a
configuration no test ever saw.

## Decision

One builder, `buildCandidateConfiguration` in `smartmetadata-ui/src/admin/ssoConfiguration.ts`,
is the only entry all three consumers share:

- It starts from a deep copy of the stored document, made by a JSON round trip — never
  `structuredClone`, which rejects the reactive proxies the document lives in — and never
  mutates the stored document.
- The form's fields overlay the copy: an empty or missing value deletes the key, `false`
  writes through, and `providerName` overlays only when the form provider is `custom-oidc`;
  for every other provider the stored value rides along untouched.
- No provider-specific block cleanup and no schema defaults are applied: those belong to
  the field-group batch that owns the controls, and inventing them here would change what
  the server checks.
- Deployment-owned fields pin back to their stored values by section-relative JSON pointer
  semantics (empty pointer: the whole section; a pointer naming nothing stored removes the
  field), so a candidate never carries an edited value for a field the deployment owns.
- When the section is not editable at all, the builder returns a deep copy of the stored
  document and the form is ignored outright.

The read behind it, `getSecurityConfigurationDocument`, carries both sections verbatim and
reads a missing section as an empty object, never `undefined`.

## Consequences

Validate, Test Login, and the gate always judge the same document, so a pass means the saved
configuration was the tested one. The typed secret's mapping point (`applyEnteredSecret`)
stays inert: server verification (Q1) showed the leaf save op the design rules for the secret
is only accepted when the stored provider is OIDC and the stored document already carries an
`oidcConfiguration` block, so writing the secret into the candidate would prove a
configuration the save cannot store. That mapping point must not be activated without a new
decision record re-ruling the secret path.

## Amendment — 2026-11-18

ADR:2026-11-18-sso-candidate-secret-mapping is the re-ruling this record required: it
re-rules the secret path, and the mapping point (`applyEnteredSecret`) is now active — the
typed secret maps onto the candidate's `oidcConfiguration.secret`, and the save op fires
only when the stored document can accept it. The inertness stated above no longer holds;
the rest of this record still applies.
