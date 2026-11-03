/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/**
 * Permission client mirroring official rest/permissionAPI.ts against
 * server PermissionsResource (@Path /v1/permissions). Operation keys are
 * the server MetadataOperation names (Create, EditAll, Delete, ...).
 */
export type PermissionAccess = 'deny' | 'allow' | 'conditionalDeny' | 'conditionalAllow' | 'notAllow';

export interface ResourcePermissionEntry {
  operation: string;
  access: PermissionAccess;
  policy?: string;
  role?: string;
}

export interface ResourcePermission {
  resource: string;
  permissions: ResourcePermissionEntry[];
}

/** Operation name -> granted flag, mirroring official getOperationPermissions. */
export type OperationPermissions = Record<string, boolean>;

/**
 * Strict translation, matching the official provider's default: only a
 * plain `allow` grants. A conditionalAllow is not a grant at this layer
 * (official keeps it denied unless its conditional policy is flipped).
 */
export function toOperationPermissions(
  permission: ResourcePermission | null | undefined,
  allowConditional = false,
): OperationPermissions {
  const result: OperationPermissions = {};
  for (const entry of permission?.permissions ?? []) {
    if (!entry.operation) {
      continue;
    }
    result[entry.operation] =
      entry.access === 'allow' || (allowConditional && entry.access === 'conditionalAllow');
  }
  return result;
}

/** Derived write flags, mirroring official getDerivedPermissionFlags usage. */
export function permissionFlags(ops: OperationPermissions): {
  canCreate: boolean;
  canEditAll: boolean;
  canDelete: boolean;
} {
  return {
    canCreate: ops.Create === true,
    canEditAll: ops.EditAll === true,
    canDelete: ops.Delete === true,
  };
}

function mapResourcePermission(raw: Record<string, unknown>): ResourcePermission | null {
  const resource = asString(raw.resource);
  if (!resource) {
    return null;
  }
  const permissions: ResourcePermissionEntry[] = [];
  if (Array.isArray(raw.permissions)) {
    for (const item of raw.permissions) {
      const rec = asRecord(item);
      if (!rec) {
        continue;
      }
      const operation = asString(rec.operation);
      const access = asString(rec.access) as PermissionAccess;
      if (!operation) {
        continue;
      }
      permissions.push({
        operation,
        access,
        policy: asString(rec.policy) || undefined,
        role: asString(rec.role) || undefined,
      });
    }
  }
  return { resource, permissions };
}

/** Official getLoggedInUserPermissions: GET /permissions?limit=100. */
export function getLoggedInUserPermissions(limit = 100): Promise<Paged<ResourcePermission>> {
  return apiRequest<unknown>('/v1/permissions', {
    query: { limit },
  }).then((payload) => parsePaged(payload, mapResourcePermission));
}

/** Official getResourcePermission: GET /permissions/{resource}. */
export async function getResourcePermission(resource: string): Promise<ResourcePermission> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/permissions/${encodeURIComponent(resource)}`,
  );
  const mapped = mapResourcePermission(raw);
  if (!mapped) {
    throw new Error('Permission response was missing the resource');
  }
  return mapped;
}

/** Official getEntityPermissionById: GET /permissions/{resource}/{id}. */
export async function getEntityPermissionById(
  resource: string,
  entityId: string,
): Promise<ResourcePermission> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/permissions/${encodeURIComponent(resource)}/${encodeURIComponent(entityId)}`,
  );
  const mapped = mapResourcePermission(raw);
  if (!mapped) {
    throw new Error('Permission response was missing the resource');
  }
  return mapped;
}

/** Official getEntityPermissionByFqn: GET /permissions/{resource}/name/{fqn}. */
export async function getEntityPermissionByFqn(
  resource: string,
  entityFqn: string,
): Promise<ResourcePermission> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/permissions/${encodeURIComponent(resource)}/name/${encodeURIComponent(entityFqn)}`,
  );
  const mapped = mapResourcePermission(raw);
  if (!mapped) {
    throw new Error('Permission response was missing the resource');
  }
  return mapped;
}

/** Server GET /v1/permissions/view/{entityType}: field-level view operations. */
export function getEntityTypeFieldPermissions(
  entityType: string,
): Promise<Record<string, string>> {
  return apiRequest<Record<string, string>>(
    `/v1/permissions/view/${encodeURIComponent(entityType)}`,
  );
}

export interface PermissionDebugInfo {
  user?: unknown;
  directRoles?: unknown;
  teamPermissions?: unknown;
  inheritedPermissions?: unknown;
  summary?: unknown;
}

/** Server GET /v1/permissions/debug/me: debug for the current user. */
export function debugMyPermissions(): Promise<PermissionDebugInfo> {
  return apiRequest<PermissionDebugInfo>('/v1/permissions/debug/me');
}

/**
 * Server GET /v1/permissions/debug/user/{username}. The server only
 * allows another user's debug info to admins; callers surface a 403
 * as an honest error, never as empty data.
 */
export function debugUserPermissions(username: string): Promise<PermissionDebugInfo> {
  return apiRequest<PermissionDebugInfo>(
    `/v1/permissions/debug/user/${encodeURIComponent(username)}`,
  );
}

export interface DebugEvaluateQuery {
  user: string;
  resource: string;
  resourceId?: string;
  operation: string;
}

/** Server GET /v1/permissions/debug/evaluate?user&resource&resourceId&operation. */
export function debugEvaluatePermission(query: DebugEvaluateQuery): Promise<unknown> {
  return apiRequest<unknown>('/v1/permissions/debug/evaluate', {
    query: {
      user: query.user,
      resource: query.resource,
      resourceId: query.resourceId,
      operation: query.operation,
    },
  });
}
