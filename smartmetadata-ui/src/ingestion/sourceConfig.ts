/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PipelineFormValues, PipelineSourceConfig, ServiceKind } from '@/types/ingestion';

function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildSourceConfig(form: PipelineFormValues): PipelineSourceConfig {
  if (form.serviceKind === 'messaging') {
    const includes = splitCsv(form.includeTopics);
    return {
      config: {
        type: 'MessagingMetadata',
        ...(includes.length ? { topicFilterPattern: { includes } } : {}),
      },
    };
  }
  if (form.serviceKind === 'dashboard') {
    const dashboards = splitCsv(form.includeDashboards);
    const charts = splitCsv(form.includeCharts);
    return {
      config: {
        type: 'DashboardMetadata',
        ...(dashboards.length ? { dashboardFilterPattern: { includes: dashboards } } : {}),
        ...(charts.length ? { chartFilterPattern: { includes: charts } } : {}),
      },
    };
  }
  const includes = splitCsv(form.includeSchemas);
  return {
    config: {
      type: 'DatabaseMetadata',
      includeViews: form.includeViews,
      includeTables: true,
      ...(includes.length ? { schemaFilterPattern: { includes } } : {}),
    },
  };
}

export function formHintsFromSourceConfig(
  sourceConfig: PipelineSourceConfig | undefined,
  kind: ServiceKind,
): Pick<
  PipelineFormValues,
  'includeViews' | 'includeSchemas' | 'includeTopics' | 'includeDashboards' | 'includeCharts'
> {
  const config = sourceConfig?.config ?? {};
  const schemaIncludes = config.schemaFilterPattern?.includes ?? [];
  const topicIncludes = config.topicFilterPattern?.includes ?? [];
  const dashboardIncludes = config.dashboardFilterPattern?.includes ?? [];
  const chartIncludes = config.chartFilterPattern?.includes ?? [];
  return {
    includeViews: kind === 'database' ? config.includeViews !== false : true,
    includeSchemas: schemaIncludes.join(', '),
    includeTopics: topicIncludes.join(', '),
    includeDashboards: dashboardIncludes.join(', '),
    includeCharts: chartIncludes.join(', '),
  };
}

export function sourceConfigTypeForKind(kind: ServiceKind): string {
  if (kind === 'messaging') {
    return 'MessagingMetadata';
  }
  if (kind === 'dashboard') {
    return 'DashboardMetadata';
  }
  return 'DatabaseMetadata';
}
