/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Official utils/DataContract/DataContractUtils.ts — VIEW helpers only.
 * getSematicRuleFields stays with the already-landed semantics form.
 */
import { dump } from 'js-yaml';
import dayjs from 'dayjs';
import type { DataContract } from '@/api/dataContracts';
import type {
  ContractExecutionStatus,
  DataContractResult,
  SlaValidation,
} from '@/api/dataContracts';
import { CONTRACT_EXECUTION_CHART_STATUS, type ContractChartStatus } from '@/catalog/dataContractConstants';
import { NO_DATA_PLACEHOLDER } from '@/utils/notifications/alertConstants';

export { NO_DATA_PLACEHOLDER };

export type ContractStatusKind = 'success' | 'failure' | 'warning' | 'pending';

export interface DataContractProcessedResultCharts {
  name: string;
  displayTimestamp: number;
  value: number;
  status: ContractExecutionStatus;
  failed: number;
  success: number;
  aborted: number;
  running: number;
  data: DataContractResult;
}

export function getContractStatusLabelBasedOnFailedResult(failed?: number): string {
  return failed === 0 ? 'label.passed' : 'label.failed';
}

/**
 * An SLA requirement nothing could evaluate is neither passed nor failed, so
 * an SLA with no evaluated requirement is reported as not evaluated.
 */
export function getSlaStatusLabel(slaValidation: SlaValidation): string {
  const evaluated = [
    slaValidation.refreshFrequencyMet,
    slaValidation.latencyMet,
    slaValidation.availabilityMet,
  ].filter((met) => met !== undefined && met !== null);
  if (evaluated.includes(false)) {
    return 'label.failed';
  }
  return evaluated.length === 0 ? 'label.not-evaluated' : 'label.passed';
}

export function getConstraintStatus(latestContractResults: DataContractResult): Record<string, string> {
  const statusArray: Record<string, string> = {};
  if (latestContractResults.schemaValidation) {
    statusArray.schema = getContractStatusLabelBasedOnFailedResult(
      latestContractResults.schemaValidation.failed,
    );
  }
  if (latestContractResults.semanticsValidation) {
    statusArray.semantic = getContractStatusLabelBasedOnFailedResult(
      latestContractResults.semanticsValidation.failed,
    );
  }
  if (latestContractResults.qualityValidation) {
    statusArray.quality = getContractStatusLabelBasedOnFailedResult(
      latestContractResults.qualityValidation.failed,
    );
  }
  if (latestContractResults.slaValidation) {
    statusArray.sla = getSlaStatusLabel(latestContractResults.slaValidation);
  }
  return statusArray;
}

export function getContractStatusType(status: string): ContractStatusKind {
  // Official switches on the translated label (Passed/Failed). Product
  // getConstraintStatus stores official i18n keys; strip that prefix so
  // both forms resolve the same way.
  const normalized = (status ?? '').toLowerCase().replace(/^label\./, '');
  switch (normalized) {
    case 'passed':
    case 'success':
      return 'success';
    case 'failed':
      return 'failure';
    case 'issue':
    case 'warning':
      return 'warning';
    default:
      return 'pending';
  }
}

/**
 * Official getUpdatedContractDetails: PUT/export shape is CreateDataContract.
 * Name cannot change (one contract per entity). termsOfUse objects flatten to content.
 */
export function getUpdatedContractDetails(
  contract: DataContract,
  formValues: Partial<DataContract> = contract,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...contract,
    ...formValues,
    name: contract.name ?? '',
  };
  if (merged.termsOfUse && typeof merged.termsOfUse === 'object' && 'content' in merged.termsOfUse) {
    merged.termsOfUse = (merged.termsOfUse as { content?: string }).content;
  }
  const omitted = [
    'id',
    'fullyQualifiedName',
    'version',
    'updatedAt',
    'updatedBy',
    'createdAt',
    'createdBy',
    'href',
    'contractUpdates',
    'inherited',
    'testSuite',
    'deleted',
    'changeDescription',
    'latestResult',
    'incrementalChangeDescription',
  ];
  for (const key of omitted) {
    delete merged[key];
  }
  return merged;
}

function triggerDownload(content: string, fileName: string, mime: string): void {
  const element = document.createElement('a');
  const file = new Blob([content], { type: mime });
  element.textContent = 'download-file';
  element.href = URL.createObjectURL(file);
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
  URL.revokeObjectURL(element.href);
  document.body.removeChild(element);
}

export function downloadContractYamlFile(contract: DataContract): void {
  const data = dump(getUpdatedContractDetails(contract, contract));
  triggerDownload(data, `${contract.name}.yaml`, 'text/plain');
}

export function downloadContractAsODCSYaml(yamlContent: string, contractName: string): void {
  triggerDownload(yamlContent, `${contractName}.odcs.yaml`, 'application/yaml');
}

export function processContractExecutionData(
  executionData: DataContractResult[],
): DataContractProcessedResultCharts[] {
  return executionData.map((item, index) => {
    const uniqueName = `${item.timestamp}_${index}`;
    const status = item.contractExecutionStatus;
    return {
      name: uniqueName,
      displayTimestamp: item.timestamp,
      value: 1,
      status,
      failed: status === 'Failed' ? 1 : 0,
      success: status === 'Success' ? 1 : 0,
      aborted: status === 'Aborted' ? 1 : 0,
      running: status === 'Running' ? 1 : 0,
      data: item,
    };
  });
}

export function generateMonthTickPositions(
  processedData: DataContractProcessedResultCharts[],
): string[] {
  const uniqueMonths = new Set<string>();
  const tickPositions: string[] = [];
  for (const item of processedData) {
    const monthKey = dayjs(item.displayTimestamp).format('YYYY-MM');
    if (!uniqueMonths.has(monthKey)) {
      uniqueMonths.add(monthKey);
      tickPositions.push(item.name);
    }
  }
  return tickPositions;
}

function contractExecutionTimestamp(value: string): number {
  return Number(value.split('_')[0]);
}

/** Official formatMonth: MMM (e.g. Jan). */
export function formatContractExecutionTick(value: string): string {
  const millis = contractExecutionTimestamp(value);
  if (Number.isNaN(millis)) {
    return '';
  }
  return dayjs(millis).format('MMM');
}

const CONTRACT_EXECUTION_DAY_TICK_FORMAT = 'MMM D';

export function formatContractExecutionDayTick(value: string): string {
  const millis = contractExecutionTimestamp(value);
  if (Number.isNaN(millis)) {
    return '';
  }
  return dayjs(millis).format(CONTRACT_EXECUTION_DAY_TICK_FORMAT);
}

/** Official formatDateTime (user locale, short date + time). */
export function formatContractDateTime(date?: number): string {
  if (date === undefined || date === null) {
    return '';
  }
  return dayjs(date).format('MMM D, YYYY, h:mm A');
}

/** Official formatDateTimeLong used by the execution-chart tooltip header. */
export function formatContractDateTimeLong(timestamp?: number): string {
  if (timestamp === undefined || timestamp === null) {
    return '';
  }
  return dayjs(timestamp).format('MMM D, YYYY, h:mm:ss A');
}

export function getCurrentMillis(): number {
  return Date.now();
}

export function getEpochMillisForPastDays(days: number): number {
  return dayjs().subtract(days, 'day').valueOf();
}

export function getEntityName(entity?: { displayName?: string; name?: string } | null): string {
  if (!entity) {
    return '';
  }
  return entity.displayName || entity.name || '';
}

export function runChartStatus(status: ContractExecutionStatus): ContractChartStatus {
  return CONTRACT_EXECUTION_CHART_STATUS[status]?.status ?? 'muted';
}

export const ENTITY_STATUS_KIND: Record<string, ContractStatusKind> = {
  Approved: 'success',
  Draft: 'pending',
  Rejected: 'failure',
  Deprecated: 'pending',
  InReview: 'warning',
  Unprocessed: 'pending',
  Archived: 'pending',
};

export function getEntityStatusKind(status?: string): ContractStatusKind {
  return (status && ENTITY_STATUS_KIND[status]) || 'success';
}
