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

/**
 * Upstream revokeEditPermissions (PermissionsUtils, ca4dc96d4f): for a
 * read-only entity (disabled or soft-deleted), revoke EVERY Edit* operation.
 * Revoking EditAll alone is not enough: derived flags prefer a field key
 * (EditDomains, EditDescription, …) over EditAll when it is present.
 * Delete is not an Edit* operation and is left unchanged.
 */
export function revokeEditPermissions(ops: OperationPermissions): OperationPermissions {
  const result: OperationPermissions = {};
  for (const [operation, granted] of Object.entries(ops)) {
    result[operation] = operation.startsWith('Edit') ? false : granted;
  }
  return result;
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

/**
 * Permission-debug types, mirroring official rest/permissionAPI.ts
 * (PermissionDebugInfo / PermissionEvaluationDebugInfo) against the
 * server policyevaluator classes of the same names: every list defaults
 * to [] and every scalar to its empty value, so a partial server
 * payload still renders instead of throwing mid-page.
 */
export interface DebugEntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  fullyQualifiedName?: string;
}

export interface DebugRuleInfo {
  name: string;
  effect: string;
  operations: string[];
  resources: string[];
  condition?: string;
  matches: boolean;
}

export interface DebugPolicyInfo {
  policy: DebugEntityRef;
  rules: DebugRuleInfo[];
  effect: string;
}

export interface DebugDirectRolePermission {
  role: DebugEntityRef;
  policies: DebugPolicyInfo[];
  source: string;
}

export interface DebugRolePermission {
  role: DebugEntityRef;
  policies: DebugPolicyInfo[];
  inheritedFrom: string;
  isDefaultRole: boolean;
}

export interface DebugTeamPermission {
  team: DebugEntityRef;
  teamHierarchy: DebugEntityRef[];
  rolePermissions: DebugRolePermission[];
  directPolicies: DebugPolicyInfo[];
  teamType: string;
  hierarchyLevel: number;
}

export interface DebugInheritedPermission {
  permissionType: string;
  source?: DebugEntityRef;
  policies: DebugPolicyInfo[];
  description: string;
}

export interface DebugPermissionSummary {
  totalRoles: number;
  totalPolicies: number;
  totalRules: number;
  directRoles: number;
  inheritedRoles: number;
  teamCount: number;
  maxHierarchyDepth: number;
  effectiveOperations: string[];
  deniedOperations: string[];
}

export interface PermissionDebugInfo {
  user: DebugEntityRef;
  directRoles: DebugDirectRolePermission[];
  teamPermissions: DebugTeamPermission[];
  inheritedPermissions: DebugInheritedPermission[];
  summary: DebugPermissionSummary;
}

export interface DebugConditionEvaluation {
  condition: string;
  result: boolean;
  evaluationDetails: string;
}

export interface DebugPolicyEvaluationStep {
  stepNumber: number;
  source: string;
  sourceEntity: DebugEntityRef;
  policy: DebugEntityRef;
  rule: string;
  effect: string;
  matched: boolean;
  matchReason: string;
  conditionEvaluations: DebugConditionEvaluation[];
}

export interface DebugEvaluationSummary {
  totalPoliciesEvaluated: number;
  totalRulesEvaluated: number;
  matchingRules: number;
  denyRules: number;
  allowRules: number;
  appliedPolicies: string[];
  reasonsForDecision: string[];
  evaluationTimeMs: number;
}

export interface PermissionEvaluationDebugInfo {
  user: DebugEntityRef;
  resource: string;
  resourceId?: string;
  operation: string;
  allowed: boolean;
  finalDecision: string;
  evaluationSteps: DebugPolicyEvaluationStep[];
  summary: DebugEvaluationSummary;
}

/**
 * Official AdminPermissionDebugger.constants.ts: the debugger's curated
 * resource list (not every entity type — only the resources the server
 * evaluates policies against) and operation list (the evaluation
 * operations, not the full MetadataOperation enum — task-scoped
 * operations such as ResolveTask and Impersonate are absent upstream).
 */
export const PERMISSION_DEBUG_RESOURCES = [
  'table',
  'database',
  'databaseSchema',
  'dashboard',
  'pipeline',
  'topic',
  'container',
  'mlmodel',
  'searchIndex',
  'glossary',
  'glossaryTerm',
  'tag',
  'policy',
  'role',
  'team',
  'user',
] as const;

export const PERMISSION_DEBUG_OPERATIONS = [
  'ViewAll',
  'ViewBasic',
  'ViewUsage',
  'ViewTests',
  'ViewQueries',
  'ViewDataProfile',
  'ViewSampleData',
  'ViewProfilerGlobalConfiguration',
  'ViewTestCaseFailedRowsSample',
  'Create',
  'CreateIngestionPipelineAutomator',
  'EditAll',
  'EditDescription',
  'EditDisplayName',
  'EditDomains',
  'EditLineage',
  'EditOwners',
  'EditCustomFields',
  'EditTags',
  'EditQueries',
  'EditDataProfile',
  'EditSampleData',
  'EditTests',
  'EditCertification',
  'EditEntityRelationship',
  'EditPolicy',
  'EditReviewers',
  'EditRole',
  'EditStatus',
  'EditGlossaryTerms',
  'EditTeams',
  'EditTier',
  'EditUsage',
  'EditUsers',
  'EditLifeCycle',
  'EditKnowledgePanel',
  'EditPage',
  'EditIngestionPipelineStatus',
  'Delete',
  'DeleteTestCaseFailedRowsSample',
  'Deploy',
  'Trigger',
  'Kill',
  'GenerateToken',
  'CreateScim',
  'EditScim',
  'DeleteScim',
  'ViewScim',
] as const;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function mapDebugEntityRef(raw: unknown): DebugEntityRef {
  const rec = asRecord(raw) ?? {};
  return {
    id: asString(rec.id) || undefined,
    name: asString(rec.name) || asString(rec.displayName),
    displayName: asString(rec.displayName) || undefined,
    type: asString(rec.type) || undefined,
    fullyQualifiedName: asString(rec.fullyQualifiedName) || undefined,
  };
}

function mapDebugRule(raw: unknown): DebugRuleInfo {
  const rec = asRecord(raw) ?? {};
  return {
    name: asString(rec.name),
    effect: asString(rec.effect),
    operations: asStringList(rec.operations),
    resources: asStringList(rec.resources),
    condition: asString(rec.condition) || undefined,
    matches: rec.matches === true,
  };
}

function mapDebugPolicy(raw: unknown): DebugPolicyInfo {
  const rec = asRecord(raw) ?? {};
  return {
    policy: mapDebugEntityRef(rec.policy),
    rules: Array.isArray(rec.rules) ? rec.rules.map(mapDebugRule) : [],
    effect: asString(rec.effect),
  };
}

function mapDebugPolicies(value: unknown): DebugPolicyInfo[] {
  return Array.isArray(value) ? value.map(mapDebugPolicy) : [];
}

function mapDebugSummary(raw: unknown): DebugPermissionSummary {
  const rec = asRecord(raw) ?? {};
  const num = (value: unknown): number =>
    typeof value === 'number' ? value : 0;
  return {
    totalRoles: num(rec.totalRoles),
    totalPolicies: num(rec.totalPolicies),
    totalRules: num(rec.totalRules),
    directRoles: num(rec.directRoles),
    inheritedRoles: num(rec.inheritedRoles),
    teamCount: num(rec.teamCount),
    maxHierarchyDepth: num(rec.maxHierarchyDepth),
    effectiveOperations: asStringList(rec.effectiveOperations),
    deniedOperations: asStringList(rec.deniedOperations),
  };
}

function mapDebugInfo(raw: unknown): PermissionDebugInfo {
  const rec = asRecord(raw) ?? {};
  const directRoles: DebugDirectRolePermission[] = Array.isArray(rec.directRoles)
    ? rec.directRoles.map((item) => {
        const r = asRecord(item) ?? {};
        return {
          role: mapDebugEntityRef(r.role),
          policies: mapDebugPolicies(r.policies),
          source: asString(r.source),
        };
      })
    : [];
  const teamPermissions: DebugTeamPermission[] = Array.isArray(rec.teamPermissions)
    ? rec.teamPermissions.map((item) => {
        const r = asRecord(item) ?? {};
        return {
          team: mapDebugEntityRef(r.team),
          teamHierarchy: Array.isArray(r.teamHierarchy)
            ? r.teamHierarchy.map(mapDebugEntityRef)
            : [],
          rolePermissions: Array.isArray(r.rolePermissions)
            ? r.rolePermissions.map((roleItem) => {
                const rp = asRecord(roleItem) ?? {};
                return {
                  role: mapDebugEntityRef(rp.role),
                  policies: mapDebugPolicies(rp.policies),
                  inheritedFrom: asString(rp.inheritedFrom),
                  isDefaultRole: rp.isDefaultRole === true,
                };
              })
            : [],
          directPolicies: mapDebugPolicies(r.directPolicies),
          teamType: asString(r.teamType),
          hierarchyLevel: typeof r.hierarchyLevel === 'number' ? r.hierarchyLevel : 0,
        };
      })
    : [];
  const inheritedPermissions: DebugInheritedPermission[] = Array.isArray(
    rec.inheritedPermissions,
  )
    ? rec.inheritedPermissions.map((item) => {
        const r = asRecord(item) ?? {};
        return {
          permissionType: asString(r.permissionType),
          source: r.source ? mapDebugEntityRef(r.source) : undefined,
          policies: mapDebugPolicies(r.policies),
          description: asString(r.description),
        };
      })
    : [];
  return {
    user: mapDebugEntityRef(rec.user),
    directRoles,
    teamPermissions,
    inheritedPermissions,
    summary: mapDebugSummary(rec.summary),
  };
}

function mapEvaluation(raw: unknown): PermissionEvaluationDebugInfo {
  const rec = asRecord(raw) ?? {};
  const summaryRec = asRecord(rec.summary) ?? {};
  const num = (value: unknown): number =>
    typeof value === 'number' ? value : 0;
  return {
    user: mapDebugEntityRef(rec.user),
    resource: asString(rec.resource),
    resourceId: asString(rec.resourceId) || undefined,
    operation: asString(rec.operation),
    allowed: rec.allowed === true,
    finalDecision: asString(rec.finalDecision),
    evaluationSteps: Array.isArray(rec.evaluationSteps)
      ? rec.evaluationSteps.map((item) => {
          const s = asRecord(item) ?? {};
          return {
            stepNumber: num(s.stepNumber),
            source: asString(s.source),
            sourceEntity: mapDebugEntityRef(s.sourceEntity),
            policy: mapDebugEntityRef(s.policy),
            rule: asString(s.rule),
            effect: asString(s.effect),
            matched: s.matched === true,
            matchReason: asString(s.matchReason),
            conditionEvaluations: Array.isArray(s.conditionEvaluations)
              ? s.conditionEvaluations.map((cond) => {
                  const c = asRecord(cond) ?? {};
                  return {
                    condition: asString(c.condition),
                    result: c.result === true,
                    evaluationDetails: asString(c.evaluationDetails),
                  };
                })
              : [],
          };
        })
      : [],
    summary: {
      totalPoliciesEvaluated: num(summaryRec.totalPoliciesEvaluated),
      totalRulesEvaluated: num(summaryRec.totalRulesEvaluated),
      matchingRules: num(summaryRec.matchingRules),
      denyRules: num(summaryRec.denyRules),
      allowRules: num(summaryRec.allowRules),
      appliedPolicies: asStringList(summaryRec.appliedPolicies),
      reasonsForDecision: asStringList(summaryRec.reasonsForDecision),
      evaluationTimeMs: num(summaryRec.evaluationTimeMs),
    },
  };
}

/** Server GET /v1/permissions/debug/me: debug for the current user. */
export async function debugMyPermissions(): Promise<PermissionDebugInfo> {
  const raw = await apiRequest<unknown>('/v1/permissions/debug/me');
  return mapDebugInfo(raw);
}

/**
 * Server GET /v1/permissions/debug/user/{username}. The server only
 * allows another user's debug info to admins; callers surface a 403
 * as an honest error, never as empty data.
 */
export async function debugUserPermissions(username: string): Promise<PermissionDebugInfo> {
  const raw = await apiRequest<unknown>(
    `/v1/permissions/debug/user/${encodeURIComponent(username)}`,
  );
  return mapDebugInfo(raw);
}

export interface DebugEvaluateQuery {
  user: string;
  resource: string;
  resourceId?: string;
  operation: string;
}

/** Server GET /v1/permissions/debug/evaluate?user&resource&resourceId&operation. */
export async function debugEvaluatePermission(
  query: DebugEvaluateQuery,
): Promise<PermissionEvaluationDebugInfo> {
  const raw = await apiRequest<unknown>('/v1/permissions/debug/evaluate', {
    query: {
      user: query.user,
      resource: query.resource,
      resourceId: query.resourceId,
      operation: query.operation,
    },
  });
  return mapEvaluation(raw);
}
