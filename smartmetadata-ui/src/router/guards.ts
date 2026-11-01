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
 * layer (PageNotFound, AccessNotAllowed, UnAuthenticated redirect) as
 * far as the product session reaches.
 *
 * Residual, stated plainly: the official AdminProtectedRoute checks
 * the user's role, but the product LoginUser type carries no role or
 * isAdmin field, so no admin role check is possible today. The guard
 * therefore passes on session alone, and the forbidden branch exists
 * for direct navigation to /forbidden (like the official
 * AccessNotAllowedPage) — it is not, and must not be read as,
 * enforcement. AppMode separate routes are a Stage 1 placeholder:
 * only the app-mode preference page exists; no fake AppMode shell is
 * created here.
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

export function resolveGuard(args: {
  isPublic: boolean;
  hasSession: boolean;
  fullPath: string;
}): GuardDecision {
  if (args.isPublic) {
    return { kind: 'allow' };
  }
  if (!args.hasSession) {
    return { kind: 'login', redirect: args.fullPath };
  }
  return { kind: 'allow' };
}
