# My-data B-7: /announcements and /announcements/duplicate are admin-only

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `router/guards.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 1 (hard pre-fix for stage C), official `components/MyData/SettingsRouter.tsx`, `components/Admin/AdminProtectedRoute.tsx`

## Context

The announcements management pages (`/announcements` and
`/announcements/duplicate/:id`) were reachable by any signed-in user.
Official puts system announcements under Settings with a bare
`<AdminProtectedRoute>` — no `hasPermission` prop — and the server
lets no one else write them ("System announcements are admin-only").
The product's admin guard (`resolveAdminAccess`, the `isAdminUser ||
hasPermission` two-line rule from #161 `/settings`) had no prefix for
these routes, so the second line never ran for them.

## Decision

- `ADMIN_ROUTE_PREFIXES` gains `'/announcements'` (the same pattern as
  `#161 /settings`). The duplicate sub-route shares the prefix.
- No `ADMIN_ROUTE_RESOURCE` entry is added: official's gate carries
  no `hasPermission` line, so the product equivalent is prefix-only —
  admin-only, non-admins are forbidden.
- No in-component gate is added: the router guard is the single
  enforcement point.
- The read-only home announcement rail is unaffected: it is not an
  admin route and lists what the viewer may see.

## Consequences

- Stage C may land: the hard pre-fix is satisfied.
- Two-role live verification is still owed (a non-admin account is
  pending from Bai): the code proves the guard wiring, not that a
  non-admin is actually turned away in the deploy environment.
