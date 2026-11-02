/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ServiceKind } from '@/types/ingestion';

/**
 * Per-kind ingestion scope (filter) fields (R4). Field names are exactly the
 * pipeline sourceConfig surface in ingestion/sourceConfig.ts — the wizard
 * filter step and the pipeline edit page render the same table, they do not
 * each branch on kind. Deliberately NOT the Lucene search field table: these
 * keys are pipeline sourceConfig include* patterns, not search query fields.
 */
export interface ServiceFilterValues {
  includeViews?: boolean;
  includeSchemas?: string;
  includeTopics?: string;
  includeDashboards?: string;
  includeCharts?: string;
  includeContainers?: string;
}

export interface ServiceFilterFieldDef {
  key: keyof ServiceFilterValues;
  control: 'checkbox' | 'text';
  labelKey: string;
  helpKey?: string;
  testId: string;
}

export const SERVICE_FILTER_FIELDS_BY_KIND: Record<ServiceKind, readonly ServiceFilterFieldDef[]> = {
  database: [
    { key: 'includeViews', control: 'checkbox', labelKey: 'ingestion.pipelines.includeViews', testId: 'filter-include-views' },
    {
      key: 'includeSchemas',
      control: 'text',
      labelKey: 'ingestion.pipelines.includeSchemas',
      helpKey: 'ingestion.pipelines.includeSchemasHelp',
      testId: 'filter-include-schemas',
    },
  ],
  messaging: [
    {
      key: 'includeTopics',
      control: 'text',
      labelKey: 'ingestion.pipelines.includeTopics',
      helpKey: 'ingestion.pipelines.includeTopicsHelp',
      testId: 'filter-include-topics',
    },
  ],
  dashboard: [
    {
      key: 'includeDashboards',
      control: 'text',
      labelKey: 'ingestion.pipelines.includeDashboards',
      helpKey: 'ingestion.pipelines.includeDashboardsHelp',
      testId: 'filter-include-dashboards',
    },
    {
      key: 'includeCharts',
      control: 'text',
      labelKey: 'ingestion.pipelines.includeCharts',
      helpKey: 'ingestion.pipelines.includeChartsHelp',
      testId: 'filter-include-charts',
    },
  ],
  storage: [
    {
      key: 'includeContainers',
      control: 'text',
      labelKey: 'ingestion.pipelines.includeContainers',
      helpKey: 'ingestion.pipelines.includeContainersHelp',
      testId: 'filter-include-containers',
    },
  ],
  pipeline: [],
};

export function serviceFilterFieldsForKind(kind: ServiceKind): readonly ServiceFilterFieldDef[] {
  return SERVICE_FILTER_FIELDS_BY_KIND[kind] ?? [];
}
