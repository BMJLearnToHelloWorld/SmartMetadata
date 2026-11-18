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
 * Settings permission evaluation (DESIGN §11). The Settings Hub
 * registry (settings/registry.ts) and the route guard (router/guards.ts)
 * both consume this module; it is the single home of the resource
 * key map, the permission-rule kinds, the login-configuration
 * provider gate, and the two-stage Hub filter semantics.
 *
 * Resource keys (DESIGN §11.3) were verified key-by-key at pin
 * a3012259ca against the official UI enums, the server
 * `Entity.java` constants (openmetadata-service), and the
 * product's existing GET /v1/permissions/{resource} call sites.
 * `llmService` and `mcpService` are genuine pin entity values:
 * the pin `EntityType` enum (openmetadata-ui
 * enums/entity.enum.ts:35-36) and `Entity.java:180-181` both
 * carry them. What pin lacks for llm/mcp is the category
 * mapping, the registry cards, and segment validation — and
 * because the pin `ResourceEntity` permission enum
 * (enums/permissions.enum.ts) omits them, pin's
 * category-to-resource map has no llm/mcp entries and pin detail
 * permission evaluation falls back to DATABASE_SERVICE
 * (ServicePureUtils.ts `getResourceEntityFromServiceCategory`).
 * The product evaluates detail permissions against the
 * llmService/mcpService keys directly and never takes the
 * DATABASE fallback (C-2).
 *
 * The login-configuration gate (§11.2) deliberately does NOT reuse
 * the login surface's "missing means basic" rule
 * (supportsPasswordLogin): official gates the login-configuration
 * settings page on the provider being basic/ldap/openmetadata
 * (AuthProvider.util.ts isLoginConfigurationApplicable), the menu
 * fails open when the provider is undefined (not yet loaded), and the
 * route fails closed to 404.
 */
import { permissionFlags, type OperationPermissions } from '@/api/permissions';
import { fetchAuthConfig } from '@/api/system';
import { normalizeAuthProvider } from '@/admin/authProvider';

/** Permission-resource name → GET /v1/permissions/{resource} key. All rows
 * but two are pin `ResourceEntity` names (enums/permissions.enum.ts);
 * `LLM_SERVICE`/`MCP_SERVICE` are pin `EntityType` names only
 * (enums/entity.enum.ts:35-36): pin's `ResourceEntity` enum omits them, so
 * pin's category-to-resource map falls back to DATABASE_SERVICE for an
 * unmapped category while the product evaluates these two keys directly
 * (C-2). The `ResourceEntityName` type name below is a product-internal
 * identifier for this map's keys, not a claim that every key is a pin
 * `ResourceEntity` member. */
export const RESOURCE_KEY_BY_ENTITY = {
  USER: 'user',
  TEAM: 'team',
  ROLE: 'role',
  POLICY: 'policy',
  BOT: 'bot',
  APPLICATION: 'app',
  AUDIT_LOG: 'auditLog',
  EVENT_SUBSCRIPTION: 'eventsubscription',
  DATABASE_SERVICE: 'databaseService',
  MESSAGING_SERVICE: 'messagingService',
  DASHBOARD_SERVICE: 'dashboardService',
  PIPELINE_SERVICE: 'pipelineService',
  ML_MODEL_SERVICE: 'mlmodelService',
  METADATA_SERVICE: 'metadataService',
  STORAGE_SERVICE: 'storageService',
  SEARCH_SERVICE: 'searchService',
  API_SERVICE: 'apiService',
  SECURITY_SERVICE: 'securityService',
  DRIVE_SERVICE: 'driveService',
  LLM_SERVICE: 'llmService',
  MCP_SERVICE: 'mcpService',
} as const;

export type ResourceEntityName = keyof typeof RESOURCE_KEY_BY_ENTITY;

/** The eleven classic service entities (C-2: llm/mcp excluded). */
export const SERVICE_ENTITIES = [
  'DATABASE_SERVICE',
  'MESSAGING_SERVICE',
  'DASHBOARD_SERVICE',
  'PIPELINE_SERVICE',
  'ML_MODEL_SERVICE',
  'METADATA_SERVICE',
  'STORAGE_SERVICE',
  'SEARCH_SERVICE',
  'API_SERVICE',
  'SECURITY_SERVICE',
  'DRIVE_SERVICE',
] as const satisfies readonly ResourceEntityName[];

export const SERVICE_RESOURCE_KEYS: readonly string[] = SERVICE_ENTITIES.map(
  (entity) => RESOURCE_KEY_BY_ENTITY[entity],
);

/** Auth providers for which login configuration applies (pin-exact). */
const LOGIN_CONFIGURATION_PROVIDERS = new Set(['basic', 'ldap', 'openmetadata']);

/**
 * Route semantics: the provider must be one of basic/ldap/
 * openmetadata. An unknown provider (undefined) is NOT applicable —
 * the route fails closed. Never reuse supportsPasswordLogin here.
 */
export function isLoginConfigurationApplicable(provider?: string | null): boolean {
  return LOGIN_CONFIGURATION_PROVIDERS.has(normalizeAuthProvider(provider));
}

/**
 * Menu semantics (official GlobalSettingsClassBase): the entry is
 * visible when the provider is unknown (`undefined`, e.g. the auth
 * configuration has not loaded or failed to load) or applicable.
 * The undefined check is pin-exact; a known inapplicable provider
 * hides the entry.
 */
export function isLoginConfigVisible(provider?: string | null): boolean {
  return provider === undefined || isLoginConfigurationApplicable(provider);
}

let cachedAuthProvider: Promise<string | undefined> | null = null;

/**
 * Session-singleton auth-provider load for the settings guards and
 * the Hub menu. A failed load is not cached (the next call retries)
 * and resolves to undefined, which the menu treats as visible and
 * the route treats as not applicable.
 */
export function loadAuthProvider(
  fetcher: () => Promise<{ provider?: string }> = fetchAuthConfig,
): Promise<string | undefined> {
  cachedAuthProvider ??= fetcher()
    .then((config) => {
      const provider = normalizeAuthProvider(config.provider);
      return provider === '' ? undefined : provider;
    })
    .catch(() => {
      cachedAuthProvider = null;
      return undefined;
    });
  return cachedAuthProvider;
}

/** Test-only reset for the session-singleton provider cache. */
export function resetAuthProviderCache(): void {
  cachedAuthProvider = null;
}

/** Permission-rule kinds (DESIGN §11.1). */
export type PermissionRule =
  | { kind: 'admin' }
  | { kind: 'always' }
  | { kind: 'view'; resource: ResourceEntityName }
  | { kind: 'auditOrAdmin' }
  | { kind: 'loginConfig' };

export interface PermissionRuleContext {
  isAdminUser: boolean;
  /** Unknown (undefined) when the auth configuration is unavailable. */
  authProvider?: string | null;
  getResourceOps: (
    resourceKey: string,
  ) => Promise<OperationPermissions | null | undefined>;
}

async function safeResourceOps(
  ctx: PermissionRuleContext,
  resourceKey: string,
): Promise<OperationPermissions | null | undefined> {
  try {
    return await ctx.getResourceOps(resourceKey);
  } catch {
    return null;
  }
}

const RULE_EVALUATORS: Record<
  PermissionRule['kind'],
  (
    rule: PermissionRule,
    ctx: PermissionRuleContext,
  ) => Promise<boolean>
> = {
  admin: async (_rule, ctx) => ctx.isAdminUser,
  always: async () => true,
  view: async (rule, ctx) => {
    if (rule.kind !== 'view') {
      return false;
    }
    const ops = await safeResourceOps(ctx, RESOURCE_KEY_BY_ENTITY[rule.resource]);
    return ops !== null && ops !== undefined && permissionFlags(ops).hasViewAccess;
  },
  auditOrAdmin: async (_rule, ctx) => {
    if (ctx.isAdminUser) {
      return true;
    }
    const ops = await safeResourceOps(ctx, RESOURCE_KEY_BY_ENTITY.AUDIT_LOG);
    return ops?.AuditLogs === true;
  },
  loginConfig: async (_rule, ctx) =>
    ctx.isAdminUser && isLoginConfigVisible(ctx.authProvider),
};

/** Evaluates one permission rule; a failed fetch fails closed. */
export function evaluatePermissionRule(
  rule: PermissionRule,
  ctx: PermissionRuleContext,
): Promise<boolean> {
  return RULE_EVALUATORS[rule.kind](rule, ctx);
}

/**
 * Two-stage Hub filter (DESIGN §5.2, mirroring the official
 * GlobalSettingsClassBase filtering): a defined permission rule
 * wins outright; an item without a rule is visible when any of its
 * children is visible. Items keep their identity and order; an
 * item's children are replaced by their visible subset.
 */
export async function filterVisibleSettingsItems<
  T extends { permissionRule?: PermissionRule; items?: readonly T[] },
>(items: readonly T[], ctx: PermissionRuleContext): Promise<T[]> {
  const evaluated = await Promise.all(
    items.map(async (item) => {
      const visibleChildren =
        item.items === undefined
          ? undefined
          : await filterVisibleSettingsItems(item.items, ctx);
      const visible =
        item.permissionRule !== undefined
          ? await evaluatePermissionRule(item.permissionRule, ctx)
          : visibleChildren !== undefined && visibleChildren.length > 0;
      return { item, visibleChildren, visible };
    }),
  );
  return evaluated
    .filter((entry) => entry.visible)
    .map((entry) =>
      entry.visibleChildren === undefined
        ? entry.item
        : { ...entry.item, items: entry.visibleChildren },
    );
}

/**
 * Whether the principal can create at least one of the eleven
 * classic service categories (DESIGN §6.4 add-service button;
 * official canCreateAnyServiceCategory over the same eleven
 * resources). A failed fetch counts as no grant.
 */
export async function canCreateAnyServiceCategory(
  getResourceOps: PermissionRuleContext['getResourceOps'],
): Promise<boolean> {
  const results = await Promise.all(
    SERVICE_RESOURCE_KEYS.map(async (resourceKey) => {
      try {
        const ops = await getResourceOps(resourceKey);
        return ops !== null && ops !== undefined && permissionFlags(ops).canCreate;
      } catch {
        return false;
      }
    }),
  );
  return results.some(Boolean);
}
