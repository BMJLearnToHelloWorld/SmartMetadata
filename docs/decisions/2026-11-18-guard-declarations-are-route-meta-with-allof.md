# Guard declarations live in route meta: `admin-only`, `{resource, operation}`, `allOf`, and `none`

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai
- **Guard:** `router/guards.test.ts` (declaration vocabulary, fallback chain,
  prefix retirement) and `router/guardMatrix.test.ts` (settled-state matrices)
- **Related:** Settings shell design D-20, §10.2, §10.6; ADR:2026-11-18-route-denial-renders-in-place-permission-placeholder;
  ADR:2026-11-18-login-configuration-auth-provider-gate

## Context

Pin paths below are relative to `openmetadata-ui/src/main/resources/ui/src/`,
verified against `origin/main` 392b3efd. Pin declares each route's guard at
the route: a bare `AdminProtectedRoute` wrapper (admin-only), a wrapper with
a permission value, or no wrapper at all. Examples: the customize-page route
is a bare wrapper (`components/AppRouter/AuthenticatedAppRouter.tsx:789-796`),
the create-user route carries a combined permission
(`components/AppRouter/AuthenticatedAppRouter.tsx:510-522`), the create-bot
permission is Create on USER AND Create on BOT
(`components/AppRouter/AuthenticatedAppRouter.tsx:358-362`), and the SSO
routes carry no wrapper (`components/AppRouter/SettingsRouter.tsx:401,1074-1076`).
Pin's permission check falls back through entity operation, all-operations,
and all-entities (`utils/PermissionsUtils.ts:34-45`).

The product's baseline declared guards in three places at once: the
`ADMIN_ROUTE_PREFIXES` table (`smartmetadata-ui/src/router/guards.ts:75`),
the `ADMIN_ROUTE_RESOURCE` mapping (`smartmetadata-ui/src/router/guards.ts:94-102`),
and per-route code. The prefix table made every `/admin/*` URL admin-gated
by string match, including URLs whose routes were deleted — a deleted route
still matched the catch-all and the prefix rule still answered `forbidden`
for it, which is why the prefix regime and the retired regime need separate
acceptance matrices.

## Decision

- Every route's guard is declared in its route meta, in exactly one of four
  forms: `admin-only`, `{resource, operation}`, `allOf` (a conjunction of
  `{resource, operation}` terms), or `none`. No guard may live in a prefix
  table, a resource mapping table, or component code. A route with no
  declaration is session-only: `resolveGuard` admits any logged-in user
  when the declaration is undefined, after the session check. Undeclared
  routes are common (for example the ingestion-service routes); `none`
  is the explicit spelling of the same admission for routes that
  declare it.
- `allOf` is a true conjunction: every term must hold. The contract
  prescribes `allOf` over Create USER and Create BOT for the
  create-user/bot routes, matching pin's `createBotPermission`; the
  routes themselves are not registered in this batch
  (`CREATE_USER_GUARD_DECLARATIONS` is contract-only). A single-term
  `allOf` is written as the bare term.
- The `none` form is a positive declaration that the route admits any
  logged-in user, used exactly where pin mounts a route without a wrapper
  (the SSO routes) and where pin's category route applies no permission
  check beyond the services-disabled predicate
  (`components/AppRouter/SettingsRouter.tsx:376-387`, with the predicate
  defaulting to false in `utils/ConnectionsRouterClassBase.ts:52`). `none`
  is never a placeholder for an undecided guard.
- Permission evaluation does NOT follow pin's client-side fallback chain.
  Pin's `checkPermission` falls back from the entity operation to the
  `all`-resource operation to `all.All`
  (`utils/PermissionsUtils.ts:34-45`); the product builds no such
  cross-resource fallback in this batch (D-19: the server merges `all`
  grants into the single-resource permission response, so the frontend
  evaluates the declared resource's own operations only). `view` means
  `ViewAll || ViewBasic` within that one resource's operations
  (`api/permissions.ts`, `permissionFlags`). The guard second line is
  evaluated by `guards.ts`'s own predicate table
  (`GUARD_OPERATION_PREDICATES`) and `evaluateGuardDeclaration`; only
  the resource-key mapping (`RESOURCE_KEY_BY_ENTITY`) is shared with
  `settings/permissionRules.ts`, whose evaluator serves the
  registry/menu filter, not the guard.
- The prefix table is retired. `ADMIN_ROUTE_PREFIXES` and
  `ADMIN_ROUTE_RESOURCE` are deleted, and `resolveGuard` decides from route
  meta alone. Retirement is a two-stage migration with two acceptance
  matrices: under the prefix regime, a deleted route's URL still matches
  the catch-all and the prefix rule answers `forbidden` to a logged-in
  non-admin; after retirement, the same URL falls through to `not-found`.
  The two matrices must not be merged, and no assertion may claim the
  retired behavior while the prefix table still exists.
- The `/create-user` contract is pinned (contract only; no routes are
  registered this batch): the route patterns are the top-level
  `/create-user` and `/create-user/bot`, matching pin's `CREATE_USER` and
  `CREATE_USER_WITH_BOT` constants (`constants/constants.ts:217-218`)
  and their route declarations. The plain create uses the `{USER, Create}`
  second line (dual-line: admin OR `Create(user)`), matching pin's
  `hasPermission={checkPermission(Operation.Create, ResourceEntity.USER)}`
  (`components/AppRouter/AuthenticatedAppRouter.tsx:510-522`); the bot
  variant uses the `allOf` conjunction, admin OR (`Create(user)` AND
  `Create(bot)`) (`:523-529`, `createBotPermission` at `:358-363`). The
  declarations live in `CREATE_USER_GUARD_DECLARATIONS`
  (`router/guards.ts`).

## Consequences

Reading a route's guard means reading its meta; no table lookup is needed
and no string-prefix reasoning can surprise a reviewer. The guard matrices
become the contract: any route whose matrix row is missing is unguarded by
definition, and the matrices must cover all four declaration forms plus the
prefix-retirement stages. Deleting a route deletes its guard with it, which
is the correct behavior — a deleted URL must not keep answering `forbidden`
from a leftover table.

## Open items

- Non-settings routes keep their existing guards in this batch; extending
  the meta vocabulary to them is a separate batch's work and is not approved
  here.
- The retirement's second-stage matrix (post-prefix behavior for every
  deleted URL) must be written before the prefix table is deleted; this
  record states the vocabulary and the stages, not the matrix rows.
