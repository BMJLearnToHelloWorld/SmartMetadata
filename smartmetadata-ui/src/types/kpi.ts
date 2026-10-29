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

/** Schema `kpiTargetType`: NUMBER | PERCENTAGE. Mapped as string so unknown values pass through. */
export type KpiMetricType = 'NUMBER' | 'PERCENTAGE' | string;

/**
 * Apache CreateKpiRequest.dataInsightChart enum
 * (`openmetadata-spec/.../createKpiRequest.json`).
 */
export const KPI_DATA_INSIGHT_CHARTS = [
  'percentage_of_data_asset_with_description_kpi',
  'percentage_of_data_asset_with_owner_kpi',
  'number_of_data_asset_with_description_kpi',
  'number_of_data_asset_with_owner_kpi',
] as const;

export type KpiDataInsightChart = (typeof KPI_DATA_INSIGHT_CHARTS)[number] | string;

export interface KpiTarget {
  name: string;
  value: string;
  targetMet?: boolean;
}

export interface KpiResult {
  timestamp?: number;
  kpiFqn?: string;
  targetResult: KpiTarget[];
}

export interface Kpi {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  metricType?: KpiMetricType;
  targetValue?: number;
  startDate?: number;
  endDate?: number;
  dataInsightChart?: EntityRef;
  kpiResult?: KpiResult;
  owners: EntityRef[];
}

/** Apache CreateKpiRequest — required fields match the JSON schema. */
export interface CreateKpiRequest {
  name: string;
  description: string;
  dataInsightChart: KpiDataInsightChart;
  startDate: number;
  endDate: number;
  targetValue: number;
  metricType: KpiMetricType;
  displayName?: string;
  owners?: EntityRef[];
  domains?: string[];
}

export interface ListKpiResultsQuery {
  startTs: number;
  endTs: number;
  orderBy?: 'ASC' | 'DESC';
}

export interface DeleteKpiOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}
