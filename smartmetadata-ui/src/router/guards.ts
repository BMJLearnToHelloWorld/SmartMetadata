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
 * Route guard resolution, mirroring the official AuthenticatedRoutes
 * layer (PageNotFound, AccessNotAllowed, UnAuthenticated redirect).
 *
 * Admin routes run the official AdminProtectedRoute dual line:
 * isAdminUser (currentUser?.isAdmin from the profile) OR a resource
 * permission grant. Either line passes; neither means the forbidden
 * page (the official PermissionPlaceholder equivalent), not a silent
 * pass on session alone.
 *
 * Second-line wiring (router/index.ts beforeEach): for admin routes
 * with a mapped resource (ADMIN_ROUTE_RESOURCE below), the guard
 * queries the permission store (the PermissionProvider equivalent,
 * cached per principal) and admits entry on any view-or-better grant
 * (hasAdminEntryGrant). Entry is deliberately coarser than action
 * gating: the views behind the route still enforce their own
 * operation-level buttons (EditAll/Create/...), so entry never
 * grants an action by itself. A permission query that fails is NOT
 * a grant (fail closed); an unmapped admin route stays admin-only
 * until its resource mapping is determined — no permission key is
 * invented for it. Official precedent: AdminProtectedRoute itself
 * takes an optional hasPermission, and several official admin
 * routes pass none (admin-only by design).
 *
 * AppMode separate routes are a Stage 1 placeholder: only the
 * app-mode preference page exists; no fake AppMode shell is created
 * here.
 */
import type { OperationPermissions } from '@/api/permissions';
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
 * (the same client the debugger and the governance views use), and
 * the custom-properties routes map to 'type' (G-23 stage 4: the
 * per-type entity gate on the detail page needs the route to admit
 * non-admins holding a type grant — without the mapping the guard
 * would forbid them before they could ever reach the gated buttons;
 * entry is the existing hasAdminEntryGrant rule, unchanged).
 * Roles, bots, policies, other settings routes, personas,
 * intake/task forms and the permission debugger stay admin-only until
 * their mappings are determined — the debugger in particular is
 * admin-only by design (its debug/user/{username} endpoint is
 * admin-only server-side).
 * ADR:2026-11-10-custom-properties-stage-4-per-type-gate
 */
export const ADMIN_ROUTE_RESOURCE: Record<string, string> = {
  'admin-users': 'user',
  'admin-user': 'user',
  'admin-admins': 'user',
  'admin-teams': 'team',
  'admin-team': 'team',
  'admin-settings-custom-properties': 'type',
  'admin-settings-custom-property-type': 'type',
};

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

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'login'; redirect: string }
  | { kind: 'forbidden' };

export function isAdminPath(path: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** Official AdminProtectedRoute first branch: isAdminUser || hasPermission. */
export function resolveAdminAccess(args: {
  isAdminUser?: boolean;
  hasPermission?: boolean;
}): boolean {
  return args.isAdminUser === true || args.hasPermission === true;
}

export function resolveGuard(args: {
  isPublic: boolean;
  hasSession: boolean;
  fullPath: string;
  isAdminUser?: boolean;
  hasPermission?: boolean;
}): GuardDecision {
  if (args.isPublic) {
    return { kind: 'allow' };
  }
  if (!args.hasSession) {
    return { kind: 'login', redirect: args.fullPath };
  }
  if (isAdminPath(args.fullPath) && !resolveAdminAccess(args)) {
    return { kind: 'forbidden' };
  }
  return { kind: 'allow' };
}
