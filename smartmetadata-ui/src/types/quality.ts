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

export interface TestCaseResult {
  timestamp?: number;
  testCaseStatus?: string;
  result?: string;
  testCaseFQN?: string;
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

export interface TestIncident {
  id: string;
  stateId?: string;
  timestamp?: number;
  testCaseResolutionStatusType?: string;
  severity?: string;
  testCaseReference?: EntityRef;
  updatedBy?: EntityRef;
}

export interface CreateTestIncidentRequest {
  testCaseResolutionStatusType: IncidentStatus | string;
  testCaseReference: string;
  severity?: string;
  testCaseResolutionStatusDetails?: {
    testCaseFailureReason?: string;
    testCaseFailureComment?: string;
  };
}

export interface EventSubscriptionDestination {
  category?: string;
  type?: string;
  enabled?: boolean;
  endpoint?: string;
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
}

export interface CreateEventSubscriptionRequest {
  name: string;
  alertType: AlertType | string;
  description?: string;
  displayName?: string;
  enabled?: boolean;
  destinations: Array<{
    category: string;
    type: string;
    config?: { endpoint?: string };
  }>;
}

export interface TableSampleData {
  columns: string[];
  rows: string[][];
}

export interface TopicSampleData {
  messages: string[];
}

export interface ColumnProfile {
  name: string;
  nullCount?: number;
  uniqueCount?: number;
  distinctCount?: number;
  min?: string;
  max?: string;
  mean?: string;
}

export interface TableProfile {
  timestamp?: number;
  rowCount?: number;
  columnCount?: number;
  columns: ColumnProfile[];
}
