/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { TestConnectionDefinitionStep } from '@/api/testConnections';
import type { TestConnectionStepResult } from '@/types/ingestion';

/**
 * Port of official TestConnection's pure rules
 * (TestConnection.tsx + ServicePureUtils.shouldTestConnection +
 * ServiceType.constant), pin a3012259ca. The card component owns the
 * workflow orchestration; these functions decide gating, completion
 * status, and progress so they can be tested without the DOM.
 */

export const TEST_CONNECTION_POLL_MS = 2000;
export const TEST_CONNECTION_TIMEOUT_MS = 3 * 60 * 1000;

export const TEST_CONNECTION_PROGRESS = {
  zero: 0,
  one: 1,
  ten: 10,
  twenty: 20,
  forty: 40,
  hundred: 100,
} as const;

/** Pin shouldTestConnection: every type except the Custom connectors. */
const CUSTOM_CONNECTION_TYPES = new Set([
  'CustomDatabase',
  'CustomMessaging',
  'CustomDashboard',
  'CustomMlModel',
  'CustomPipeline',
  'CustomStorage',
  'CustomSearch',
  'CustomDrive',
]);

export function shouldTestConnection(connectionType: string): boolean {
  return !CUSTOM_CONNECTION_TYPES.has(connectionType);
}

export type TestConnectionStatus = 'Successful' | 'Failed' | 'Warning' | undefined;

export function getAreRequiredStepsPassing(
  resultSteps: TestConnectionStepResult[],
  definitionSteps: TestConnectionDefinitionStep[],
): boolean {
  const requiredDefinitionSteps = definitionSteps.filter((step) => step.mandatory);
  if (requiredDefinitionSteps.length > 0) {
    const resultByName = new Map(resultSteps.map((result) => [result.name, result]));
    return requiredDefinitionSteps.every(
      (step) => resultByName.get(step.name)?.passed,
    );
  }
  return resultSteps.length > 0 && !resultSteps.some((step) => step.mandatory && !step.passed);
}

export function getHasOptionalStepsFailing(
  resultSteps: TestConnectionStepResult[],
  definitionSteps: TestConnectionDefinitionStep[],
): boolean {
  const optionalDefinitionSteps = definitionSteps.filter((step) => !step.mandatory);
  if (optionalDefinitionSteps.length > 0) {
    const resultByName = new Map(resultSteps.map((result) => [result.name, result]));
    return optionalDefinitionSteps.some(
      (step) => resultByName.get(step.name)?.passed === false,
    );
  }
  return resultSteps.some((step) => !step.mandatory && !step.passed);
}

export interface ConnectionTestFlags {
  isConnectionTestInProgress: boolean;
  isReadyToTestCard: boolean;
  isTestConnectionDisabled: boolean;
}

/** Pin computeConnectionTestFlags, verbatim. */
export function computeConnectionTestFlags(
  isTestingConnection: boolean,
  isTestingDisabled: boolean | undefined,
  isFormValidationPending: boolean,
  allowTestConn: boolean,
  isAirflowAvailable: boolean,
  testStatus: TestConnectionStatus,
  missingRequiredFieldsCount: number,
): ConnectionTestFlags {
  const isConnectionTestInProgress =
    isTestingConnection || Boolean(isTestingDisabled) || isFormValidationPending;
  const isTestConnectionDisabled =
    isConnectionTestInProgress || !allowTestConn || !isAirflowAvailable;
  const isReadyToTestCard =
    !isTestConnectionDisabled && !testStatus && missingRequiredFieldsCount === 0;
  return { isConnectionTestInProgress, isReadyToTestCard, isTestConnectionDisabled };
}

export interface CompletionOutcome {
  status: Exclude<TestConnectionStatus, undefined>;
  /** Pin reports Warning runs as successful to the parent (partial ingest). */
  successful: boolean;
  messageKey: string;
}

/** Pin handleCompletionStatus, verbatim. */
export function resolveCompletionStatus(
  isWorkflowSuccessful: boolean,
  steps: TestConnectionStepResult[],
  definitionSteps: TestConnectionDefinitionStep[],
): CompletionOutcome {
  const areRequiredStepsPassing = getAreRequiredStepsPassing(steps, definitionSteps);
  const hasOptionalStepsFailing = getHasOptionalStepsFailing(steps, definitionSteps);
  if (areRequiredStepsPassing && isWorkflowSuccessful && !hasOptionalStepsFailing) {
    return {
      status: 'Successful',
      successful: true,
      messageKey: 'forms.testConnection.success',
    };
  }
  if (areRequiredStepsPassing) {
    return {
      status: 'Warning',
      successful: true,
      messageKey: 'forms.testConnection.warning',
    };
  }
  return {
    status: 'Failed',
    successful: false,
    messageKey: 'forms.testConnection.failed',
  };
}
