/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  PERMISSION_DEBUG_OPERATIONS,
  PERMISSION_DEBUG_RESOURCES,
  debugEvaluatePermission,
  debugMyPermissions,
  debugUserPermissions,
  getEntityPermissionByFqn,
  getEntityPermissionById,
  getEntityTypeFieldPermissions,
  getLoggedInUserPermissions,
  getResourcePermission,
  permissionFlags,
  revokeEditPermissions,
  toOperationPermissions,
} from './permissions';

function lastFetchUrl(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('permissions API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists logged-in user permissions from GET /v1/permissions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              resource: 'eventsubscription',
              permissions: [
                { operation: 'Create', access: 'allow' },
                { operation: 'Delete', access: 'deny' },
              ],
            },
          ],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await getLoggedInUserPermissions();
    expect(lastFetchUrl()).toContain('/api/v1/permissions?limit=100');
    expect(page.data[0]?.resource).toBe('eventsubscription');
    expect(toOperationPermissions(page.data[0])).toEqual({ Create: true, Delete: false });
  });

  it('reads a resource permission from GET /v1/permissions/{resource}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ resource: 'team', permissions: [{ operation: 'ViewAll', access: 'allow' }] })),
    );
    const permission = await getResourcePermission('team');
    expect(lastFetchUrl()).toContain('/api/v1/permissions/team');
    expect(permission.permissions[0]?.operation).toBe('ViewAll');
  });

  it('reads an entity permission by id from GET /v1/permissions/{resource}/{id}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ resource: 'ingestionPipeline', permissions: [] })),
    );
    await getEntityPermissionById('ingestionPipeline', 'pipe-1');
    expect(lastFetchUrl()).toContain('/api/v1/permissions/ingestionPipeline/pipe-1');
  });

  it('reads an entity permission by fqn from GET /v1/permissions/{resource}/name/{fqn}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ resource: 'eventsubscription', permissions: [{ operation: 'Delete', access: 'allow' }] })),
    );
    const permission = await getEntityPermissionByFqn('eventsubscription', 'svc.pipe');
    expect(lastFetchUrl()).toContain('/api/v1/permissions/eventsubscription/name/svc.pipe');
    expect(permissionFlags(toOperationPermissions(permission)).canDelete).toBe(true);
  });

  it('reads field-level view operations from GET /v1/permissions/view/{entityType}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ description: 'ViewAll' })));
    const fields = await getEntityTypeFieldPermissions('table');
    expect(lastFetchUrl()).toContain('/api/v1/permissions/view/table');
    expect(fields.description).toBe('ViewAll');
  });

  it('debugs permissions via /debug/me and /debug/evaluate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: { name: 'admin' } })));
    await debugMyPermissions();
    expect(lastFetchUrl()).toContain('/api/v1/permissions/debug/me');
    await debugEvaluatePermission({ user: 'admin', resource: 'table', operation: 'ViewAll' });
    expect(lastFetchUrl()).toContain('/api/v1/permissions/debug/evaluate');
    expect(lastFetchUrl()).toContain('user=admin');
    expect(lastFetchUrl()).toContain('operation=ViewAll');
  });

  it('maps a nested user debug payload into typed sections with safe defaults', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          user: { id: 'u1', name: 'bob', displayName: 'Bob' },
          directRoles: [
            {
              role: { id: 'r1', name: 'DataConsumer' },
              policies: [
                {
                  policy: { id: 'p1', name: 'DataConsumerPolicy' },
                  effect: 'ALLOW',
                  rules: [{ name: 'ViewData', effect: 'ALLOW', operations: ['ViewAll'], resources: ['table'] }],
                },
              ],
            },
          ],
          teamPermissions: [],
          inheritedPermissions: [],
          summary: { totalRoles: 1, totalPolicies: 1, totalRules: 1, effectiveOperations: ['ViewAll'] },
        }),
      ),
    );
    const info = await debugUserPermissions('bob');
    expect(lastFetchUrl()).toContain('/api/v1/permissions/debug/user/bob');
    expect(info.user.name).toBe('bob');
    expect(info.directRoles[0]?.policies[0]?.rules[0]?.operations).toEqual(['ViewAll']);
    expect(info.directRoles[0]?.policies[0]?.rules[0]?.matches).toBe(false);
    expect(info.teamPermissions).toEqual([]);
    expect(info.summary.totalRoles).toBe(1);
    expect(info.summary.deniedOperations).toEqual([]);
  });

  it('maps an evaluation payload into the typed decision shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          user: { name: 'bob' },
          resource: 'table',
          operation: 'ViewAll',
          allowed: false,
          finalDecision: 'DENIED',
          evaluationSteps: [
            {
              stepNumber: 1,
              source: 'DIRECT_ROLE',
              sourceEntity: { name: 'DataConsumer' },
              policy: { name: 'DataConsumerPolicy' },
              rule: 'ViewData',
              effect: 'DENY',
              matched: true,
              matchReason: 'Deny wins',
              conditionEvaluations: [],
            },
          ],
          summary: { totalPoliciesEvaluated: 1, reasonsForDecision: ['Deny wins'] },
        }),
      ),
    );
    const evaluation = await debugEvaluatePermission({ user: 'bob', resource: 'table', operation: 'ViewAll' });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.evaluationSteps[0]?.effect).toBe('DENY');
    expect(evaluation.summary.reasonsForDecision).toEqual(['Deny wins']);
    expect(evaluation.summary.matchingRules).toBe(0);
  });

  it('keeps the debugger selects on the official curated lists', () => {
    expect(PERMISSION_DEBUG_RESOURCES).toContain('table');
    expect(PERMISSION_DEBUG_OPERATIONS).toContain('ViewAll');
    expect(PERMISSION_DEBUG_OPERATIONS).not.toContain('ResolveTask');
    expect(PERMISSION_DEBUG_OPERATIONS).not.toContain('Impersonate');
  });

  it('treats conditionalAllow as denied under the strict translation', () => {
    const ops = toOperationPermissions({
      resource: 'table',
      permissions: [
        { operation: 'EditAll', access: 'conditionalAllow' },
        { operation: 'ViewAll', access: 'allow' },
      ],
    });
    expect(ops).toEqual({ EditAll: false, ViewAll: true });
    expect(toOperationPermissions(
      { resource: 'table', permissions: [{ operation: 'EditAll', access: 'conditionalAllow' }] },
      true,
    )).toEqual({ EditAll: true });
  });
});

describe('revokeEditPermissions (upstream ca4dc96d4f)', () => {
  it('revokes field-level edits that derived flags prefer over EditAll', () => {
    const revoked = revokeEditPermissions({
      EditAll: true,
      EditDomains: true,
      EditDescription: true,
      EditOwners: true,
      ViewAll: true,
      Delete: true,
    });
    expect(revoked).toEqual({
      EditAll: false,
      EditDomains: false,
      EditDescription: false,
      EditOwners: false,
      ViewAll: true,
      Delete: true,
    });
    expect(permissionFlags(revoked).canEditAll).toBe(false);
    expect(permissionFlags(revoked).canDelete).toBe(true);
  });

  it('leaves non-Edit operations and an empty map untouched', () => {
    expect(revokeEditPermissions({ ViewAll: true, Create: true })).toEqual({
      ViewAll: true,
      Create: true,
    });
    expect(revokeEditPermissions({})).toEqual({});
  });
});
