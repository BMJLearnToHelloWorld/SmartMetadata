/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OperationPermissions } from '@/api/permissions';
import {
  RESOURCE_KEY_BY_ENTITY,
  SERVICE_RESOURCE_KEYS,
  canCreateAnyServiceCategory,
  evaluatePermissionRule,
  filterVisibleSettingsItems,
  isLoginConfigVisible,
  isLoginConfigurationApplicable,
  loadAuthProvider,
  resetAuthProviderCache,
  type PermissionRule,
  type PermissionRuleContext,
} from './permissionRules';

describe('resource key map (§11.3)', () => {
  it('maps every pin ResourceEntity to its permission-API key', () => {
    expect(RESOURCE_KEY_BY_ENTITY).toEqual({
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
      TEST_SUITE: 'testSuite',
      TEST_CASE: 'testCase',
      TEST_DEFINITION: 'testDefinition',
    });
  });

  it('covers exactly the eleven classic service resources for the add-service button', () => {
    expect(SERVICE_RESOURCE_KEYS).toEqual([
      'databaseService',
      'messagingService',
      'dashboardService',
      'pipelineService',
      'mlmodelService',
      'metadataService',
      'storageService',
      'searchService',
      'apiService',
      'securityService',
      'driveService',
    ]);
    expect(SERVICE_RESOURCE_KEYS).not.toContain('llmService');
    expect(SERVICE_RESOURCE_KEYS).not.toContain('mcpService');
  });
});

describe('login-configuration provider gate (§11.2)', () => {
  it('applies only to basic, ldap and openmetadata (route semantics)', () => {
    expect(isLoginConfigurationApplicable('basic')).toBe(true);
    expect(isLoginConfigurationApplicable('ldap')).toBe(true);
    expect(isLoginConfigurationApplicable('openmetadata')).toBe(true);
    expect(isLoginConfigurationApplicable('google')).toBe(false);
    expect(isLoginConfigurationApplicable('saml')).toBe(false);
    expect(isLoginConfigurationApplicable('okta')).toBe(false);
    expect(isLoginConfigurationApplicable(undefined)).toBe(false);
    expect(isLoginConfigurationApplicable(null)).toBe(false);
    expect(isLoginConfigurationApplicable('')).toBe(false);
  });

  it('normalizes case and whitespace before comparing', () => {
    expect(isLoginConfigurationApplicable(' Basic ')).toBe(true);
    expect(isLoginConfigurationApplicable('LDAP')).toBe(true);
  });

  it('fails open in the menu when the provider is unknown', () => {
    expect(isLoginConfigVisible(undefined)).toBe(true);
    expect(isLoginConfigVisible('basic')).toBe(true);
    expect(isLoginConfigVisible('google')).toBe(false);
    expect(isLoginConfigVisible('saml')).toBe(false);
  });

  it('caches the provider load for the session and retries after failure', async () => {
    resetAuthProviderCache();
    try {
      const fetcher = vi.fn(async () => ({ provider: ' basic ' }));
      await expect(loadAuthProvider(fetcher)).resolves.toBe('basic');
      await expect(loadAuthProvider(fetcher)).resolves.toBe('basic');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      resetAuthProviderCache();
    }
  });

  it('resolves undefined on load failure and does not cache the failure', async () => {
    resetAuthProviderCache();
    try {
      const failing = vi.fn(async () => {
        throw new Error('unreachable');
      });
      await expect(loadAuthProvider(failing)).resolves.toBeUndefined();
      const succeeding = vi.fn(async () => ({ provider: 'ldap' }));
      await expect(loadAuthProvider(succeeding)).resolves.toBe('ldap');
      expect(failing).toHaveBeenCalledTimes(1);
      expect(succeeding).toHaveBeenCalledTimes(1);
    } finally {
      resetAuthProviderCache();
    }
  });
});

function ctx(
  overrides: Partial<PermissionRuleContext> & {
    ops?: Record<string, OperationPermissions | null>;
  } = {},
): PermissionRuleContext {
  const { ops = {}, ...rest } = overrides;
  return {
    isAdminUser: false,
    getResourceOps: async (key) => ops[key] ?? null,
    ...rest,
  };
}

describe('permission rules (§11.1)', () => {
  it('evaluates admin and always', async () => {
    await expect(evaluatePermissionRule({ kind: 'admin' }, ctx({ isAdminUser: true }))).resolves.toBe(
      true,
    );
    await expect(evaluatePermissionRule({ kind: 'admin' }, ctx())).resolves.toBe(false);
    await expect(evaluatePermissionRule({ kind: 'always' }, ctx())).resolves.toBe(true);
  });

  it('evaluates view(resource) on ViewAll or ViewBasic, failing closed', async () => {
    const rule: PermissionRule = { kind: 'view', resource: 'ROLE' };
    await expect(evaluatePermissionRule(rule, ctx({ ops: { role: { ViewAll: true } } }))).resolves.toBe(
      true,
    );
    await expect(evaluatePermissionRule(rule, ctx({ ops: { role: { ViewBasic: true } } }))).resolves.toBe(
      true,
    );
    await expect(evaluatePermissionRule(rule, ctx({ ops: { role: { EditAll: true } } }))).resolves.toBe(
      false,
    );
    await expect(evaluatePermissionRule(rule, ctx({ ops: { role: null } }))).resolves.toBe(false);
    await expect(
      evaluatePermissionRule(
        rule,
        ctx({ getResourceOps: async () => { throw new Error('down'); } }),
      ),
    ).resolves.toBe(false);
  });

  it('evaluates auditOrAdmin on the admin line or the AuditLogs operation', async () => {
    const rule: PermissionRule = { kind: 'auditOrAdmin' };
    await expect(evaluatePermissionRule(rule, ctx({ isAdminUser: true }))).resolves.toBe(true);
    await expect(
      evaluatePermissionRule(rule, ctx({ ops: { auditLog: { AuditLogs: true } } })),
    ).resolves.toBe(true);
    await expect(
      evaluatePermissionRule(rule, ctx({ ops: { auditLog: { ViewAll: true } } })),
    ).resolves.toBe(false);
  });

  it('evaluates loginConfig as admin plus menu-visible provider', async () => {
    const rule: PermissionRule = { kind: 'loginConfig' };
    await expect(
      evaluatePermissionRule(rule, ctx({ isAdminUser: true, authProvider: 'basic' })),
    ).resolves.toBe(true);
    await expect(
      evaluatePermissionRule(rule, ctx({ isAdminUser: true, authProvider: undefined })),
    ).resolves.toBe(true);
    await expect(
      evaluatePermissionRule(rule, ctx({ isAdminUser: true, authProvider: 'google' })),
    ).resolves.toBe(false);
    await expect(
      evaluatePermissionRule(rule, ctx({ isAdminUser: false, authProvider: 'basic' })),
    ).resolves.toBe(false);
  });
});

describe('two-stage Hub filter (§5.2)', () => {
  interface Item {
    key: string;
    permissionRule?: PermissionRule;
    items?: Item[];
  }

  const tree: Item[] = [
    { key: 'admin-only', permissionRule: { kind: 'admin' } },
    { key: 'always', permissionRule: { kind: 'always' } },
    {
      key: 'parent',
      items: [
        { key: 'child-admin', permissionRule: { kind: 'admin' } },
        { key: 'child-always', permissionRule: { kind: 'always' } },
      ],
    },
    {
      key: 'empty-parent',
      items: [{ key: 'child-admin', permissionRule: { kind: 'admin' } }],
    },
    { key: 'leaf-no-rule' },
  ];

  it('lets a defined rule win and shows a parent when any child is visible', async () => {
    const visible = await filterVisibleSettingsItems(tree, ctx());
    expect(visible.map((item) => item.key)).toEqual(['always', 'parent']);
    expect(visible[1].items?.map((item) => item.key)).toEqual(['child-always']);
  });

  it('hides a parent with no visible children and a rule-less leaf', async () => {
    const visible = await filterVisibleSettingsItems(tree, ctx({ isAdminUser: true }));
    expect(visible.map((item) => item.key)).toEqual([
      'admin-only',
      'always',
      'parent',
      'empty-parent',
    ]);
    expect(visible[2].items?.map((item) => item.key)).toEqual(['child-admin', 'child-always']);
    // A rule-less leaf has no children, so it stays hidden even for admins.
    expect(visible.some((item) => item.key === 'leaf-no-rule')).toBe(false);
  });
});

describe('canCreateAnyServiceCategory (§6.4)', () => {
  it('is true when any classic service resource grants Create', async () => {
    const getResourceOps = async (key: string): Promise<OperationPermissions | null> =>
      key === 'pipelineService' ? { Create: true } : { ViewAll: true };
    await expect(canCreateAnyServiceCategory(getResourceOps)).resolves.toBe(true);
  });

  it('is false when no resource grants Create and when fetches fail', async () => {
    await expect(canCreateAnyServiceCategory(async () => ({ ViewAll: true }))).resolves.toBe(false);
    await expect(
      canCreateAnyServiceCategory(async () => {
        throw new Error('down');
      }),
    ).resolves.toBe(false);
  });

  it('queries exactly the eleven classic service resources', async () => {
    const seen: string[] = [];
    await canCreateAnyServiceCategory(async (key) => {
      seen.push(key);
      return null;
    });
    expect(seen.sort()).toEqual([...SERVICE_RESOURCE_KEYS].sort());
  });
});

afterEach(() => {
  resetAuthProviderCache();
});
