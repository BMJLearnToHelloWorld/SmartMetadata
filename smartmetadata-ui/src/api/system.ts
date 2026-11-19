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
import type { SettingSource } from '@/utils/settingsSource';
import type {
  AllowedFieldValueBoostFields,
  AppConfiguration,
  AssetTypeConfiguration,
  AuthConfiguration,
  EmailConfiguration,
  EntityRulesSettings,
  GlossarySettings,
  GraphPerformanceConfig,
  LineageSettings,
  LoginConfiguration,
  OmBaseUrlConfiguration,
  Paged,
  ProfilerConfiguration,
  SearchAggregation,
  SearchFieldBoost,
  SearchFieldValueBoost,
  SearchMatchTypeBoostMultipliers,
  SearchRankingConfiguration,
  SearchSettings,
  SearchTermBoost,
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

/**
 * The public config endpoint, not the admin-only settings read:
 * ConfigResource serves the cached preference without authorization
 * (JwtFilter EXCLUDED_ENDPOINTS), so the custom theme applies to
 * every user and the login page, as in official theme boot. The
 * settings endpoint 403s for non-admins, which fail-open would
 * silently turn into iSmart defaults. Returns the bare preference,
 * parsed through the display whitelist (settingAsUiTheme). Callers
 * fail open on rejection; this function itself propagates errors.
 */
export function getCustomUiThemePreference(): Promise<UiThemePreference> {
  return apiRequest<unknown>('/v1/system/config/customUiThemePreference').then(
    settingAsUiTheme,
  );
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
    // Map every key, not just the six named checks: the official
    // ValidationResponse has an index signature and OmHealthPage renders
    // one card per key, so unknown checks must be preserved. Non-record
    // values map to undefined and the view's falsy guard skips them,
    // mirroring official's `validation &&` guard.
    return Object.fromEntries(
      Object.entries(rec).map(([key, value]) => [key, mapStep(value)]),
    );
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

/**
 * Official `rest/settingConfigAPI.patchAppConfiguration` (pin a3012259ca):
 * PATCH the appConfiguration setting with one RFC 6902 `add` op per entry,
 * targeting only the updated key so other appConfiguration fields are never
 * overwritten and concurrent edits to other keys do not race.
 */
export function patchAppConfiguration(patch: Partial<AppConfiguration>): Promise<void> {
  const ops: JsonPatchOp[] = Object.entries(patch).map(([key, value]) => ({
    op: 'add',
    path: `/${key}`,
    value,
  }));
  return apiRequest<void>('/v1/system/settings/appConfiguration', {
    method: 'PATCH',
    json: ops,
    contentType: 'application/json-patch+json',
  });
}

/**
 * PUT /v1/system/email/test (DR-1): SystemResource.sendTestEmail
 * answers with a String entity, so the wire body is either the raw
 * sentence or a JSON-quoted string depending on the JSON provider.
 * Axios (official) tolerates both — its transformResponse falls back
 * to the raw body when JSON parsing fails — while apiRequest's
 * default JSON parse throws on the raw form and would report a sent
 * email as failed. Read the body as text; callers unquote a JSON
 * string themselves.
 */
export function testEmailConnection(email: string): Promise<string> {
  return apiRequest<string>('/v1/system/email/test', {
    method: 'PUT',
    json: { email },
    response: 'text',
  });
}

/**
 * Official `rest/settingConfigAPI.restoreSettingsConfig`
 * (settingConfigAPI.ts:214): PUT /v1/system/settings/reset/{settingType};
 * returns the bare setting value (see SystemResource.resetSettingToDefault).
 */
export async function restoreSettingsConfig(settingType: string): Promise<unknown> {
  return apiRequest<unknown>(`/v1/system/settings/reset/${settingType}`, {
    method: 'PUT',
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
 * The full SecurityConfiguration document, carried verbatim. Validate and
 * Test Login take the whole document: a truncated body would fail checks
 * the stored configuration passes (emailClaim/jwtPrincipalClaims, the
 * secret-restore conditions), so this read must not map anything away.
 * A missing section reads as an empty object, never undefined, so the
 * candidate builder and the save gate can always treat both sections as
 * present. ADR:2026-11-18-sso-candidate-preserves-full-security-document.
 */
export interface SecurityConfigurationDocument {
  authenticationConfiguration: Record<string, unknown>;
  authorizerConfiguration: Record<string, unknown>;
}

function cloneJsonSection(value: unknown): Record<string, unknown> {
  const rec = asRecord(value) ?? {};
  return JSON.parse(JSON.stringify(rec)) as Record<string, unknown>;
}

export async function getSecurityConfigurationDocument(): Promise<SecurityConfigurationDocument> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/system/security/config');
  return {
    authenticationConfiguration: cloneJsonSection(raw.authenticationConfiguration),
    authorizerConfiguration: cloneJsonSection(raw.authorizerConfiguration),
  };
}

export interface SecurityFieldError {
  field: string;
  error: string;
}

export interface SecurityValidationResponse {
  status: 'success' | 'failed';
  errors?: SecurityFieldError[];
}

/**
 * POST /v1/system/security/validate: the checks a save runs, against a
 * candidate (unsaved) document. The endpoint always answers 200 with a
 * SecurityValidationResponse; a status other than 'success' is a failure,
 * and an unrecognized status value fails closed the same way.
 */
export async function validateSecurityConfiguration(
  candidate: SecurityConfigurationDocument,
): Promise<SecurityValidationResponse> {
  const raw = await apiRequest<unknown>('/v1/system/security/validate', {
    method: 'POST',
    json: candidate,
  });
  const rec = asRecord(raw) ?? {};
  const status: SecurityValidationResponse['status'] = rec.status === 'success' ? 'success' : 'failed';
  const errors = parseSecurityValidationResponse(raw);
  return errors.length > 0 ? { status, errors } : { status };
}

/**
 * Structured parse of a SecurityValidationResponse body, either already
 * parsed JSON or the raw string an ApiError carries. Each errors entry
 * contributes its field and error strings; an entry with neither is
 * dropped, and a body without a usable errors array yields []. The
 * schema has no `message` key, so none is read: accepting one would let
 * a fabricated fixture pass for the real wire shape.
 */
export function parseSecurityValidationResponse(body: unknown): SecurityFieldError[] {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }
  }
  const rec = asRecord(parsed);
  if (!rec || !Array.isArray(rec.errors)) {
    return [];
  }
  return rec.errors.flatMap((entry) => {
    const item = asRecord(entry) ?? {};
    const field = asString(item.field);
    const error = asString(item.error);
    return field || error ? [{ field, error }] : [];
  });
}

export type TestLoginStatus = 'pending' | 'success' | 'failed';

export type TestLoginStage =
  | 'STARTED'
  | 'REDIRECTED'
  | 'TOKEN_RECEIVED'
  | 'TOKEN_VALIDATED'
  | 'TOKEN_REFRESHED'
  | 'CREDENTIALS_VERIFIED'
  | 'CLAIMS_EXTRACTED'
  | 'IDENTITY_RESOLVED'
  | 'ROLES_MAPPED'
  | 'DOMAIN_CHECKED';

export type TestLoginStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestLoginStageResult {
  stage: TestLoginStage;
  status: TestLoginStageStatus;
  message?: string;
}

export interface TestLoginDomainCheck {
  enforced?: boolean;
  passed?: boolean;
  principalDomain?: string;
  resolvedDomain?: string;
}

export interface TestLoginResult {
  status: TestLoginStatus;
  stages?: TestLoginStageResult[];
  stage?: TestLoginStage;
  protocol?: 'basic' | 'ldap' | 'oidc' | 'saml';
  resolvedPrincipal?: string;
  resolvedEmail?: string;
  mappedRoles?: string[];
  mappedTeams?: string[];
  domainCheck?: TestLoginDomainCheck;
  errors?: string[];
}

export interface TestLoginSession {
  testSessionId: string;
  protocol: TestLoginResult['protocol'];
  authorizationUrl?: string;
  requiresCredentials?: boolean;
  expiresAt?: number;
}

export interface TestLoginCredentialsRequest {
  testSessionId: string;
  email: string;
  password: string;
}

const TEST_LOGIN_STAGES = new Set([
  'STARTED',
  'REDIRECTED',
  'TOKEN_RECEIVED',
  'TOKEN_VALIDATED',
  'TOKEN_REFRESHED',
  'CREDENTIALS_VERIFIED',
  'CLAIMS_EXTRACTED',
  'IDENTITY_RESOLVED',
  'ROLES_MAPPED',
  'DOMAIN_CHECKED',
]);

const TEST_LOGIN_STAGE_STATUSES = new Set(['pending', 'running', 'passed', 'failed', 'skipped']);

const TEST_LOGIN_PROTOCOLS = new Set(['basic', 'ldap', 'oidc', 'saml']);

function asTestLoginStage(value: unknown): TestLoginStage | undefined {
  const stage = asString(value);
  return TEST_LOGIN_STAGES.has(stage) ? (stage as TestLoginStage) : undefined;
}

function asTestLoginProtocol(value: unknown): TestLoginResult['protocol'] {
  const protocol = asString(value);
  return TEST_LOGIN_PROTOCOLS.has(protocol)
    ? (protocol as NonNullable<TestLoginResult['protocol']>)
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Defensive mapping of a TestLoginResult body. An unrecognized overall
 * status fails closed to 'failed': an unknown state must never read as
 * a pass. Stage entries with an unrecognized stage or status are
 * dropped rather than rendered as a stage that does not exist.
 */
export function mapTestLoginResult(value: unknown): TestLoginResult {
  const rec = asRecord(value) ?? {};
  const status = asString(rec.status);
  const domain = asRecord(rec.domainCheck);
  return {
    status: status === 'pending' || status === 'success' || status === 'failed' ? status : 'failed',
    stages: Array.isArray(rec.stages)
      ? rec.stages.flatMap((entry) => {
          const item = asRecord(entry) ?? {};
          const stage = asTestLoginStage(item.stage);
          const stageStatus = asString(item.status);
          if (!stage || !TEST_LOGIN_STAGE_STATUSES.has(stageStatus)) {
            return [];
          }
          return [
            {
              stage,
              status: stageStatus as TestLoginStageStatus,
              message: asString(item.message) || undefined,
            },
          ];
        })
      : undefined,
    stage: asTestLoginStage(rec.stage),
    protocol: asTestLoginProtocol(rec.protocol),
    resolvedPrincipal: asString(rec.resolvedPrincipal) || undefined,
    resolvedEmail: asString(rec.resolvedEmail) || undefined,
    mappedRoles: asStringArray(rec.mappedRoles),
    mappedTeams: asStringArray(rec.mappedTeams),
    domainCheck: domain
      ? {
          enforced: asBoolean(domain.enforced),
          passed: asBoolean(domain.passed),
          principalDomain: asString(domain.principalDomain) || undefined,
          resolvedDomain: asString(domain.resolvedDomain) || undefined,
        }
      : undefined,
    errors: asStringArray(rec.errors),
  };
}

export function mapTestLoginSession(value: unknown): TestLoginSession {
  const rec = asRecord(value) ?? {};
  return {
    testSessionId: asString(rec.testSessionId),
    protocol: asTestLoginProtocol(rec.protocol),
    authorizationUrl: asString(rec.authorizationUrl) || undefined,
    requiresCredentials: asBoolean(rec.requiresCredentials),
    expiresAt: asNumber(rec.expiresAt),
  };
}

/** POST /v1/system/security/test-login/validate-token: dry-run an id_token against a candidate. */
export function testLoginValidateToken(request: {
  securityConfiguration: SecurityConfigurationDocument;
  idToken: string;
}): Promise<TestLoginResult> {
  return apiRequest<unknown>('/v1/system/security/test-login/validate-token', {
    method: 'POST',
    json: request,
  }).then(mapTestLoginResult);
}

/** POST /v1/system/security/test-login/start: start a server-driven Test Login round-trip. */
export function startTestLogin(request: {
  securityConfiguration: SecurityConfigurationDocument;
}): Promise<TestLoginSession> {
  return apiRequest<unknown>('/v1/system/security/test-login/start', {
    method: 'POST',
    json: request,
  }).then(mapTestLoginSession);
}

/** GET /v1/system/security/test-login/result/{id}: the outcome, or its pending timeline. */
export function getTestLoginResult(testSessionId: string): Promise<TestLoginResult> {
  return apiRequest<unknown>(
    `/v1/system/security/test-login/result/${encodeURIComponent(testSessionId)}`,
  ).then(mapTestLoginResult);
}

/**
 * POST /v1/system/security/test-login/credentials: verify LDAP/Basic
 * credentials once for a test. The request is sent and never logged or
 * stored anywhere on the client.
 */
export function submitTestLoginCredentials(
  request: TestLoginCredentialsRequest,
): Promise<TestLoginResult> {
  return apiRequest<unknown>('/v1/system/security/test-login/credentials', {
    method: 'POST',
    json: request,
  }).then(mapTestLoginResult);
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

/**
 * Official securityConfigAPI.applySecurityConfiguration: PUT the whole
 * SecurityConfiguration document at /v1/system/security/config. Used for
 * new SSO configurations (after validate) and provider switches; the
 * endpoint answers 200 with the current configuration document, returned
 * here with the same section normalization as the GET read.
 */
export async function applySecurityConfiguration(
  candidate: SecurityConfigurationDocument,
): Promise<SecurityConfigurationDocument> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/system/security/config', {
    method: 'PUT',
    json: candidate,
  });
  return {
    authenticationConfiguration: cloneJsonSection(raw.authenticationConfiguration),
    authorizerConfiguration: cloneJsonSection(raw.authorizerConfiguration),
  };
}

/** Deployment-ownership info for the authenticationConfiguration setting. */
function mapSettingSource(value: unknown): SettingSource | undefined {
  const entry = asRecord(value);
  if (!entry) {
    return undefined;
  }
  const configType = asString(entry.configType);
  if (!configType) {
    return undefined;
  }
  const source = asString(entry.source);
  const overridden = Array.isArray(entry.overriddenFields)
    ? entry.overriddenFields.flatMap((field) => {
        const rec = asRecord(field);
        const path = rec ? asString(rec.path) : '';
        if (!path) {
          return [];
        }
        const envVariable = rec ? asString(rec.envVariable) : '';
        return [{ path, ...(envVariable ? { envVariable } : {}) }];
      })
    : [];
  return {
    configType,
    editable: entry.editable !== false,
    ...(asString(entry.lastReloadError)
      ? { lastReloadError: asString(entry.lastReloadError) }
      : {}),
    managedPaths: Array.isArray(entry.managedPaths)
      ? (entry.managedPaths as unknown[]).filter(
          (p): p is string => typeof p === 'string',
        )
      : [],
    ...(overridden.length > 0 ? { overriddenFields: overridden } : {}),
    source: source === 'ENV' || source === 'AUTO' ? source : 'DB',
    ...(asString(entry.sourceVariable)
      ? { sourceVariable: asString(entry.sourceVariable) }
      : {}),
  };
}

/**
 * Official settingConfigAPI.getSettingsSource: GET
 * /v1/system/settings/source, the full per-setting source list. Callers
 * filter to the config types they need; a failed request yields no
 * sources at the call site (render as database-only).
 */
export async function getSettingsSource(): Promise<SettingSource[]> {
  const raw = await apiRequest<Record<string, unknown>>('/v1/system/settings/source');
  const settings = Array.isArray(raw.settings) ? raw.settings : [];
  return settings.flatMap((entry) => {
    const mapped = mapSettingSource(entry);
    return mapped ? [mapped] : [];
  });
}

/**
 * Official settingConfigAPI.adoptDeploymentConfig: POST
 * /v1/system/settings/source/{configType}/adopt with {paths}. Replaces
 * the stored values of `paths` (every overridden field when omitted)
 * with the deployment values and returns the setting's source status
 * after the change.
 */
export async function adoptDeploymentConfig(
  configType: string,
  paths?: string[],
): Promise<SettingSource> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/system/settings/source/${configType}/adopt`,
    { method: 'POST', json: { paths } },
  );
  const mapped = mapSettingSource(raw);
  if (!mapped) {
    throw new Error('Adopt deployment config succeeded but the response had no setting source');
  }
  return mapped;
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

function mapGraphPerformanceConfig(raw: unknown): GraphPerformanceConfig | undefined {
  const perf = asRecord(raw);
  if (!perf) {
    return undefined;
  }
  return {
    cacheTTLSeconds: asNumber(perf.cacheTTLSeconds),
    enableCaching: asBoolean(perf.enableCaching),
    enableProgressTracking: asBoolean(perf.enableProgressTracking),
    largeGraphBatchSize: asNumber(perf.largeGraphBatchSize),
    maxCachedGraphs: asNumber(perf.maxCachedGraphs),
    maxInMemoryNodes: asNumber(perf.maxInMemoryNodes),
    mediumGraphBatchSize: asNumber(perf.mediumGraphBatchSize),
    mediumGraphThreshold: asNumber(perf.mediumGraphThreshold),
    progressReportInterval: asNumber(perf.progressReportInterval),
    scrollTimeoutMinutes: asNumber(perf.scrollTimeoutMinutes),
    smallGraphBatchSize: asNumber(perf.smallGraphBatchSize),
    smallGraphThreshold: asNumber(perf.smallGraphThreshold),
    streamingBatchSize: asNumber(perf.streamingBatchSize),
    useScrollForLargeGraphs: asBoolean(perf.useScrollForLargeGraphs),
  };
}

// ADR:2026-11-18-lineage-settings-save-preserves-unedited-fields
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
    graphPerformanceConfig: mapGraphPerformanceConfig(rec.graphPerformanceConfig),
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

function mapFieldBoost(raw: unknown): SearchFieldBoost {
  const r = asRecord(raw) ?? {};
  return {
    field: asString(r.field) || undefined,
    boost: asNumber(r.boost),
    matchType: asString(r.matchType) || undefined,
  };
}

function mapTermBoost(raw: unknown): SearchTermBoost {
  const r = asRecord(raw) ?? {};
  return {
    field: asString(r.field) || undefined,
    value: asString(r.value) || undefined,
    boost: asNumber(r.boost),
  };
}

function mapFieldValueBoost(raw: unknown): SearchFieldValueBoost {
  const r = asRecord(raw) ?? {};
  const cond = asRecord(r.condition);
  const range = cond ? asRecord(cond.range) : null;
  return {
    field: asString(r.field) || undefined,
    factor: asNumber(r.factor),
    modifier: asString(r.modifier) || undefined,
    missing: asNumber(r.missing),
    // An absent condition stays absent; a stored empty condition stays an
    // empty object, with absent bounds left undefined rather than zeroed.
    condition:
      cond === null
        ? undefined
        : {
            range:
              range === null
                ? undefined
                : {
                    gt: asNumber(range.gt),
                    gte: asNumber(range.gte),
                    lt: asNumber(range.lt),
                    lte: asNumber(range.lte),
                  },
          },
  };
}

function mapAggregation(raw: unknown): SearchAggregation {
  const r = asRecord(raw) ?? {};
  return {
    name: asString(r.name) || undefined,
    type: asString(r.type) || undefined,
    field: asString(r.field) || undefined,
    script: asString(r.script) || undefined,
  };
}

function mapMatchTypeBoostMultipliers(raw: unknown): SearchMatchTypeBoostMultipliers | undefined {
  const r = asRecord(raw);
  if (!r) {
    return undefined;
  }
  return {
    exactMatchMultiplier: asNumber(r.exactMatchMultiplier),
    phraseMatchMultiplier: asNumber(r.phraseMatchMultiplier),
    fuzzyMatchMultiplier: asNumber(r.fuzzyMatchMultiplier),
  };
}

function cloneJsonObject(raw: unknown): Record<string, unknown> | undefined {
  const rec = asRecord(raw);
  if (!rec) {
    return undefined;
  }
  // JSON round-trip, not structuredClone: cloning a Vue reactive object with
  // structuredClone throws a DataCloneError.
  return JSON.parse(JSON.stringify(rec)) as Record<string, unknown>;
}

function mapAllowedFieldValueBoosts(raw: unknown): AllowedFieldValueBoostFields[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((row) => {
    const r = asRecord(row) ?? {};
    const fields = Array.isArray(r.fields) ? r.fields : [];
    return {
      entityType: asString(r.entityType) || '',
      fields: fields.map((f) => {
        const fr = asRecord(f) ?? {};
        return {
          name: asString(fr.name) || '',
          description: asString(fr.description) || undefined,
        };
      }),
    };
  });
}

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
function mapAssetType(raw: unknown): AssetTypeConfiguration {
  const r = asRecord(raw) ?? {};
  return {
    assetType: asString(r.assetType) || '',
    searchFields: Array.isArray(r.searchFields) ? r.searchFields.map(mapFieldBoost) : undefined,
    highlightFields: Array.isArray(r.highlightFields)
      ? r.highlightFields.map((h) => String(h))
      : undefined,
    scoreMode: asString(r.scoreMode) || undefined,
    boostMode: asString(r.boostMode) || undefined,
    termBoosts: Array.isArray(r.termBoosts) ? r.termBoosts.map(mapTermBoost) : undefined,
    fieldValueBoosts: Array.isArray(r.fieldValueBoosts)
      ? r.fieldValueBoosts.map(mapFieldValueBoost)
      : undefined,
    aggregations: Array.isArray(r.aggregations) ? r.aggregations.map(mapAggregation) : undefined,
    ranking: cloneJsonObject(r.ranking),
    additionalSettings: cloneJsonObject(r.additionalSettings),
    matchTypeBoostMultipliers: mapMatchTypeBoostMultipliers(r.matchTypeBoostMultipliers),
  };
}

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
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
      termBoosts: Array.isArray(global.termBoosts) ? global.termBoosts.map(mapTermBoost) : undefined,
      fieldValueBoosts: Array.isArray(global.fieldValueBoosts)
        ? global.fieldValueBoosts.map(mapFieldValueBoost)
        : undefined,
      aggregations: Array.isArray(global.aggregations)
        ? global.aggregations.map(mapAggregation)
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
    allowedFieldValueBoosts: mapAllowedFieldValueBoosts(rec.allowedFieldValueBoosts),
    nlqConfiguration: cloneJsonObject(rec.nlqConfiguration),
  };
}

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
export function buildSearchSettingsPayload(config: SearchSettings): SearchSettings {
  const { globalSettings, ...rest } = config;
  return globalSettings ? { ...rest, globalSettings: { ...globalSettings } } : { ...rest };
}

/** The keys the entity search form owns, plus the effective ranking it carries. */
export type EntitySearchDraft = Pick<
  AssetTypeConfiguration,
  'searchFields' | 'highlightFields' | 'scoreMode' | 'boostMode' | 'termBoosts' | 'fieldValueBoosts'
> & { ranking?: SearchRankingConfiguration };

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
export function buildEntitySearchSettingsPayload(
  loaded: SearchSettings,
  entityType: string,
  draft: EntitySearchDraft,
): SearchSettings {
  return {
    ...loaded,
    assetTypeConfigurations: (loaded.assetTypeConfigurations ?? []).map((item) =>
      item.assetType === entityType ? { ...item, ...draft } : item,
    ),
  };
}

// The derivation below ports the official SearchSettingsUtils ranking rules
// 1:1. The ranking subtree stays an opaque record, so the port reads only the
// paths it derives through this structural view; every other key survives
// via spread, exactly as in the official code.
type RankingStageShape = {
  name?: string;
  fields?: string[];
  [key: string]: unknown;
};

type RankingConfigurationShape = {
  signals?: { fields?: string[]; [key: string]: unknown };
  stages?: RankingStageShape[];
  stopWords?: string[];
  stopWordsByLanguage?: Record<string, unknown>;
  [key: string]: unknown;
};

const PRIMARY_NAME_FIELDS = ['name', 'displayName', 'fullyQualifiedName'];
const RANKING_FIELD_SUFFIXES = ['.keyword', '.ngram', '.compound'];

const normalizeRankingField = (field: string) => {
  for (const suffix of RANKING_FIELD_SUFFIXES) {
    if (field.endsWith(suffix)) {
      return field.slice(0, -suffix.length);
    }
  }

  return field;
};

const isPrimaryNameField = (field: string) =>
  PRIMARY_NAME_FIELDS.includes(normalizeRankingField(field));

const isDescriptionContextField = (field: string) => {
  const lowerField = field.toLowerCase();

  return (
    lowerField.includes('description') ||
    lowerField === 'querytext' ||
    lowerField === 'extractedtext'
  );
};

const withFallbackFields = (fields: Set<string>, fallbackFields: string[] = []) => {
  const rankingFields = [...fields];

  return rankingFields.length > 0 ? rankingFields : fallbackFields;
};

const deriveExactNameFields = (configuredFields: string[], fallbackFields: string[]) => {
  const fields = new Set<string>();

  ['displayName.keyword', 'name.keyword', 'fullyQualifiedName.keyword'].forEach((field) => {
    if (configuredFields.includes(field)) {
      fields.add(field);
    }
  });

  if (configuredFields.includes('displayName')) {
    fields.add('displayName.keyword');
  }
  if (configuredFields.includes('name')) {
    fields.add('name.keyword');
  }
  if (configuredFields.includes('fullyQualifiedName')) {
    fields.add('fullyQualifiedName');
  }

  return withFallbackFields(fields, fallbackFields);
};

const deriveCloseNameFields = (configuredFields: string[], fallbackFields: string[]) => {
  const fields = new Set(
    configuredFields.filter(
      (field) =>
        isPrimaryNameField(field) && !field.endsWith('.keyword') && !field.endsWith('.ngram'),
    ),
  );

  return withFallbackFields(fields, fallbackFields);
};

const deriveNgramNameFields = (configuredFields: string[], fallbackFields: string[]) => {
  const fields = new Set(
    configuredFields.filter((field) => field.endsWith('.ngram') && isPrimaryNameField(field)),
  );

  return withFallbackFields(fields, fallbackFields);
};

const deriveDescriptionFields = (configuredFields: string[], fallbackFields: string[]) => {
  const fields = new Set(configuredFields.filter(isDescriptionContextField));

  return withFallbackFields(fields, fallbackFields);
};

const deriveStructuralFields = (configuredFields: string[], fallbackFields: string[]) => {
  const fields = new Set(
    configuredFields.filter(
      (field) =>
        !isPrimaryNameField(field) &&
        !isDescriptionContextField(field) &&
        !field.startsWith('extension.'),
    ),
  );

  return withFallbackFields(fields, fallbackFields);
};

const deriveRankingStageFields = (stage: RankingStageShape, configuredFields: string[]) => {
  const fallbackFields = stage.fields ?? [];

  if (configuredFields.length === 0) {
    return fallbackFields;
  }

  const stageName = (stage.name ?? '').toLowerCase();

  if (stageName.includes('exact')) {
    return deriveExactNameFields(configuredFields, fallbackFields);
  }
  if (stageName.includes('partial') || stageName.includes('ngram')) {
    return deriveNgramNameFields(configuredFields, fallbackFields);
  }
  if (stageName.includes('close') || stageName.includes('name')) {
    return deriveCloseNameFields(configuredFields, fallbackFields);
  }
  if (stageName.includes('description')) {
    return deriveDescriptionFields(configuredFields, fallbackFields);
  }

  return deriveStructuralFields(configuredFields, fallbackFields);
};

// ADR:2026-11-18-search-settings-save-preserves-unedited-fields
export const getEffectiveRankingConfiguration = (
  searchConfig: SearchSettings | undefined,
  assetConfig: AssetTypeConfiguration | null,
): SearchRankingConfiguration | undefined => {
  if (assetConfig?.ranking) {
    return assetConfig.ranking;
  }

  const defaultRanking = searchConfig?.defaultConfiguration?.ranking;

  if (!defaultRanking) {
    return undefined;
  }

  // The schema guarantees a string field; filtering only keeps dirty data
  // from throwing inside the derive helpers.
  const configuredFields = (assetConfig?.searchFields ?? [])
    .map((fieldBoost) => fieldBoost.field)
    .filter((field): field is string => typeof field === 'string');

  const ranking = defaultRanking as RankingConfigurationShape;

  return {
    ...defaultRanking,
    signals: ranking.signals
      ? {
          ...ranking.signals,
          fields: ranking.signals.fields ? [...ranking.signals.fields] : undefined,
        }
      : undefined,
    stages: ranking.stages?.map((stage) => ({
      ...stage,
      fields: deriveRankingStageFields(stage, configuredFields),
    })),
    stopWords: ranking.stopWords ? [...ranking.stopWords] : undefined,
    stopWordsByLanguage: ranking.stopWordsByLanguage ? { ...ranking.stopWordsByLanguage } : undefined,
  };
};

export function settingAsGlossary(value: unknown): GlossarySettings {
  const rec = asRecord(value) ?? {};
  return { enableTagPropagation: asBoolean(rec.enableTagPropagation) };
}

// ADR:2026-11-18-entity-rules-round-trip-unedited-fields
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
        inherited: asBoolean(r.inherited),
        jsonTree: asString(r.jsonTree) || undefined,
        provider: asString(r.provider) || undefined,
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
