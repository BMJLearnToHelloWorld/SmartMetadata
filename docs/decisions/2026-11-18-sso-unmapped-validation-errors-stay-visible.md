# Validation errors with no form control stay visible in a problems list; none is ever dropped

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Settings A-group design (DESIGN.md §7, S24) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/admin/ssoConfiguration.test.ts` (mapping, overwrite, no dedup, scroll target); `smartmetadata-ui/src/views/admin/SsoSettingsView.test.ts` (400 backfill, edit-clear, re-save clearing, generic fallback)
- **Related:** upstream pin `a3012259ca`; design `~/workspace/work/settings-agroup-batch/DESIGN.md` (not in-repo, sole authority for this batch)

## Context

The server reports validation errors as `{field, error}` pairs naming dotted paths in the
security document. Only seven of those paths name a control on the SSO form; the rest name
deeper paths (`oidcConfiguration.secret`, SAML blocks), whole sections, or nothing at all
(blank field, `general`). The form's job is to show the admin what is wrong: dropping an
error for want of a control would let a save fail for a reason the admin can never see, and
the deepest paths are exactly the ones a misconfigured identity provider produces.

## Decision

- Seven exact dotted paths map onto their form fields (`provider`, `providerName`,
  `clientType`, `authority`, `clientId`, `callbackUrl`, `enableSelfSignup`). `clientSecret`
  has no mapping: the secret field never carries a server error.
- Every other error goes to the problems list, rendered above the form, as `field: error`
  (bare `error` for a blank field). Problems are never deduplicated: the list shows exactly
  what the server reported.
- A later error for the same field overwrites the earlier one, matching the pin's
  `parseValidationErrors`; the problems list keeps every entry in order.
- After reporting, the form scrolls to the first error in DOM order — the earliest errored
  field, or the problems list when only it has entries — without focusing anything.
- Editing a field clears only that field's error; the problems list is never cleared on
  edit, since it names paths with no control. A new save or check clears everything first.
- A 400 whose body carries no structured errors falls back to the generic save-failed
  message, so an unparseable failure is still reported rather than silently swallowed.

## Consequences

No validation error is ever dropped, whatever path it names. Adding a form control for a
currently unmapped path means extending the seven-path map in the same change — the map is
the complete list of paths the form claims to explain, and the problems list is the
backstop for everything else.
