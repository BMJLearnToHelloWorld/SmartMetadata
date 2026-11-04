/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type {
  AppConfiguration,
  AssetTypeConfiguration,
  AuthConfiguration,
  EmailConfiguration,
  EntityRulesSettings,
  GlossarySettings,
  LineageSettings,
  LoginConfiguration,
  OmBaseUrlConfiguration,
  Paged,
  ProfilerConfiguration,
  SearchSettings,
  SemanticsRule,
  ServerVersion,
  SystemSetting,
  SystemValidationResponse,
  StepValidation,
  UiThemePreference,
} from '@/types/admin';
import { apiRequest } from './client';

/** Preference SettingsTypes the product Preferences UI may PUT. */
export const EDITABLE_SETTING_TYPES = new Set([
  'loginConfiguration',
  'emailConfiguration',
  'customUiThemePreference',
  'searchSettings',
  'profilerConfiguration',
  'lineageSettings',
  'openMetadataBaseUrlConfiguration',
  'glossarySettings',
  'entityRulesSettings',
  'appConfiguration',
]);

function mapAuth(raw: unknown): AuthConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    provider: asString(rec.provider) || undefined,
    providerName: asString(rec.providerName) || undefined,
    clientType: asString(rec.clientType) || undefined,
    enableSelfSignup: asBoolean(rec.enableSelfSignup),
    enableAutoRedirect: asBoolean(rec.enableAutoRedirect),
    clientId: asString(rec.clientId) || undefined,
    authority: asString(rec.authority) || undefined,
    callbackUrl: asString(rec.callbackUrl) || undefined,
  };
}

function mapLogin(raw: unknown): LoginConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    maxLoginFailAttempts: asNumber(rec.maxLoginFailAttempts),
    accessBlockTime: asNumber(rec.accessBlockTime),
    jwtTokenExpiryTime: asNumber(rec.jwtTokenExpiryTime),
  };
}

function mapEmail(raw: unknown): EmailConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    emailingEntity: asString(rec.emailingEntity) || undefined,
    supportUrl: asString(rec.supportUrl) || undefined,
    enableSmtpServer: asBoolean(rec.enableSmtpServer),
    senderMail: asString(rec.senderMail) || undefined,
    serverEndpoint: asString(rec.serverEndpoint) || undefined,
    serverPort: asNumber(rec.serverPort),
    username: asString(rec.username) || undefined,
    password: asString(rec.password) || undefined,
    transportationStrategy: asString(rec.transportationStrategy) || undefined,
    templates: asString(rec.templates) || undefined,
  };
}

function mapStep(raw: unknown): StepValidation | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  return {
    description: asString(rec.description) || undefined,
    passed: asBoolean(rec.passed),
    message: asString(rec.message) || undefined,
  };
}

function mapSetting(raw: Record<string, unknown>): SystemSetting | null {
  const configType = asString(raw.configType) || asString(raw.config_type);
  if (!configType) {
    return null;
  }
  return {
    configType,
    configValue: raw.configValue !== undefined ? raw.configValue : raw.config_value,
  };
}

export function fetchAuthConfig(): Promise<AuthConfiguration> {
  return apiRequest<unknown>('/v1/system/config/auth', { auth: false }).then(mapAuth);
}

export function fetchLoginConfig(): Promise<LoginConfiguration> {
  return apiRequest<unknown>('/v1/system/config/loginConfig').then(mapLogin);
}

export function fetchServerVersion(): Promise<ServerVersion> {
  return apiRequest<unknown>('/v1/system/version').then((raw) => {
    const rec = asRecord(raw) ?? {};
    return {
      version: asString(rec.version) || undefined,
      revision: asString(rec.revision) || undefined,
      timestamp: asNumber(rec.timestamp),
    };
  });
}

export function fetchSystemStatus(): Promise<SystemValidationResponse> {
  return apiRequest<unknown>('/v1/system/status').then((raw) => {
    const rec = asRecord(raw) ?? {};
    return {
      database: mapStep(rec.database),
      searchInstance: mapStep(rec.searchInstance),
      pipelineServiceClient: mapStep(rec.pipelineServiceClient),
      jwks: mapStep(rec.jwks),
      migrations: mapStep(rec.migrations),
      logStorage: mapStep(rec.logStorage),
    };
  });
}

export function listSettings(): Promise<Paged<SystemSetting>> {
  return apiRequest<unknown>('/v1/system/settings').then((payload) => parsePaged(payload, mapSetting));
}

export async function getSetting(name: string): Promise<SystemSetting> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/system/settings/${encodeURIComponent(name)}`,
  );
  const mapped = mapSetting(raw);
  if (!mapped) {
    throw new Error(`Setting "${name}" was missing config_type`);
  }
  return mapped;
}

export function updateSetting(configType: string, configValue: unknown): Promise<SystemSetting> {
  return apiRequest<Record<string, unknown>>('/v1/system/settings', {
    method: 'PUT',
    json: { config_type: configType, config_value: configValue },
  }).then((raw) => {
    const mapped = mapSetting(raw);
    if (!mapped) {
      return { configType, configValue };
    }
    return mapped;
  });
}

export interface SsoAuthConfiguration {
  provider?: string;
  providerName?: string;
  clientType?: string;
  authority?: string;
  clientId?: string;
  callbackUrl?: string;
  enableSelfSignup?: boolean;
}

/** Defensive mapping of the authenticationConfiguration object. */
export function mapSsoAuthConfiguration(value: unknown): SsoAuthConfiguration {
  const rec = asRecord(value) ?? {};
  const str = (key: string): string | undefined => {
    const v = asString(rec[key]);
    return v ? v : undefined;
  };
  return {
    provider: str('provider'),
    providerName: str('providerName'),
    clientType: str('clientType'),
    authority: str('authority'),
    clientId: str('clientId'),
    callbackUrl: str('callbackUrl'),
    enableSelfSignup: asBoolean(rec.enableSelfSignup),
  };
}

/**
 * Official securityConfigAPI: GET /v1/system/security/config, whose
 * authenticationConfiguration object is the SSO page's source of truth.
 */
export async function getSecurityConfig(): Promise<{ authenticationConfiguration?: SsoAuthConfiguration }> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/system/security/config');
  const auth = asRecord(raw.authenticationConfiguration);
  return { authenticationConfiguration: auth ? mapSsoAuthConfiguration(auth) : undefined };
}

/**
 * Official securityConfigAPI.patchSecurityConfiguration: JSON Patch on the
 * whole SecurityConfiguration document at /v1/system/security/config.
 * Paths are rooted at /authenticationConfiguration/... (or
 * /authorizerConfiguration/...). An absent secret op means "keep the
 * server value": the server masks stored secrets
 * (preserveMaskedSecuritySecrets), so sending an empty secret would
 * clear it — callers must omit the op instead. 204 No Content on success.
 * NOTE: the settings endpoint (/v1/system/settings/...) refuses auth config
 * by design (SystemResource guard, also present upstream); it must not be
 * used for SSO saves.
 */
export function patchSecurityConfiguration(ops: JsonPatchOp[]): Promise<void> {
  return apiRequest<void>('/v1/system/security/config', {
    method: 'PATCH',
    json: ops,
    contentType: 'application/json-patch+json',
  });
}

/** Deployment-ownership info for the authenticationConfiguration setting. */
export interface SettingsSourceInfo {
  authenticationEditable: boolean;
  authenticationManagedPaths: string[];
}

/**
 * GET /v1/system/settings/source: for each dual-source setting, its source
 * and the fields the deployment owns. managedPaths are JSON pointers inside
 * the setting document (e.g. /provider); editable is false when the
 * deployment owns every field of the setting.
 */
export async function getSettingsSource(): Promise<SettingsSourceInfo> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/system/settings/source');
  const settings = Array.isArray(raw.settings) ? raw.settings : [];
  const auth = settings
    .map((entry) => asRecord(entry))
    .find((entry) => entry?.configType === 'authenticationConfiguration');
  const managed = Array.isArray(auth?.managedPaths)
    ? (auth?.managedPaths as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  return {
    authenticationEditable: auth?.editable !== false,
    authenticationManagedPaths: managed,
  };
}

/**
 * Parse a 400 SecurityValidationResponse body ({ status, errors: [{ field,
 * message }] }) into readable lines. Returns null when the body carries no
 * usable field errors, so callers can fall back to the generic message.
 */
export function parseSecurityValidationErrors(body: string): string | null {
  try {
    const parsed = asRecord(JSON.parse(body)) ?? {};
    const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    const lines = errors
      .map((entry) => {
        const rec = asRecord(entry) ?? {};
        // asString returns '' (not undefined) for a missing key, so fall
        // back with ||, not ?? — otherwise a message-only error would
        // swallow the error field entirely.
        const field = asString(rec.field);
        const detail = asString(rec.message) || asString(rec.error);
        if (field && detail) {
          return `${field}: ${detail}`;
        }
        return detail || field || null;
      })
      .filter((line): line is string => typeof line === 'string' && line.length > 0);
    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

export function settingAsLoginConfig(value: unknown): LoginConfiguration {
  return mapLogin(value);
}

export function settingAsEmailConfig(value: unknown): EmailConfiguration {
  return mapEmail(value);
}

export function settingAsUiTheme(value: unknown): UiThemePreference {
  const rec = asRecord(value) ?? {};
  const logo = asRecord(rec.customLogoConfig) ?? {};
  const theme = asRecord(rec.customTheme) ?? {};
  return {
    customLogoConfig: {
      customLogoUrlPath: asString(logo.customLogoUrlPath) || undefined,
      customFaviconUrlPath: asString(logo.customFaviconUrlPath) || undefined,
      customMonogramUrlPath: asString(logo.customMonogramUrlPath) || undefined,
    },
    customTheme: {
      primaryColor: asString(theme.primaryColor) || undefined,
      hoverColor: asString(theme.hoverColor) || undefined,
      selectedColor: asString(theme.selectedColor) || undefined,
      errorColor: asString(theme.errorColor) || undefined,
      successColor: asString(theme.successColor) || undefined,
      warningColor: asString(theme.warningColor) || undefined,
      infoColor: asString(theme.infoColor) || undefined,
      panelBackgroundColor: asString(theme.panelBackgroundColor) || undefined,
    },
  };
}

export function settingAsOmUrl(value: unknown): OmBaseUrlConfiguration {
  const rec = asRecord(value) ?? {};
  return { openMetadataUrl: asString(rec.openMetadataUrl) || undefined };
}

export function settingAsLineage(value: unknown): LineageSettings {
  const rec = asRecord(value) ?? {};
  const layer = asString(rec.lineageLayer);
  const mode = asString(rec.pipelineViewMode);
  return {
    upstreamDepth: asNumber(rec.upstreamDepth),
    downstreamDepth: asNumber(rec.downstreamDepth),
    lineageLayer:
      layer === 'EntityLineage' || layer === 'ColumnLevelLineage' || layer === 'DataObservability'
        ? layer
        : undefined,
    pipelineViewMode: mode === 'Edge' || mode === 'Node' ? mode : undefined,
  };
}

export function settingAsProfiler(value: unknown): ProfilerConfiguration {
  const rec = asRecord(value) ?? {};
  const metricsRaw = Array.isArray(rec.metricConfiguration) ? rec.metricConfiguration : [];
  const sample = asRecord(rec.sampleDataConfig) ?? {};
  return {
    metricConfiguration: metricsRaw.map((row) => {
      const r = asRecord(row) ?? {};
      return {
        dataType: asString(r.dataType) || undefined,
        metrics: Array.isArray(r.metrics) ? r.metrics.map((m) => String(m)) : undefined,
        disabled: asBoolean(r.disabled),
      };
    }),
    sampleDataConfig: {
      storeSampleData: asBoolean(sample.storeSampleData),
      readSampleData: asBoolean(sample.readSampleData),
    },
  };
}

function mapAssetType(raw: unknown): AssetTypeConfiguration {
  const r = asRecord(raw) ?? {};
  return {
    assetType: asString(r.assetType) || '',
    searchFields: Array.isArray(r.searchFields)
      ? r.searchFields.map((f) => {
          const fr = asRecord(f) ?? {};
          return { field: asString(fr.field) || undefined, boost: asNumber(fr.boost) };
        })
      : undefined,
    highlightFields: Array.isArray(r.highlightFields)
      ? r.highlightFields.map((h) => String(h))
      : undefined,
    scoreMode: asString(r.scoreMode) || undefined,
    boostMode: asString(r.boostMode) || undefined,
  };
}

export function settingAsSearch(value: unknown): SearchSettings {
  const rec = asRecord(value) ?? {};
  const global = asRecord(rec.globalSettings) ?? {};
  const assets = Array.isArray(rec.assetTypeConfigurations) ? rec.assetTypeConfigurations : [];
  return {
    globalSettings: {
      enableAccessControl: asBoolean(global.enableAccessControl),
      enableColumnIndexing: asBoolean(global.enableColumnIndexing),
      maxAggregateSize: asNumber(global.maxAggregateSize),
      maxResultHits: asNumber(global.maxResultHits),
      maxAnalyzedOffset: asNumber(global.maxAnalyzedOffset),
      highlightFields: Array.isArray(global.highlightFields)
        ? global.highlightFields.map((h) => String(h))
        : undefined,
      keywordWeight: asNumber(global.keywordWeight),
      semanticWeight: asNumber(global.semanticWeight),
      termBoosts: Array.isArray(global.termBoosts)
        ? global.termBoosts.map((b) => {
            const r = asRecord(b) ?? {};
            return {
              field: asString(r.field) || undefined,
              value: asString(r.value) || undefined,
              boost: asNumber(r.boost),
            };
          })
        : undefined,
      fieldValueBoosts: Array.isArray(global.fieldValueBoosts)
        ? global.fieldValueBoosts.map((b) => {
            const r = asRecord(b) ?? {};
            return {
              field: asString(r.field) || undefined,
              factor: asNumber(r.factor),
              modifier: asString(r.modifier) || undefined,
              missing: asNumber(r.missing),
            };
          })
        : undefined,
      aggregations: Array.isArray(global.aggregations)
        ? global.aggregations.map((a) => {
            const r = asRecord(a) ?? {};
            return {
              name: asString(r.name) || undefined,
              type: asString(r.type) || undefined,
              field: asString(r.field) || undefined,
            };
          })
        : undefined,
    },
    assetTypeConfigurations: assets.map(mapAssetType),
    defaultConfiguration: rec.defaultConfiguration != null ? mapAssetType(rec.defaultConfiguration) : undefined,
    allowedFields: Array.isArray(rec.allowedFields)
      ? rec.allowedFields.map((row) => {
          const r = asRecord(row) ?? {};
          const fields = Array.isArray(r.fields) ? r.fields : [];
          return {
            entityType: asString(r.entityType) || '',
            fields: fields.map((f) => {
              const fr = asRecord(f) ?? {};
              return {
                name: asString(fr.name) || '',
                description: asString(fr.description) || undefined,
                highlight: asBoolean(fr.highlight),
              };
            }),
          };
        })
      : undefined,
  };
}

export function settingAsGlossary(value: unknown): GlossarySettings {
  const rec = asRecord(value) ?? {};
  return { enableTagPropagation: asBoolean(rec.enableTagPropagation) };
}

export function settingAsEntityRules(value: unknown): EntityRulesSettings {
  const rec = asRecord(value) ?? {};
  const rules = Array.isArray(rec.entitySemantics) ? rec.entitySemantics : [];
  return {
    entitySemantics: rules.map((rule) => {
      const r = asRecord(rule) ?? {};
      return {
        name: asString(r.name) || '',
        description: asString(r.description) || undefined,
        rule: asString(r.rule) || undefined,
        enabled: asBoolean(r.enabled),
        entityType: asString(r.entityType) || undefined,
        ignoredEntities: Array.isArray(r.ignoredEntities)
          ? r.ignoredEntities.map((e) => String(e))
          : undefined,
      } satisfies SemanticsRule;
    }),
  };
}

export function settingAsAppConfiguration(value: unknown): AppConfiguration {
  const rec = asRecord(value) ?? {};
  const mode = asString(rec.defaultAppMode);
  const order = asString(rec.defaultColumnOrder);
  const time = asString(rec.defaultTimeFormat);
  return {
    defaultAppMode: mode === 'ai' || mode === 'classic' ? mode : mode === '' ? null : null,
    defaultColumnOrder:
      order === 'alphabetical' || order === 'sourceOrder' ? order : order === '' ? null : null,
    defaultTimeFormat: time === '12h' || time === '24h' ? time : undefined,
  };
}

export const settingAsAppConfig = settingAsAppConfiguration;

export async function getTypedSetting<T>(
  name: string,
  mapper: (value: unknown) => T,
): Promise<T> {
  const setting = await getSetting(name);
  return mapper(setting.configValue);
}
