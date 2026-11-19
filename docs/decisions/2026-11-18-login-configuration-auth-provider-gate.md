# Login configuration is gated by the auth provider: menu fails open, routes fail closed

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/guardMatrix.test.ts` (provider-by-identity matrices) and
  `settings/permissionRules.test.ts` (gate truth table)
- **Related:** Settings shell design §11.2, §10.4; ADR:2026-11-18-settings-navigation-is-registry-driven

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin gates the login configuration
surface by the configured auth provider. The predicate is a three-way OR
over the provider enum — Basic, LDAP, or Openmetadata
(`utils/AuthProvider.util.ts:406-411`; enum values in
`generated/settings/settings.ts:1310-1321`). The same predicate is used in
two places with opposite failure defaults, deliberately:

- The menu fails open only for an undefined provider:
  `isLoginConfigVisible` returns true when the provider is undefined
  (omitted, or not yet loaded), with a pin comment explaining that
  showing an inert settings page is a cosmetic fault whereas hiding a
  live one takes working settings away from admins
  (`utils/GlobalSettingsClassBase.ts:163-178`). A known provider
  outside the applicable set (for example `azure`) hides the entry.
  The login menu item is `isProtected: Boolean(isAdminUser) &&
  isLoginConfigVisible`
  (`utils/GlobalSettingsClassBase.ts:445`).
- The routes fail closed: the login edit and list routes branch on the same
  predicate, and a provider outside the three, or an undefined provider,
  lands in `not-found` (`components/AppRouter/SettingsRouter.tsx:482-500,952-966`).

The product previously evaluated the gate from the wrong source and with a
single default, so the menu and the routes disagreed with pin in opposite
directions.

## Decision

- The login gate is one predicate, defined only in
  `smartmetadata-ui/src/settings/permissionRules.ts`: the provider is
  Basic, LDAP, or Openmetadata. The provider value comes from the live auth
  configuration; no hardcoded provider and no build-time constant may stand
  in for it.
- The gate is evaluated before authorization, and its two failure defaults
  are kept distinct:
  - Menu evaluation fails open for an undefined provider only: an
    undefined provider keeps the entry visible (subject to the admin
    rule), exactly as pin's `isLoginConfigVisible` does; a known
    provider outside the applicable set hides the entry.
  - Route evaluation fails closed: an undefined or unrecognized provider
    lands in `not-found`, exactly as pin's route branches do.
- The gate and the admin rule compose, never merge: the menu item requires
  admin identity AND the open-default gate; the routes require the
  closed-default gate AND their own wrapper. Collapsing the two defaults
  into one shared boolean is a defect, not a simplification.
- The SSO surface is not covered by this gate. Pin's SSO routes carry no
  guard wrapper and are reachable by any logged-in user, while the SSO menu
  item is admin-only (`components/AppRouter/SettingsRouter.tsx:401,1074-1076`;
  `utils/GlobalSettingsClassBase.ts:1002-1008`). The SSO asymmetry is
  recorded in the registry record and must not be folded into the login gate.

## Consequences

The guard matrices must cover the provider dimension explicitly: each of the
three providers, an unrecognized provider, and an undefined provider, crossed
with the three identities. A matrix that only varies identity cannot
distinguish the two failure defaults and is incomplete. Any future provider
added to the enum lands in the closed-default branch until the predicate is
explicitly extended with pin evidence.

## Open items

- None for the gate itself. The login configuration page's field equivalence
  (provider, password-login, self-signup, SSO) is the System-deletion gate
  recorded in the related record, not this one.
