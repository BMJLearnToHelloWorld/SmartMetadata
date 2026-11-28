/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Official DataContract.constants.ts used by the ContractDetail VIEW card.
 */
import type { ContractExecutionStatus } from '@/api/dataContracts';

/** Official CONTRACT_DATE_TIME_FORMAT — kept for reference; header dates use official formatDateTime. */
export const CONTRACT_DATE_TIME_FORMAT = 'MM/DD/YYYY, h:mma';

export enum DataContractMode {
  YAML,
  UI,
}

export enum DataContractTabMode {
  ADD,
  EDIT,
  VIEW,
}

export enum DATA_CONTRACT_ACTION_DROPDOWN_KEY {
  CREATE = 'create',
  EDIT = 'edit',
  RUN_NOW = 'run_now',
  EXPORT = 'export',
  EXPORT_ODCS = 'export_odcs',
  IMPORT_ODCS = 'import_odcs',
  IMPORT_OPENMETADATA = 'import_openmetadata',
  DELETE = 'delete',
}

export type ContractImportFormat = 'odcs' | 'openmetadata';

export enum DATA_CONTRACT_SLA {
  REFRESH_FREQUENCY = 'refresh_frequency',
  MAX_LATENCY = 'max_latency',
  TIME_AVAILABILITY = 'time_availability',
  RETENTION = 'retention',
  COLUMN_NAME = 'columnName',
}

export const DATA_CONTRACT_EXECUTION_CHART_COMMON_PROPS = {
  barMaxWidth: 12,
  radius: 6,
};

export const CONTRACT_EXECUTION_CHART_HEIGHT = 240;

/** Above this many runs the chart opens a zoom window on the first ones. */
export const CONTRACT_EXECUTION_VISIBLE_RUNS = 31;

export type ContractChartStatus = 'success' | 'failed' | 'warning' | 'info' | 'muted';

export const CONTRACT_EXECUTION_CHART_STATUS: Record<
  ContractExecutionStatus,
  { status: ContractChartStatus; label: string }
> = {
  Success: { status: 'success', label: 'label.success' },
  Failed: { status: 'failed', label: 'label.failed' },
  Aborted: { status: 'warning', label: 'label.aborted' },
  PartialSuccess: { status: 'warning', label: 'label.partial-success' },
  Running: { status: 'info', label: 'label.running' },
  Queued: { status: 'muted', label: 'label.queued' },
};

/** Official constants.ts */
export const ES_MAX_PAGE_SIZE = 10000;
export const LIST_SIZE = 5;

/** Official profiler.constant DEFAULT_SORT_ORDER */
export const DEFAULT_TEST_CASE_SORT_ORDER = {
  sortType: 'desc' as const,
  sortField: 'testCaseResult.timestamp',
};

export type ImportMode = 'merge' | 'replace';
