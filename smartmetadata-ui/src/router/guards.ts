/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Route guard resolution, driven by per-route meta declarations
 * (DESIGN §10, settings shell batch). A route declares its guard in
 * `meta.guard`; an undeclared route is session-only. The declaration
 * vocabulary is data, never path prefixes: path-based judging inside
 * `resolveGuard` and the router's beforeEach was retired with this
 * change (DESIGN §10.5) because a URL prefix cannot tell a migrated
 * route from a staged one, and a deleted route record is not proof
 * that the literal URL is unreachable (M1c).
 *
 * Rebase note (sections batch): the route→resource table
 * (ADMIN_ROUTE_RESOURCE), the path classifier (isAdminPath) and the
 * entry helper (hasAdminEntryGrant) below are retained as the
 * sections-batch contract surface — the role/policy mappings, C-1,
 * the members :tab segments and the B-7/P-17 path classification —
 * asserted by guards.test.ts, domains.test.ts and routes.test.ts.
 * The live beforeEach does not consult them: their mappings are
 * mirrored by the meta.guard declarations in router/index.ts.
 *
 * Official precedent: AdminProtectedRoute (openmetadata-ui
 * components/AppRouter/AdminProtectedRoute.tsx) renders its
 * children on `isAdminUser || hasPermission` and renders the
 * PermissionPlaceholder in place otherwise — it never navigates
 * away. The product equivalent is `resolveGuard` returning `deny`:
 * the navigation completes, the URL is unchanged, and the AppShell
 * slot renders the shared placeholder instead of the matched
 * component (D-3). `deny` is never a redirect target.
 *
 * Evaluation order (DESIGN §10.4, S1): public → session →
 * login-configuration provider gate → admin line → declared
 * resource line. The provider gate runs before the admin line, so
 * even an admin lands on the not-found route when the auth provider
 * does not support login configuration. `resolveGuard` encodes the
 * whole order; the router's beforeEach supplies the inputs (the
 * provider-gate outcome and the second-line evaluation) and maps
 * the outcome to a navigation result.
 *
 * The `entry` operation exists only as the staged equivalence for
 * the old user-detail route (M1b): admin OR user
 * ViewAll/ViewBasic/EditAll, matching the pre-migration entry rule
 * for that one record. It must not be used by new routes, and it
 * vanishes when the detail migrates in the partition batch.
 */
import type { OperationPermissions } from '@/api/permissions';
import {
  RESOURCE_KEY_BY_ENTITY,
  type ResourceEntityName,
} from '@/settings/permissionRules';

/** Operations a guard declaration can demand of a resource grant. */
export type GuardOperation = 'view' | 'entry' | 'Create' | 'EditAll' | 'AuditLogs';

/** One resource line of a guard declaration. */
export interface GuardResourceCondition {
  resource: ResourceEntityName;
  operation: GuardOperation;
}

/**
 * Guard declaration vocabulary (DESIGN §10.1):
 * - 'admin-only': the admin line only, no resource query.
 * - 'none': login only (the provider gate still applies).
 * - { resource, operation }: admin OR the resource line.
 * - { allOf: [...] }: admin OR every resource line (conjunction).
 */
export type GuardDeclaration =
  | 'admin-only'
  | 'none'
  | GuardResourceCondition
  | { allOf: readonly GuardResourceCondition[] };

/** Operation → grant predicate over one resource's operations. */
export const GUARD_OPERATION_PREDICATES: Record<
  GuardOperation,
  (ops: OperationPermissions | null | undefined) => boolean
> = {
  view: (ops) => ops?.ViewAll === true || ops?.ViewBasic === true,
  entry: (ops) => ops?.ViewAll === true || ops?.ViewBasic === true || ops?.EditAll === true,
  Create: (ops) => ops?.Create === true,
  EditAll: (ops) => ops?.EditAll === true,
  AuditLogs: (ops) => ops?.AuditLogs === true,
};

/** Resource keys the declaration needs fetched (deduped, in order). */
export function guardDeclarationResources(declaration: GuardDeclaration): string[] {
  const conditions =
    typeof declaration === 'object' && 'allOf' in declaration
      ? declaration.allOf
      : typeof declaration === 'object'
        ? [declaration]
        : [];
  const keys: string[] = [];
  for (const condition of conditions) {
    const key = RESOURCE_KEY_BY_ENTITY[condition.resource];
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Sections-batch contract surface (retained, see the header note).
 * The prefix list below classifies admin paths for the route/domain
 * tests (B-7, P-17); it is not consulted by resolveGuard or the
 * router's beforeEach, which are declaration-driven.
 */
// The guard judges admin-ness from the URL path, but official's
// AdminProtectedRoute wraps the route component, so any URL that
// renders an admin page must be recognised here — including the
// official-path aliases of admin routes. '/settings' is the alias
// of admin/settings (G-09); without this entry a non-admin opening
// /settings would bypass the admin entry check, because the path
// does not start with /admin/. The same entry also covers the three
// pre-existing /settings/governance/* aliases (intake-forms,
// task-forms, glossary-term-relations), which resolve to admin
// routes as well. Every /settings/* URL in the product currently
// resolves to an admin route, so no non-admin route is affected.
// '/announcements' is the announcements management list (B-7,
// Wave 2 G-11 stage C): official puts system announcements under
// Settings with a bare <AdminProtectedRoute> — "System announcements
// are admin-only: the server lets no one else write them"
// (SettingsRouter.tsx) — i.e. admin-only with no hasPermission line.
// The product equivalent is this prefix with no ADMIN_ROUTE_RESOURCE
// entry, so non-admins are forbidden and only admins enter; the
// duplicate sub-route shares the prefix. The read-only home
// announcement rail is unaffected: it is not an admin route.
// ADR:2026-11-08-my-data-announcements-admin-gate
// Stage D (G-11): the persona landing-page editor is admin-only too —
// a non-admin must never reach the customize route, and the home page
// only offers the entry to admins with a persona in play.
// ADR:2026-11-10-my-data-customize-page-drag
// '/ingestion/pipelines' is the ingestion pipeline workspace (P-17):
// official keeps only the Pipelines tab admin-only
// (ServicesPage.tsx:147-165) — the Services page itself admits users
// with category view permission, and the service-detail Ingestion tab
// admits owner/owner-team/admin (ServiceDetailsPage.tsx:1896). So only
// the pipeline list/detail/edit routes are admin-gated here; the
// service routes (/ingestion/services*) keep their existing
// view-permission behaviour, and the per-action permission bits still
// gate the buttons inside. No ADMIN_ROUTE_RESOURCE entry: without a
// determined resource mapping the routes stay admin-only by design.
export const ADMIN_ROUTE_PREFIXES = ['/admin', '/settings', '/announcements', '/customize-page', '/ingestion/pipelines'] as const;

/**
 * Admin route name -> permission resource for the guard's second
 * line. Only routes with a determined mapping are listed: users and
 * teams are entity resources served by GET /v1/permissions/{resource}
 * (the same client the debugger and the governance views use).
 * Roles and policies joined with the sections batch (03 §12:
 * hasViewPermissions(ROLE/POLICY) entry, operations gated in-view);
 * the add-rule/add-role/add-policy routes stay unmapped because
 * their §12 declarations are Create/EditAll operations, which this
 * view-or-better entry vocabulary cannot express, and their views
 * carry no in-view Create gate — mapping them would admit
 * view-only users to ungated create forms. Bots, other settings
 * routes, personas, intake/task forms and the permission debugger
 * stay admin-only until their mappings are determined — the
 * debugger in particular is admin-only by design (its
 * debug/user/{username} endpoint is admin-only server-side).
 * Audit logs stay unmapped: no `auditLog` resource vocabulary
 * exists and the view carries no permission gate, so the §12
 * checkPermission line for it is unimplemented at both levels.
 * C-1 erratum (Bai 2026-11-18): the two 'type' mappings for the
 * custom-properties routes (G-23 stage 4) are deleted; the per-type
 * gate lives in the detail page, not at route level. The ADR pointer
 * below named no file present in this repo, so the erratum is
 * recorded here and in the integration report.
 * ADR:2026-11-10-custom-properties-stage-4-per-type-gate (superseded by C-1)
 * Rebase note: the live entry rule is the meta.guard declaration in
 * router/index.ts (`view` = ViewAll/ViewBasic, matching official
 * hasViewPermissions); this table records the sections-batch entry
 * rule, which additionally admitted EditAll-only holders. The table
 * is not consulted by the live beforeEach.
 */
export const ADMIN_ROUTE_RESOURCE: Record<string, string> = {
  'admin-users': 'user',
  'admin-user': 'user',
  'admin-admins': 'user',
  'admin-team': 'team',
  'settings-members': 'user',
  'settings-members-team': 'team',
  'settings-members-team-import': 'team',
  'admin-roles': 'role',
  'admin-role': 'role',
  'admin-policies': 'policy',
  'admin-policy': 'policy',
};

/**
 * Members :tab segment guard (02 §8.3). Pin renders one
 * UserListPageV1 for the members category and derives isAdminPage
 * from the tab (`tab === GlobalSettingOptions.ADMINS`,
 * UserListPageV1.tsx:82); a segment outside {users, admins} is not
 * a page, so the guard resolves to pin's NOT_FOUND path ('/404',
 * constants.ts:139), which the catch-all renders as NotFoundView.
 * Kept as a named export so the route wiring is assertable by
 * identity and the segment rule is unit-testable without mounting
 * the router.
 */
export function membersTabGuard(to: { params: { tab?: string | string[] } }): boolean | string {
  const tab = to.params.tab;
  return tab === 'users' || tab === 'admins' ? true : '/404';
}

/**
 * Entry grant for a mapped admin route: any view-or-better grant
 * admits entry. Action buttons inside the view enforce their own
 * operations (Create/EditAll/...), so entry alone grants nothing.
 */
export function hasAdminEntryGrant(
  ops: OperationPermissions | null | undefined,
): boolean {
  return ops?.ViewAll === true || ops?.ViewBasic === true || ops?.EditAll === true;
}

/**
 * Path classifier for the retained prefix list above (B-7, P-17).
 * Not consulted by resolveGuard or the router's beforeEach.
 */
export function isAdminPath(path: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Pure second-line evaluation: `opsByResource` is keyed by the
 * §11.3 resource key (see guardDeclarationResources). A missing or
 * failed fetch is not a grant (fail closed). 'admin-only' has no
 * second line; 'none' needs none.
 */
export function evaluateGuardDeclaration(
  declaration: GuardDeclaration,
  opsByResource: Readonly<Record<string, OperationPermissions | null | undefined>>,
): boolean {
  if (declaration === 'admin-only') {
    return false;
  }
  if (declaration === 'none') {
    return true;
  }
  const conditions =
    'allOf' in declaration ? declaration.allOf : [declaration];
  return conditions.every((condition) =>
    GUARD_OPERATION_PREDICATES[condition.operation](
      opsByResource[RESOURCE_KEY_BY_ENTITY[condition.resource]],
    ),
  );
}

function isGuardResourceCondition(value: unknown): value is GuardResourceCondition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.resource === 'string' &&
    candidate.resource in RESOURCE_KEY_BY_ENTITY &&
    typeof candidate.operation === 'string' &&
    candidate.operation in GUARD_OPERATION_PREDICATES
  );
}

/**
 * Narrows a route meta value to a guard declaration. An absent
 * value means the route carries no declaration (session-only). A
 * present but malformed value fails closed to 'admin-only': a
 * misspelled declaration must never silently open a route.
 */
export function guardDeclarationOf(metaValue: unknown): GuardDeclaration | undefined {
  if (metaValue === undefined) {
    return undefined;
  }
  if (metaValue === 'admin-only' || metaValue === 'none') {
    return metaValue;
  }
  if (isGuardResourceCondition(metaValue)) {
    return metaValue;
  }
  if (typeof metaValue === 'object' && metaValue !== null) {
    const allOf = (metaValue as Record<string, unknown>).allOf;
    if (
      Array.isArray(allOf) &&
      allOf.length > 0 &&
      allOf.every(isGuardResourceCondition)
    ) {
      return { allOf };
    }
  }
  return 'admin-only';
}

/**
 * Reserved create-user declarations (DESIGN §10.6). Contract only:
 * no route or page is registered for these paths in this batch.
 * Rebase note: the sections batch registers the user-detail, bot-detail
 * and create-user routes without declarations (session-only); these
 * declarations remain the contract for when the Create/ conjunction
 * gap is closed. The bot branch is the conjunction Create(user) AND Create(bot)
 * (official AuthenticatedAppRouter.tsx: createBotPermission).
 */
export const CREATE_USER_GUARD_DECLARATIONS = {
  '/create-user': { resource: 'USER', operation: 'Create' },
  '/create-user/bot': {
    allOf: [
      { resource: 'USER', operation: 'Create' },
      { resource: 'BOT', operation: 'Create' },
    ],
  },
} as const satisfies Record<string, GuardDeclaration>;

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'login'; redirect: string }
  | { kind: 'not-found' }
  | { kind: 'deny' };

/** Official AdminProtectedRoute first branch: isAdminUser || hasPermission. */
export function resolveAdminAccess(args: {
  isAdminUser?: boolean;
  hasPermission?: boolean;
}): boolean {
  return args.isAdminUser === true || args.hasPermission === true;
}

/**
 * The single guard decision, in DESIGN §10.4 order. `hasPermission`
 * is the already-evaluated second line (meaningful only when the
 * route declares a resource condition); `loginConfigApplicable`
 * carries the provider-gate outcome for loginConfigGate routes and
 * is undefined for all other routes.
 */
export function resolveGuard(args: {
  isPublic: boolean;
  hasSession: boolean;
  fullPath: string;
  isAdminUser?: boolean;
  hasPermission?: boolean;
  declaration?: GuardDeclaration;
  loginConfigApplicable?: boolean;
}): GuardDecision {
  if (args.isPublic) {
    return { kind: 'allow' };
  }
  if (!args.hasSession) {
    return { kind: 'login', redirect: args.fullPath };
  }
  if (args.loginConfigApplicable === false) {
    return { kind: 'not-found' };
  }
  if (args.declaration === undefined || args.declaration === 'none') {
    return { kind: 'allow' };
  }
  if (resolveAdminAccess(args)) {
    return { kind: 'allow' };
  }
  return { kind: 'deny' };
}
