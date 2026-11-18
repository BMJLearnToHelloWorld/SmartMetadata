# A denied route renders the permission placeholder in place, at the requested URL

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/guards.test.ts`, `router/guardMatrix.test.ts`, and
  `components/shared/PermissionPlaceholder.test.ts`
- **Related:** Settings shell design §10, §11; ADR:2026-11-10-custom-properties-stage-4-per-type-gate
  (see the erratum in this record); ADR:2026-11-18-guard-declarations-are-route-meta-with-allof

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin's settings pages are wrapped by
`AdminProtectedRoute`, which renders the page only when the user is an admin
or has permission (`components/AppRouter/AdminProtectedRoute.tsx:36`), and
otherwise renders `PermissionPlaceholder` in place at the requested URL
(`components/AppRouter/AdminProtectedRoute.tsx:37-44`), passing the localized
View label as the permission value. The placeholder is a bare empty state
with no action button: its title is `label.access-denied` ("Access Denied")
and its description is `message.no-access-placeholder`, which names the
entity (`components/common/EmptyPlaceholder/PermissionPlaceholder.tsx:37-51`;
`locale/languages/en-us.json:22,5357,3896`). The redirect branch in the
wrapper is dead for authenticated users: it is only reachable when the
identity is missing.

The product rejected with a navigation to a dedicated forbidden page, which
changed the URL and showed copy that does not come from pin.

## Decision

- A denied route renders the permission placeholder in place at the
  requested URL. The placeholder copy is exactly the pin copy: title
  "Access Denied", description naming the entity, no button, no link. No
  dedicated forbidden page, no redirect to any login or forbidden path, and
  no extra copy may be added.
- The guard decision is made in three layers. `resolveGuard`
  (`router/guards.ts`) is the pure decision in DESIGN §10.4 order
  (public → session → provider gate → admin line → declared resource
  line) and returns allow/login/not-found/deny. The `guards.ts` module
  exports the public helper set the decision is built from:
  `GUARD_OPERATION_PREDICATES`, `guardDeclarationResources`,
  `evaluateGuardDeclaration`, `guardDeclarationOf`,
  `CREATE_USER_GUARD_DECLARATIONS`, and `resolveAdminAccess`. The
  router's `beforeEach` supplies the inputs — the refreshUser wait,
  the provider-gate outcome, and the declared resource lines
  evaluated through direct permission-store queries
  (`usePermissionStore().getResourcePermission`) — and maps the
  outcome to a navigation result plus the guard-decision store
  record. There is no `applyGuard` lifecycle owner and no
  `useGuardValue` hook; no decision is copied into component state.
- The placeholder decision is a full page-level substitution, not a
  placeholder component laid over the page. A rejected guarded component
  never executes, exactly as pin never mounts the page component behind a
  denied wrapper.
- Guard decisions keep their own truth table and are never derived from
  menu or hub visibility. Whether an entry is hidden in the menu says
  nothing about whether the route admits a directly visiting user.
- The in-place placeholder is the route-level rule for settings routes.
  Pages that compute their own inline placeholders (for example the services
  page's view-permission branch) keep their own pin forms; this record does
  not force them into the route form.

## Erratum: the custom-properties routing record

The decision record ADR:2026-11-10-custom-properties-stage-4-per-type-gate
said in its Context section that routing access to the custom-properties
detail page was widened from admin-only to permission-gated through two
`type` route mappings, and that "That is exactly pin's `AdminProtectedRoute`
semantics." That routing claim is withdrawn. Pin's custom-properties detail
route is `hasPermission={false}`
(`components/AppRouter/SettingsRouter.tsx:1001-1009`), an admin-only wrapper:
only the admin line admits, and the placeholder branch answers everyone
else. The product's baseline mappings (`smartmetadata-ui/src/router/guards.ts:94-102`,
the `admin-settings-custom-properties` and `admin-settings-custom-property-type`
entries under `'type'`) plus the entry rule `hasAdminEntryGrant`
(`smartmetadata-ui/src/router/guards.ts:109-113`, `ViewAll || ViewBasic || EditAll`
on the mapped resource) admit a wider set than pin's route. The C-1 ruling
(Bai, 2026-11-18, option A) deletes both `type` mappings and makes the detail
route admin-only; the recorded outcome is that the detail route's admission
result matches pin's `hasPermission={false}` route, and nothing in this
record claims the product guard implementation is identical to pin's wrapper
semantics in full. The per-type gate inside the detail page is retained
unchanged; the erratum covers only the routing claim, not the in-page gate.
The old record is not reworded by this record; it carries a v2 pointer to
this erratum, and the guard tests are updated in step.

## Consequences

The forbidden route and its prefix leave with the old rejection behavior
(the prefix is removed by the guard batch; the route name is not reused).
Every denied-settings assertion must check the rendered placeholder at the
requested URL, not a navigation target. The guard matrices in
`router/guardMatrix.test.ts` are the acceptance surface for the three
identities (admin, authorized non-admin, unauthorized non-admin); a denial
that changes the URL fails them. The prefix retirement landed atomically
with the meta declarations, so the matrices cover the settled state only
(final state, C-4 matrix 2); no separate prefix-regime matrix is pending.

## Open items

- Whether any non-settings route keeps a different rejection form is out of
  scope; this record governs settings routes only.
