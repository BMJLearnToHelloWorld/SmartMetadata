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
 * vocabulary is data, never path prefixes: the old
 * ADMIN_ROUTE_PREFIXES / ADMIN_ROUTE_RESOURCE / hasAdminEntryGrant
 * machinery was retired with this change (DESIGN §10.5) because a
 * URL prefix cannot tell a migrated route from a staged one, and a
 * deleted route record is not proof that the literal URL is
 * unreachable (M1c).
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
 * The bot branch is the conjunction Create(user) AND Create(bot)
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
