# Deleting the System settings page is a direction only; the deletion is not approved

- **Status:** Proposed
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/guardMatrix.test.ts` (the hold assertion: the System route
  stays resolvable and admin-only while the deletion is unapproved) and reviewer
  verification that no deletion lands without a ruling
- **Related:** Settings shell design D-8, §4; ADR:2026-11-18-settings-route-space-is-the-only-canonical-space

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin has no System settings page: the
settings router has no system route, and the settings categories carry no
system entry (`utils/GlobalSettingsClassBase.ts:94-147`). The two surfaces
the product's System page bundles live elsewhere in pin: the version/revision
display is the OM Health page (`components/AppRouter/SettingsRouter.tsx:1022,1027`,
`OM_HEALTH` option), and the auth configuration is the login configuration
page (`components/AppRouter/SettingsRouter.tsx:482-500,952-966`).

The product's `SystemSettingsView.vue` (250 lines at the baseline) bundles
both, with a version/revision display and an auth-config form, and its only
write entries are the login and email saves. Neither bundled surface is
equivalent to its pin counterpart at the baseline: the product's OM Health
view carries no version/revision display, and the product's login
configuration view carries no provider, password-login, self-signup, or SSO
fields. Deleting the System page before those two pages are equivalent would
remove the only place those displays and fields exist.

## Decision

- Deleting the System settings page is a direction, not an approved action.
  This record approves nothing to delete. The route, the view, and the
  staging unit stay until a separate ruling approves the deletion.
- The deletion becomes eligible only when both equivalence conditions hold:
  the OM Health page carries the version/revision display, and the login
  configuration page carries the provider, password-login, self-signup, and
  SSO fields. Each condition is verified against the pin surface named
  above, not against the System page's own fields.
- While the deletion is unapproved, the System route stays at its original
  URL with its current guard, as a named staging unit. No code in this batch
  may remove, rename, or redirect it, and no guard-matrix row may assert its
  absence.

## Consequences

The System page remains visible in the product until the equivalence work
lands and the deletion is ruled on. Any batch that touches the OM Health or
login configuration pages must check its work against the two equivalence
conditions, because those conditions are the deletion's entry gate.

## Open items

- The deletion ruling itself, including whether the page's remaining content
  has any other home, is undecided and is not prejudged by this record.
- The equivalence work for the OM Health and login configuration pages is
  owned by their own batches; this record states the gate, not the schedule.
