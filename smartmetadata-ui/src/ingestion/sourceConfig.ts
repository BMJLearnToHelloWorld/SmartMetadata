/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PipelineFormValues, PipelineSourceConfig, PipelineType, ServiceKind } from '@/types/ingestion';

function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** OM metadataIngestion sourceConfig.config.type for a pipelineType + service kind. */
export function sourceConfigTypeForPipeline(
  pipelineType: string,
  kind: ServiceKind,
): string {
  if (pipelineType === 'lineage') {
    return 'DatabaseLineage';
  }
  if (pipelineType === 'usage') {
    return 'DatabaseUsage';
  }
  if (pipelineType === 'profiler') {
    return 'Profiler';
  }
  if (pipelineType === 'TestSuite') {
    return 'TestSuite';
  }
  // metadata (default) — kind-specific OM metadata pipeline config types
  return sourceConfigTypeForKind(kind);
}

export function buildSourceConfig(form: PipelineFormValues): PipelineSourceConfig {
  const pipelineType = (form.pipelineType || 'metadata') as PipelineType;
  if (form.serviceKind === 'messaging') {
    const includes = splitCsv(form.includeTopics);
    return {
      config: {
        type: sourceConfigTypeForPipeline(pipelineType, 'messaging'),
        ...(includes.length ? { topicFilterPattern: { includes } } : {}),
      },
    };
  }
  if (form.serviceKind === 'dashboard') {
    const dashboards = splitCsv(form.includeDashboards);
    const charts = splitCsv(form.includeCharts);
    return {
      config: {
        type: sourceConfigTypeForPipeline(pipelineType, 'dashboard'),
        ...(dashboards.length ? { dashboardFilterPattern: { includes: dashboards } } : {}),
        ...(charts.length ? { chartFilterPattern: { includes: charts } } : {}),
      },
    };
  }
  if (form.serviceKind === 'storage') {
    const containers = splitCsv(form.includeContainers);
    return {
      config: {
        type: sourceConfigTypeForPipeline(pipelineType, 'storage'),
        ...(containers.length ? { containerFilterPattern: { includes: containers } } : {}),
      },
    };
  }
  const includes = splitCsv(form.includeSchemas);
  const configType = sourceConfigTypeForPipeline(pipelineType, 'database');
  if (pipelineType === 'lineage' || pipelineType === 'usage') {
    return {
      config: {
        type: configType,
        ...(includes.length ? { schemaFilterPattern: { includes } } : {}),
      },
    };
  }
  if (pipelineType === 'profiler' || pipelineType === 'TestSuite') {
    return {
      config: {
        type: configType,
        ...(includes.length ? { schemaFilterPattern: { includes } } : {}),
      },
    };
  }
  return {
    config: {
      type: configType,
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
  | 'includeViews'
  | 'includeSchemas'
  | 'includeTopics'
  | 'includeDashboards'
  | 'includeCharts'
  | 'includeContainers'
> {
  const config = sourceConfig?.config ?? {};
  const schemaIncludes = config.schemaFilterPattern?.includes ?? [];
  const topicIncludes = config.topicFilterPattern?.includes ?? [];
  const dashboardIncludes = config.dashboardFilterPattern?.includes ?? [];
  const chartIncludes = config.chartFilterPattern?.includes ?? [];
  const containerIncludes = config.containerFilterPattern?.includes ?? [];
  return {
    includeViews: kind === 'database' ? config.includeViews !== false : true,
    includeSchemas: schemaIncludes.join(', '),
    includeTopics: topicIncludes.join(', '),
    includeDashboards: dashboardIncludes.join(', '),
    includeCharts: chartIncludes.join(', '),
    includeContainers: containerIncludes.join(', '),
  };
}

export function sourceConfigTypeForKind(kind: ServiceKind): string {
  if (kind === 'messaging') {
    return 'MessagingMetadata';
  }
  if (kind === 'dashboard') {
    return 'DashboardMetadata';
  }
  if (kind === 'storage') {
    return 'StorageMetadata';
  }
  return 'DatabaseMetadata';
}
