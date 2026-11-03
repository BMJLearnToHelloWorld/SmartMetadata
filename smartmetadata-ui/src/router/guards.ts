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
 * MERGE REQUIREMENT: the router beforeEach call site must pass
 * isAdminUser from the auth store (and hasPermission once a route
 * permission source exists). Without isAdminUser, this guard forbids
 * admin routes for everyone, admins included. The call site lives in
 * router/index.ts, which this track does not own, so the wiring is
 * a merge-time step, not a runtime fallback. Until a hasPermission
 * value is passed, admin routes are admin-gated only.
 *
 * AppMode separate routes are a Stage 1 placeholder: only the
 * app-mode preference page exists; no fake AppMode shell is created
 * here.
 */
export const ADMIN_ROUTE_PREFIXES = ['/admin'] as const;

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
