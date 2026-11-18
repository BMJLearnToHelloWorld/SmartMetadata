/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

export interface Paged<T> {
  data: T[];
  after?: string;
  before?: string;
  total?: number;
}

export type IncludeFilter = 'non-deleted' | 'deleted' | 'all';

export interface AdminUser {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  description?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  deleted?: boolean;
  /** Official OnlineUsers fields; absent for users from other endpoints. */
  lastLoginTime?: number;
  lastActivityTime?: number;
  /** Pages the user follows (only read with fields=follows). */
  follows?: EntityRef[];
  teams: EntityRef[];
  roles: EntityRef[];
}

export interface CreateUserRequest {
  name: string;
  email: string;
  displayName?: string;
  description?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  password?: string;
  confirmPassword?: string;
  createPasswordType?: 'ADMIN_CREATE' | 'USER_CREATE';
  teams?: string[];
  roles?: string[];
}

export interface AdminTeam {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  teamType: string;
  isJoinable?: boolean;
  deleted?: boolean;
  userCount?: number;
  users: EntityRef[];
  defaultRoles: EntityRef[];
  parents: EntityRef[];
  policies: EntityRef[];
}

export interface CreateTeamRequest {
  name: string;
  teamType: string;
  displayName?: string;
  description?: string;
  isJoinable?: boolean;
  parents?: string[];
  defaultRoles?: string[];
  users?: string[];
}

export interface AdminRole {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deleted?: boolean;
  policies: EntityRef[];
  users: EntityRef[];
  teams: EntityRef[];
}

export interface PolicyRule {
  name: string;
  description?: string;
  effect?: string;
  operations: string[];
  resources: string[];
  condition?: string;
  fullyQualifiedName?: string;
}

export interface AdminPolicy {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  deleted?: boolean;
  owners: EntityRef[];
  teams: EntityRef[];
  roles: EntityRef[];
  rules: PolicyRule[];
}

export interface AdminBot {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deleted?: boolean;
  botUser?: EntityRef;
}

export interface CreateBotRequest {
  name: string;
  botUser: string;
  displayName?: string;
  description?: string;
  botUserEmail: string;
}

export type JwtTokenExpiry = 'OneHour' | '1' | '7' | '30' | '60' | '90' | 'Unlimited';

export interface JwtAuthMechanism {
  JWTToken?: string;
  JWTTokenExpiry?: string;
  JWTTokenExpiresAt?: number;
}

export interface CreatePolicyRuleRequest {
  name: string;
  effect: 'allow' | 'deny';
  operations: string[];
  resources: string[];
  description?: string;
  condition?: string;
  fullyQualifiedName?: string;
}

/** Apache CreatePolicy — required name + rules. */
export interface CreatePolicyRequest {
  name: string;
  rules: CreatePolicyRuleRequest[];
  displayName?: string;
  description?: string;
  enabled?: boolean;
}

/** Apache App list/detail (GET /v1/apps). No marketplace invent. */
export interface AdminApp {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deleted?: boolean;
  appType?: string;
  scheduleType?: string;
  fullyQualifiedName?: string;
}

export interface AuthConfiguration {
  provider?: string;
  providerName?: string;
  clientType?: string;
  enableSelfSignup?: boolean;
  enableAutoRedirect?: boolean;
  clientId?: string;
  authority?: string;
  callbackUrl?: string;
}

export interface LoginConfiguration {
  maxLoginFailAttempts?: number;
  accessBlockTime?: number;
  jwtTokenExpiryTime?: number;
}

export interface EmailConfiguration {
  emailingEntity?: string;
  supportUrl?: string;
  enableSmtpServer?: boolean;
  senderMail?: string;
  serverEndpoint?: string;
  serverPort?: number;
  username?: string;
  password?: string;
  transportationStrategy?: string;
  templates?: string;
}

export interface SystemSetting {
  configType: string;
  configValue: unknown;
}

export interface ServerVersion {
  version?: string;
  revision?: string;
  timestamp?: number;
}

export interface LogoConfiguration {
  customLogoUrlPath?: string;
  customFaviconUrlPath?: string;
  customMonogramUrlPath?: string;
}

export interface ThemeConfiguration {
  primaryColor?: string;
  hoverColor?: string;
  selectedColor?: string;
  errorColor?: string;
  successColor?: string;
  warningColor?: string;
  infoColor?: string;
  panelBackgroundColor?: string;
}

export interface UiThemePreference {
  customLogoConfig: LogoConfiguration;
  customTheme: ThemeConfiguration;
}

export interface OmBaseUrlConfiguration {
  openMetadataUrl?: string;
}

export interface GraphPerformanceConfig {
  cacheTTLSeconds?: number;
  enableCaching?: boolean;
  enableProgressTracking?: boolean;
  largeGraphBatchSize?: number;
  maxCachedGraphs?: number;
  maxInMemoryNodes?: number;
  mediumGraphBatchSize?: number;
  mediumGraphThreshold?: number;
  progressReportInterval?: number;
  scrollTimeoutMinutes?: number;
  smallGraphBatchSize?: number;
  smallGraphThreshold?: number;
  streamingBatchSize?: number;
  useScrollForLargeGraphs?: boolean;
}

export interface LineageSettings {
  upstreamDepth?: number;
  downstreamDepth?: number;
  lineageLayer?: 'EntityLineage' | 'ColumnLevelLineage' | 'DataObservability';
  pipelineViewMode?: 'Edge' | 'Node';
  // Carried, never edited, by the lineage form: the settings PUT replaces
  // the whole value, so a save must send it back or the server drops it.
  // ADR:2026-11-18-lineage-settings-save-preserves-unedited-fields
  graphPerformanceConfig?: GraphPerformanceConfig;
}

export interface MetricConfigurationDefinition {
  dataType?: string;
  metrics?: string[];
  disabled?: boolean;
}

export interface SampleDataIngestionConfig {
  storeSampleData?: boolean;
  readSampleData?: boolean;
}

export interface ProfilerConfiguration {
  metricConfiguration?: MetricConfigurationDefinition[];
  sampleDataConfig?: SampleDataIngestionConfig;
}

export interface SearchFieldBoost {
  field?: string;
  boost?: number;
  // exact | phrase | fuzzy | standard; kept a string so unknown values
  // round-trip instead of being silently dropped by the parser.
  matchType?: string;
}

export interface SearchTermBoost {
  field?: string;
  value?: string;
  boost?: number;
}

export interface SearchFieldValueBoostRange {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

export interface SearchFieldValueBoost {
  field?: string;
  factor?: number;
  // 10-value Modifier enum in the schema; kept a string, see matchType.
  modifier?: string;
  missing?: number;
  condition?: { range?: SearchFieldValueBoostRange };
}

export interface SearchAggregation {
  name?: string;
  // 14-value AggregationType enum in the schema; kept a string, see matchType.
  type?: string;
  field?: string;
  script?: string;
}

export interface SearchMatchTypeBoostMultipliers {
  exactMatchMultiplier?: number;
  phraseMatchMultiplier?: number;
  fuzzyMatchMultiplier?: number;
}

/**
 * Opaque pass-through: the ranking subtree is deep-copied on parse and sent
 * back untouched; no UI reads its fields. Replaced by a typed mapping when
 * the Ranking editing surface lands.
 */
export type SearchRankingConfiguration = Record<string, unknown>;

/** Opaque pass-through: a free-form mapping in the schema, carried verbatim. */
export type SearchAdditionalSettings = Record<string, unknown>;

/** Opaque pass-through: NlqConfiguration carries an index signature, so its
 * contents cannot be enumerated; carried verbatim. */
export type SearchNlqConfiguration = Record<string, unknown>;

export interface AllowedFieldValueBoostField {
  name: string;
  description?: string;
}

export interface AllowedFieldValueBoostFields {
  entityType: string;
  fields: AllowedFieldValueBoostField[];
}

export interface SearchGlobalSettings {
  enableAccessControl?: boolean;
  enableColumnIndexing?: boolean;
  maxAggregateSize?: number;
  maxResultHits?: number;
  maxAnalyzedOffset?: number;
  highlightFields?: string[];
  keywordWeight?: number;
  semanticWeight?: number;
  termBoosts?: SearchTermBoost[];
  fieldValueBoosts?: SearchFieldValueBoost[];
  aggregations?: SearchAggregation[];
}

export interface AssetTypeConfiguration {
  assetType: string;
  searchFields?: SearchFieldBoost[];
  highlightFields?: string[];
  scoreMode?: string;
  boostMode?: string;
  termBoosts?: SearchTermBoost[];
  fieldValueBoosts?: SearchFieldValueBoost[];
  aggregations?: SearchAggregation[];
  ranking?: SearchRankingConfiguration;
  additionalSettings?: SearchAdditionalSettings;
  matchTypeBoostMultipliers?: SearchMatchTypeBoostMultipliers;
}

export interface AllowedSearchField {
  name: string;
  description?: string;
  highlight?: boolean;
}

export interface AllowedSearchFields {
  entityType: string;
  fields: AllowedSearchField[];
}

export interface SearchSettings {
  globalSettings?: SearchGlobalSettings;
  assetTypeConfigurations?: AssetTypeConfiguration[];
  defaultConfiguration?: AssetTypeConfiguration;
  allowedFields?: AllowedSearchFields[];
  allowedFieldValueBoosts?: AllowedFieldValueBoostFields[];
  nlqConfiguration?: SearchNlqConfiguration;
}

export interface GlossarySettings {
  enableTagPropagation?: boolean;
}

export interface SemanticsRule {
  name: string;
  description?: string;
  rule?: string;
  enabled?: boolean;
  entityType?: string;
  ignoredEntities?: string[];
  // Whether this rule was inherited from a Data Product (basic.json). This
  // page never edits it; it only round-trips.
  // ADR:2026-11-18-entity-rules-round-trip-unedited-fields
  inherited?: boolean;
  // JSON Tree representing the rule in the UI (basic.json), maintained by
  // the Data Contract semantics form. Opaque here: never parsed. This page
  // never edits it; it only round-trips.
  jsonTree?: string;
  // providerType in the schema: system | user | automation, default user
  // (basic.json:179-185). Kept a string so unknown values round-trip; this
  // page never edits it.
  provider?: string;
}

export interface EntityRulesSettings {
  entitySemantics: SemanticsRule[];
}

export interface AppConfiguration {
  defaultAppMode?: 'ai' | 'classic' | null;
  defaultColumnOrder?: 'alphabetical' | 'sourceOrder' | null;
  defaultTimeFormat?: '12h' | '24h';
}

export interface StepValidation {
  description?: string;
  passed?: boolean;
  message?: string;
}

export interface SystemValidationResponse {
  database?: StepValidation;
  searchInstance?: StepValidation;
  pipelineServiceClient?: StepValidation;
  jwks?: StepValidation;
  migrations?: StepValidation;
  logStorage?: StepValidation;
}

export interface DataQualityDimension {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  deleted?: boolean;
  style?: { color?: string };
  provider?: string;
}

export interface CreateDataQualityDimensionRequest {
  name: string;
  displayName?: string;
  description?: string;
  style?: { color?: string };
}

export interface LearningResource {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  resourceType: string;
  categories?: string[];
  difficulty?: string;
  source: { provider?: string; url: string };
  status?: string;
  deleted?: boolean;
}

export interface CreateLearningResourceRequest {
  name: string;
  resourceType: string;
  source: { provider?: string; url: string };
  categories?: string[];
  displayName?: string;
  description?: string;
  difficulty?: string;
  status?: string;
}

