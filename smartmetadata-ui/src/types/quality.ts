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

export const INCIDENT_STATUSES = ['New', 'Ack', 'Assigned', 'Resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const ALERT_TYPES = ['Notification', 'Observability'] as const;
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
}

export interface TestCaseResult {
  timestamp?: number;
  testCaseStatus?: string;
  result?: string;
  testCaseFQN?: string;
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
}

export interface CreateTestDefinitionRequest {
  name: string;
  entityType: TestDefinitionEntityType | string;
  testPlatforms: string[];
  description?: string;
  displayName?: string;
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
  /** Columns to group results by dimensions (testCase.json dimensionColumns). */
  dimensionColumns?: string[];
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
}

export interface TestSuite {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
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

export interface EventSubscriptionDestination {
  category?: string;
  type?: string;
  enabled?: boolean;
  endpoint?: string;
  /** Seconds the destination waits for a response; official DEFAULT_READ_TIMEOUT = 12. */
  readTimeout?: number;
}

export interface EventSubscriptionFilterRule {
  name?: string;
  effect?: string;
  condition?: string | string[];
}

export interface EventSubscriptionFilteringRules {
  resources?: string[];
  rules?: EventSubscriptionFilterRule[];
}

export interface EventSubscription {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  alertType?: string;
  enabled?: boolean;
  destinations: EventSubscriptionDestination[];
  filteringRules?: EventSubscriptionFilteringRules;
  owners?: EntityRef[];
}

export interface CreateEventSubscriptionRequest {
  name: string;
  alertType: AlertType | string;
  description?: string;
  displayName?: string;
  enabled?: boolean;
  /**
   * Top-level resources only. The create schema has no filteringRules
   * field and rejects unknown fields, so sending filteringRules fails
   * the create with a Jackson error; the server builds the stored
   * filtering rules from this list instead.
   */
  resources?: string[];
  destinations: Array<{
    category: string;
    type: string;
    config?: { endpoint?: string };
    /** Destination-level, beside config — not inside it (see mapper note). */
    readTimeout?: number;
  }>;
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
