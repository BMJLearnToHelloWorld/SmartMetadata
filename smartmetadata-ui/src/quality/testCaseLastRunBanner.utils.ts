/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestCaseLastRunBanner.utils.ts (OSS reference).
 */
import type { ComposerTranslation } from 'vue-i18n';
import type { TestCase, TestCaseResult, TestIncident } from '@/types/quality';
import { parseEntityLink } from '@/quality/entityLink';
import { entityNameFromFqn } from '@/features/quality/incidentManager';
import { convertMillisecondsToHumanReadableFormat } from '@/utils/workflowDateTime';
import { NO_VALUE } from '@/quality/testSummary.constants';
import { toFiniteNumber } from '@/quality/testSummaryGraphUtils';
import {
  formatExpectation,
  formatNumber,
  getFoundValue,
  getMeasuredResult,
  getRunExpectation,
} from '@/quality/runDetailsCard.utils';
import {
  INCIDENT_RUN_STATUSES,
  INCIDENT_STATUS_CONFIG,
  METRIC_RUN_STATUSES,
} from '@/quality/testCaseLastRunBanner.constants';

export interface TaskLinkInfo {
  path: string;
  label: string;
}

export function getRunDescription(
  result: string | undefined,
  testCaseStatus: string,
  queuedDescription: string,
): string | undefined {
  return result || (testCaseStatus === 'Queued' ? queuedDescription : undefined);
}

export function getIncidentLink(
  taskLinkInfo: TaskLinkInfo | null,
  testCaseStatus: string,
): TaskLinkInfo | null {
  return INCIDENT_RUN_STATUSES.has(testCaseStatus) ? taskLinkInfo : null;
}

export function getMetricSummary(
  testCase: TestCase | undefined,
  testCaseResult: TestCaseResult,
  testCaseStatus: string,
): { expectedValue: string; resultValue?: string; show: boolean } {
  const found = getFoundValue(testCase ? getMeasuredResult(testCase, testCaseResult) : testCaseResult);
  const predicted = toFiniteNumber(testCaseResult.testResultValue?.[0]?.predictedValue);
  const expectedValue =
    predicted !== undefined
      ? formatNumber(predicted)
      : testCase
        ? formatExpectation(getRunExpectation(testCase, testCaseResult))
        : NO_VALUE;

  return {
    expectedValue,
    resultValue: found === undefined ? undefined : formatNumber(found),
    show: METRIC_RUN_STATUSES.has(testCaseStatus) && found !== undefined && expectedValue !== NO_VALUE,
  };
}

export function getIncidentMetadata(
  incidentTitle: string | undefined,
  testCaseStatusData: TestIncident | undefined,
  incidentLink: TaskLinkInfo | null,
): {
  description?: string;
  id?: string;
  statusConfig?: (typeof INCIDENT_STATUS_CONFIG)[keyof typeof INCIDENT_STATUS_CONFIG];
} {
  const incidentStatus = testCaseStatusData?.testCaseResolutionStatusType;
  return {
    description: incidentTitle ?? testCaseStatusData?.failureSummary,
    id: incidentLink ? `INC-${incidentLink.label.replace(/^#/, '')}` : undefined,
    statusConfig: incidentStatus
      ? INCIDENT_STATUS_CONFIG[incidentStatus as keyof typeof INCIDENT_STATUS_CONFIG]
      : undefined,
  };
}

export function getIncidentTitle(testCase: TestCase | undefined, t: ComposerTranslation): string | undefined {
  if (!testCase) {
    return undefined;
  }
  const tableFqn = parseEntityLink(testCase.entityLink ?? '')?.fqn;
  const table = tableFqn ? entityNameFromFqn(tableFqn) : undefined;
  const check = testCase.testDefinition?.displayName || testCase.name;
  if (!table || !check) {
    return undefined;
  }
  return t('message.check-on-table', { check, table });
}

export function getNotRunMessageKey(
  nextRunTimestamp: number | null | undefined,
  now = Date.now(),
): string {
  if (nextRunTimestamp === undefined) {
    return 'message.test-case-has-not-run';
  }
  return nextRunTimestamp && nextRunTimestamp > now
    ? 'message.test-case-first-run-scheduled'
    : 'message.test-case-not-run-yet';
}

export function getNextRunLabel(
  nextRunTimestamp: number | null | undefined,
  inLabel: string,
  notScheduledLabel: string,
): string {
  if (nextRunTimestamp === undefined) {
    return NO_VALUE;
  }
  if (!nextRunTimestamp) {
    return notScheduledLabel;
  }
  const millisecondsUntilNextRun = Math.ceil((nextRunTimestamp - Date.now()) / 60_000) * 60_000;
  if (millisecondsUntilNextRun <= 0) {
    return notScheduledLabel;
  }
  return `${inLabel} ${convertMillisecondsToHumanReadableFormat(millisecondsUntilNextRun, 2)}`;
}

export function getTaskDisplayId(taskId?: string): string {
  if (!taskId) {
    return '';
  }
  const matchedTaskId = /^TASK-0*([0-9]+)$/.exec(taskId);
  return matchedTaskId?.[1] ?? taskId;
}

export function getIncidentTaskPath(testCaseFqn: string): string {
  return `/test-case/${encodeURIComponent(testCaseFqn)}/issues`;
}