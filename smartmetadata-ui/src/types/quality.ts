/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef, TagRef } from './api';
import type { EntityReferenceInput } from './admin';

export const TEST_DEFINITION_ENTITY_TYPES = ['TABLE', 'COLUMN'] as const;
export type TestDefinitionEntityType = (typeof TEST_DEFINITION_ENTITY_TYPES)[number];

export const TEST_PLATFORMS = [
  'OpenMetadata',
  'GreatExpectations',
  'dbt',
  'Deequ',
  'Soda',
  'Other',
] as const;
export type TestPlatform = (typeof TEST_PLATFORMS)[number];

export const TEST_CASE_STATUSES = ['Success', 'Failed', 'Aborted', 'Queued'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

/** Official TEST_CASE_STATUS_LABELS (profiler.constant.ts). */
export const TEST_CASE_STATUS_LABELS: Record<TestCaseStatus, string> = {
  Aborted: 'label.aborted',
  Failed: 'label.failed',
  Queued: 'label.queued',
  Success: 'label.success',
};

export const INCIDENT_STATUSES = ['New', 'Ack', 'Assigned', 'Resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/**
 * All five pin alert types (generated/events/eventSubscription.ts:128-134).
 * The two settings/observability faces only ever use Notification and
 * Observability; the other three exist on stored alerts and in list
 * parameters, so the wire union keeps them.
 */
export const ALERT_TYPES = [
  'ActivityFeed',
  'Custom',
  'GovernanceWorkflowChangeEvent',
  'Notification',
  'Observability',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export interface TestParameterDefinition {
  name: string;
  displayName?: string;
  dataType?: string;
  description?: string;
  required?: boolean;
}

export interface TestParameterValue {
  name: string;
  value: string;
}

export interface TestResultValue {
  name: string;
  value: string;
  predictedValue?: string;
}

export interface TestCaseErrorDetails {
  message?: string;
  errorType?: string;
  stackTrace?: string;
}

/** Official testCaseEvaluationScope (openmetadata-spec tests/basic.json). */
export interface TestCaseEvaluationScope {
  sampled?: boolean;
  profileSample?: number;
  profileSampleType?: 'PERCENTAGE' | 'ROWS';
  partitioned?: boolean;
  partitionColumnName?: string;
}

export interface TestCaseResult {
  timestamp?: number;
  testCaseStatus?: string;
  result?: string;
  testCaseFQN?: string;
  incidentId?: string;
  duration?: number;
  minBound?: number;
  maxBound?: number;
  passedRows?: number;
  failedRows?: number;
  passedRowsPercentage?: number;
  failedRowsPercentage?: number;
  errorDetails?: TestCaseErrorDetails;
  evaluationScope?: TestCaseEvaluationScope;
  /**
   * Named measured values (official TestCaseResult.testResultValue), e.g. a
   * tableDiff run's removedRows / addedRows / diffCount. Only entries the
   * run actually computed are present — never placeholders.
   * ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
   */
  testResultValue?: TestResultValue[];
}

export interface TestSummary {
  success?: number;
  failed?: number;
  aborted?: number;
  queued?: number;
  total?: number;
}

export interface TestDefinition {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  entityType?: string;
  testPlatforms: string[];
  dataQualityDimension?: string;
  parameterDefinition: TestParameterDefinition[];
  provider?: string;
  supportedDataTypes?: string[];
  supportedServices?: string[];
  enabled?: boolean;
  /** Official testDefinition.sqlExpression / custom SQL body. */
  sqlExpression?: string;
  supportsRowLevelPassedFailed?: boolean;
}

export interface CreateTestDefinitionRequest {
  name: string;
  entityType: TestDefinitionEntityType | string;
  testPlatforms: string[];
  description?: string;
  displayName?: string;
  dataQualityDimension?: string;
  supportedDataTypes?: string[];
  supportedServices?: string[];
  enabled?: boolean;
  parameterDefinition?: TestParameterDefinition[];
  sqlExpression?: string;
  validatorClass?: string;
}

export interface TestCase {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  entityLink?: string;
  entityFQN?: string;
  testDefinition?: EntityRef;
  testSuite?: EntityRef;
  testSuites: EntityRef[];
  parameterValues: TestParameterValue[];
  testCaseResult?: TestCaseResult;
  testCaseStatus?: string;
  incidentId?: string;
  /** Incident workflow state riding on the row (official fields list). */
  incidentStatus?: string;
  owners?: EntityRef[];
  domains?: EntityRef[];
  dataProducts?: EntityRef[];
  tags?: TagRef[];
  useDynamicAssertion?: boolean;
  computePassedFailedRowCount?: boolean;
  dataQualityDimension?: EntityRef;
  deleted?: boolean;
  /** Official testCase.topDimensions (dimension-level tests). */
  topDimensions?: number;
  /** Columns to group results by dimensions (testCase.json dimensionColumns). */
  dimensionColumns?: string[];
  /** Official testCase.inspectionQuery; gates the SQL query tab. */
  inspectionQuery?: string;
}

/**
 * One dimension result (tests/dimensionResult.json + the timestamp /
 * dimensionKey the DimensionalityTab carries alongside it).
 */
export interface TestCaseDimensionResult {
  dimensionValues: { value: string }[];
  testCaseStatus?: string;
  result?: string;
  impactScore?: number;
  excludedFromRollUp?: boolean;
  timestamp?: number;
  dimensionKey?: string;
}

export interface CreateTestCaseRequest {
  name: string;
  testDefinition: string;
  entityLink: string;
  description?: string;
  displayName?: string;
  parameterValues?: TestParameterValue[];
  tags?: Array<{ tagFQN: string; source?: string; name?: string; labelType?: string; state?: string }>;
  dimensionColumns?: string[];
  topDimensions?: number;
  dataQualityDimension?: string;
  computePassedFailedRowCount?: boolean;
}

export interface TestSuite {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  /** Official TestSuite.deleted: when true the entity has been soft deleted. */
  deleted?: boolean;
  basic?: boolean;
  basicEntityReference?: string;
  tests: EntityRef[];
  summary?: TestSummary;
  owners: EntityRef[];
}

export interface CreateTestSuiteRequest {
  name: string;
  description?: string;
  displayName?: string;
}

/**
 * Official TestCaseResolutionStatus (generated/tests/
 * testCaseResolutionStatus.ts): the incident record. The details object
 * carries the assignee / resolver / failure reason + comment; updatedAt
 * is the last-update sort/filter key (distinct from timestamp, the
 * failure creation time); failureSummary and metrics ride along for
 * P4 detail use and are never dropped by the mapper.
 */
export interface TestIncidentResolutionDetails {
  assignee?: EntityRef;
  resolvedBy?: EntityRef;
  testCaseFailureComment?: string;
  testCaseFailureReason?: string;
}

export interface TestIncident {
  id: string;
  stateId?: string;
  timestamp?: number;
  testCaseResolutionStatusType?: string;
  severity?: string;
  testCaseReference?: EntityRef;
  updatedBy?: EntityRef;
  testCaseResolutionStatusDetails?: TestIncidentResolutionDetails;
  updatedAt?: number;
  failureSummary?: string;
  metrics?: unknown[];
}

export interface CreateTestIncidentRequest {
  testCaseResolutionStatusType: IncidentStatus | string;
  testCaseReference: string;
  severity?: string;
  testCaseResolutionStatusDetails?: {
    testCaseFailureReason?: string;
    testCaseFailureComment?: string;
    /**
     * Official assigned.json: the Assigned details variant requires an
     * assignee. The reopen path (Resolved -> Assigned) posts it here;
     * the open-incident assign flow never uses this request (it goes
     * through the task resolve endpoint instead).
     */
    assignee?: EntityRef;
  };
}

/**
 * Wire schema for EventSubscription, ported from the pin generated types
 * (generated/events/eventSubscription.ts). Fields stay optional per the
 * product mapper convention: the mapper reads unknown JSON and must not
 * assert presence the server does not guarantee. Pin marks category/type
 * on Destination and condition/effect on EventFilterRule required; the
 * form validation (not the type) guarantees them at save time.
 */

/** SubscriptionCategory (eventSubscription.ts:249-258). */
export const SUBSCRIPTION_CATEGORIES = [
  'Admins',
  'Assignees',
  'External',
  'Followers',
  'Mentions',
  'Owners',
  'Teams',
  'Users',
] as const;
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number];

/**
 * SubscriptionType (eventSubscription.ts:470-478). The wire value for Teams
 * is `MsTeams` (pin enum member MSTeams) — never `MSTeams` on the wire.
 */
export const SUBSCRIPTION_TYPES = [
  'ActivityFeed',
  'Email',
  'GChat',
  'GovernanceWorkflowChangeEvent',
  'MsTeams',
  'Slack',
  'Webhook',
] as const;
export type SubscriptionType = (typeof SUBSCRIPTION_TYPES)[number];

/** ProviderType wire values are lowercase (eventSubscription.ts:674-678). */
export type ProviderType = 'automation' | 'system' | 'user';

/** Effect (eventSubscription.ts:598-601). */
export type Effect = 'exclude' | 'include';

/** InputType (eventSubscription.ts:603-607). */
export type InputType = 'none' | 'runtime' | 'static';

/** PrefixCondition (eventSubscription.ts:614-617). */
export type PrefixCondition = 'AND' | 'OR';

/** SourceKind (alertCapabilities.ts:167-171). */
export type SourceKind = 'activity' | 'all' | 'entity';

/** HTTPMethod (eventSubscription.ts:364-367). */
export type HttpMethod = 'POST' | 'PUT';

/** Webhook auth discriminator (eventSubscription.ts:355-359). */
export type WebhookAuthType = 'bearer' | 'none' | 'oauth2';

/** Destination status values (eventSubscription.ts:457-465). */
export type DestinationStatusValue =
  | 'active'
  | 'awaitingRetry'
  | 'disabled'
  | 'failed'
  | 'retryLimitReached'
  | 'Failed'
  | 'Success';

/** AuthenticationConfigurationType (eventSubscription.ts:324-350). */
export interface WebhookAuthConfig {
  /** Pin requires the discriminator; the mapper leaves it unset when absent. */
  type?: WebhookAuthType;
  secretKey?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  tokenUrl?: string;
}

/**
 * Webhook config (eventSubscription.ts:267-312). The index signature is
 * pin's: a generic map deserialized later, so unknown keys survive.
 */
export interface WebhookDestinationConfig {
  authType?: WebhookAuthConfig;
  endpoint?: string;
  headers?: Record<string, unknown>;
  httpMethod?: HttpMethod;
  queryParams?: Record<string, unknown>;
  receivers?: string[];
  sendToAdmins?: boolean;
  sendToFollowers?: boolean;
  sendToOwners?: boolean;
  [key: string]: unknown;
}

/** Destination status (pin TionStatus, eventSubscription.ts:376-444). */
export interface DestinationStatus {
  lastFailedAt?: number;
  lastFailedReason?: string;
  lastFailedStatusCode?: number;
  lastSuccessfulAt?: number;
  nextAttempt?: number;
  status?: DestinationStatusValue;
  timestamp?: number;
  entity?: string;
  headers?: unknown;
  location?: string;
  mediaType?: string;
  reason?: string;
  statusCode?: number;
  statusInfo?: string;
}

/** Destination (eventSubscription.ts:206-244). */
export interface EventSubscriptionDestination {
  category?: SubscriptionCategory;
  channel?: string;
  config?: WebhookDestinationConfig;
  downstreamDepth?: number | null;
  enabled?: boolean;
  id?: string;
  notifyDownstream?: boolean;
  readTimeout?: number;
  statusDetails?: DestinationStatus;
  timeout?: number;
  type?: SubscriptionType;
}

/** EventFilterRule (eventSubscription.ts:564-596). `condition` is a string. */
export interface EventSubscriptionFilterRule {
  arguments?: string[];
  condition?: string;
  description?: string;
  displayName?: string;
  effect?: Effect;
  fullyQualifiedName?: string;
  inputType?: InputType;
  name?: string;
  prefixCondition?: PrefixCondition;
}

/** FilteringRules (eventSubscription.ts:546-559). */
export interface EventSubscriptionFilteringRules {
  actions?: EventSubscriptionFilterRule[];
  resources?: string[];
  rules?: EventSubscriptionFilterRule[];
}

/** AlertFilteringInput (eventSubscription.ts:624-633). */
export interface AlertFilteringInput {
  actions?: ArgumentsInput[];
  filters?: ArgumentsInput[];
}

/** ArgumentsInput (eventSubscription.ts:638-652). */
export interface ArgumentsInput {
  arguments?: Argument[];
  effect?: Effect;
  name?: string;
  prefixCondition?: PrefixCondition;
}

/** Argument (eventSubscription.ts:657-666). */
export interface Argument {
  input?: string[];
  name?: string;
}

/** Trigger (eventSubscription.ts:685-695) with ScheduleInfo/TriggerType. */
export type TriggerType = 'RealTime' | 'Scheduled';
export type ScheduleInfo = 'Custom' | 'Daily' | 'Monthly' | 'Weekly';
export interface EventSubscriptionTrigger {
  cronExpression?: string;
  scheduleInfo?: ScheduleInfo;
  triggerType?: TriggerType;
}

/** EventSubscription (eventSubscription.ts:17-121). */
export interface EventSubscription {
  id: string;
  name: string;
  alertType?: AlertType;
  batchSize?: number;
  className?: string;
  config?: Record<string, unknown>;
  description?: string;
  displayName?: string;
  destinations: EventSubscriptionDestination[];
  domains?: EntityRef[];
  enabled?: boolean;
  filteringRules?: EventSubscriptionFilteringRules;
  fullyQualifiedName?: string;
  href?: string;
  input?: AlertFilteringInput;
  notificationTemplate?: EntityRef;
  owners?: EntityRef[];
  pollInterval?: number;
  provider?: ProviderType;
  retries?: number;
  trigger?: EventSubscriptionTrigger;
  updatedAt?: number;
  updatedBy?: string;
  version?: number;
}

/**
 * CreateEventSubscription (generated/events/api/createEventSubscription.ts:16-85).
 * No `filteringRules` field: the create schema rejects unknown fields, so
 * sending filteringRules fails the create with a Jackson error; the server
 * builds the stored filtering rules from the top-level `resources` list.
 * `domains` are FQN strings here, unlike the EntityRef list on the entity.
 */
export interface CreateEventSubscriptionRequest {
  name: string;
  alertType: AlertType;
  batchSize?: number;
  className?: string;
  config?: Record<string, unknown>;
  description?: string;
  destinations?: EventSubscriptionDestination[];
  displayName?: string;
  domains?: string[];
  enabled?: boolean;
  input?: AlertFilteringInput;
  notificationTemplate?: EntityRef;
  owners?: EntityReferenceInput[];
  pollInterval?: number;
  provider?: ProviderType;
  resources?: string[];
  retries?: number;
  trigger?: EventSubscriptionTrigger;
}

export interface TableSampleData {
  columns: string[];
  rows: string[][];
}

export interface TopicSampleData {
  messages: string[];
}

export interface ProfileHistogram {
  boundaries: string[];
  frequencies: number[];
}

export interface CardinalityDistribution {
  categories?: unknown[];
  counts?: number[];
  percentages?: number[];
  allValuesUnique?: boolean;
}

export interface CustomMetricValue {
  name: string;
  value?: number;
}

export interface ExecutionSource {
  databaseName?: string;
  schemaName?: string;
  tableName?: string;
}

export interface ColumnProfile {
  name: string;
  timestamp?: number;
  executionSource?: ExecutionSource;
  nullCount?: number;
  uniqueCount?: number;
  distinctCount?: number;
  min?: string;
  max?: string;
  mean?: string;
  valuesCount?: number;
  countInSet?: number;
  likeCount?: number;
  iLikeCount?: number;
  notLikeCount?: number;
  regexCount?: number;
  notRegexCount?: number;
  maxLength?: number;
  minLength?: number;
  stddev?: number;
  sum?: number;
  nullMissingCount?: number;
  distinctProportion?: number;
  uniqueProportion?: number;
  nullProportion?: number;
  duplicateCount?: number;
  likeRatio?: number;
  iLikeRatio?: number;
  median?: number;
  firstQuartile?: number;
  thirdQuartile?: number;
  interQuartileRange?: number;
  nonParametricSkew?: number;
  histogram?: ProfileHistogram;
  cardinalityDistribution?: CardinalityDistribution;
  customMetrics?: CustomMetricValue[];
}

export interface TableProfile {
  timestamp?: number;
  rowCount?: number;
  columnCount?: number;
  sizeInByte?: number;
  createDateTime?: string;
  profileSample?: number;
  profileSampleType?: string;
  executionSource?: ExecutionSource;
  customMetrics?: CustomMetricValue[];
  columns: ColumnProfile[];
}
