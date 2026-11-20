# User detail moves to `:fqn`; the three marketplace app routes gain a meta admin gate

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-19: B-9 → (a1) complete `:fqn`, implementation on the new main;
  2026-11-19 10:01: AP-D3 hard cut approved, meta-izing the app-route guards is its
  follow-up; the DEL-22 HOLD is lifted by this change)
- **Guard:** `smartmetadata-ui/src/router/routes.test.ts` (admin-user resolve, marketplace
  guard declaration table); `smartmetadata-ui/src/views/admin/auditLogFeed.test.ts`,
  `AuditLogListItem.test.ts`, `RoleDetailView.test.ts` (admin-user link targets);
  `smartmetadata-ui/src/views/marketplace/*View.test.ts` (views render ungated)
- **Related:** ADR:2026-11-20-ap-d3-marketplace-routes-hard-cut (the hard cut this
  follows up — that record is not amended); `decision-materials-20261119/B9-RD8A-EVIDENCE.md`
  (B-9 evidence pack, baseline 392b3efd); upstream pin `a3012259ca`
  (`constants.ts:219-221` `USER_PROFILE: '/users/:fqn'`;
  `AuthenticatedAppRouter.tsx:479-503` bare `AdminProtectedRoute` on the three app routes,
  `:505-508` bare-mounted `USER_PROFILE*`; `AdminProtectedRoute.tsx:26-47`)

## Context

Two leftovers of the route-alignment work, both already half-landed on main:

1. **B-9 (a1), user half.** The domain half of B-9 landed in #233/#237: the domain
   detail route is `:fqn`-addressed, the view fetches by name, the permission-debugger
   panel links domain sources by FQN, and the version page resolves the FQN back-link
   through one `getDomain` bridge. The user half was still open: `admin-user` kept
   the `:id` segment while the view already fetched by name
   (`route.params.fqn ?? route.params.id` → `getUserByName`). Official has no
   `/admin/users/:id` counterpart at all — `UserPage` is mounted only on
   `USER_PROFILE*` (`/users/:fqn`, with tab/sub-tab variants), bare-mounted.
2. **AP-D3 meta gate (DEL-22 HOLD).** The AP-D3 hard cut moved the marketplace
   routes onto the official paths but explicitly left the three app views' inline
   `isAdmin` gates in place, because the routes carried no meta guard and removing
   the inline checks would have opened a no-guard window. The product router has
   since then had everything the meta gate needs: `meta.guard: 'admin-only'` resolves
   to `{ kind: 'deny' }` for non-admins, the navigation completes with the URL
   unchanged, and the AppShell slot renders the shared placeholder instead of
   mounting the matched component — the same in-place denial the official bare
   `AdminProtectedRoute` renders (`PermissionPlaceholder`, `permissionValue =
   label.view`).

## Decision

- `admin-user` moves from `admin/users/:id` to `admin/users/:fqn`. The guard
  declaration (`{ resource: 'USER', operation: 'entry' }`) is unchanged. The
  canonical top-level face stays `users/:fqn` (`user-detail`).
- `UserDetailView` reads only `route.params.fqn` now; the `?? route.params.id`
  fallback is deleted. All `admin-user` link producers pass the FQN (the username):
  `RoleDetailView` (`record.fullyQualifiedName ?? record.name`), the audit-log
  field resolvers and header/entity links (values already usernames), and the
  impersonated-by link. The team route keeps its `:id` segment carrying an FQN
  value (D-11 transition shape) — out of scope here.
- The three marketplace app routes (`marketplace-app-catalog`,
  `marketplace-app-detail`, `marketplace-app-install`) gain
  `meta: { guard: 'admin-only' }` (keeping their `titleKey`). The data
  marketplace overview (`marketplace-overview`) stays unguarded, like the
  official `DataMarketplacePage` route.
- The three app views lose their inline `isAdmin` gates entirely: the
  `PermissionPlaceholder` branches, the `isAdmin` computeds, the fetch
  gating (`onMounted` / `watch(isAdmin)` / loader early-return /
  `resetKey: () => isAdmin.value`), and the now-unused `useAuthStore`
  imports in the detail/install views. A non-admin never mounts these
  views; the denial is locked at route level instead.

## Consequences

- **One-time break, no dual track.** A stored `/admin/users/<UUID>` deep link
  now calls `getUserByName(<UUID>)`, which finds no such name → the view's
  error state. This is the same class of break as the AP-D3 wording-A cut,
  and the same ruling applies: align with official, no compatibility track
  (official has no UUID fallback anywhere on the user/detail path).
  The `users/:fqn` face is unaffected.
- **No no-guard window.** The meta guard and the inline-gate removal land in
  the same change; the deny behaviour (same URL, in-place placeholder) is
  unchanged in result and is now asserted by the route guard declaration
  table instead of the three view tests.
- **Deliberately unchanged.** The domain version route stays `:id` (the
  version API fetches by id); `DETAIL_ENDPOINTS` gains no `domain` entry
  (domain is not a generic asset type — the debugger panel links it through
  an explicit case); the role/policy/team detail routes stay `:id`
  (role/policy are B-10's scope, team is the D-11 transition shape).
