/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Data-driven ingestion tab/category registry, following the Stage 4/5/6
 * governanceTabs / qualityTabs / insightsTabs pattern. Tab rows are data,
 * never if-else branches in views: a view looks its entity up here and
 * renders the supported tabs, leaving unsupported ones as honest residuals.
 *
 * Official prototypes (read-only reference, openmetadata-ui):
 * ServicesPage (per-category services/pipelines tabs), ServiceDetailsPage
 * (insights/agents/connection/assets/ingestion tabs), ServiceVersionPage,
 * PipelineDetailsPage (tasks/DAG + executions), AddServicePage (3-step
 * wizard), EditConnectionFormPage, EmbeddedAddServicePage, AddIngestionPage
 * / EditIngestionPage (2-step wizard). A tab is marked supported only when
 * the product view actually wires it; anything else carries a residual
 * reason and must not be rendered as if it worked.
 */
export interface IngestionTab {
  key: string;
  /** i18n key for the tab label. */
  labelKey: string;
  supported: boolean;
  /** Why the tab is residual; absent for supported tabs. */
  residualReason?: string;
}

export interface ServiceCategoryRow {
  key: string;
  /** i18n key for the category label. */
  labelKey: string;
  supported: boolean;
  residualReason?: string;
}

/** Official service categories; only the five product kinds have API modules. */
export const SERVICE_CATEGORIES: ServiceCategoryRow[] = [
  { key: 'database', labelKey: 'ingestion.services.database', supported: true },
  { key: 'messaging', labelKey: 'ingestion.services.messaging', supported: true },
  { key: 'dashboard', labelKey: 'ingestion.services.dashboard', supported: true },
  { key: 'storage', labelKey: 'ingestion.services.storage', supported: true },
  { key: 'pipeline', labelKey: 'ingestion.services.pipeline', supported: true },
  {
    key: 'metadata',
    labelKey: 'ingestion.services.metadata',
    supported: false,
    residualReason: 'No metadata-service API module is wired in this console.',
  },
  {
    key: 'security',
    labelKey: 'ingestion.services.security',
    supported: false,
    residualReason: 'No security-service API module is wired in this console.',
  },
  {
    key: 'mlmodel',
    labelKey: 'ingestion.services.mlmodel',
    supported: false,
    residualReason: 'No mlmodel-service API module is wired in this console.',
  },
  {
    key: 'search',
    labelKey: 'ingestion.services.search',
    supported: false,
    residualReason: 'No search-service API module is wired in this console.',
  },
  {
    key: 'api',
    labelKey: 'ingestion.services.api',
    supported: false,
    residualReason: 'No api-service API module is wired in this console.',
  },
  {
    key: 'drive',
    labelKey: 'ingestion.services.drive',
    supported: false,
    residualReason: 'No drive-service API module is wired in this console.',
  },
];

export const SERVICE_DETAIL_TABS: IngestionTab[] = [
  { key: 'overview', labelKey: 'crud.overview', supported: true },
  { key: 'connection', labelKey: 'ingestion.services.connectionTab', supported: true },
  { key: 'pipelines', labelKey: 'ingestion.services.pipelinesTab', supported: true },
  {
    key: 'assets',
    labelKey: 'ingestion.services.assetsTab',
    supported: false,
    residualReason: 'No per-category asset list API is wired for services.',
  },
  {
    key: 'insights',
    labelKey: 'ingestion.services.insightsTab',
    supported: false,
    residualReason: 'No service-insights workflow API is wired.',
  },
  {
    key: 'agents',
    labelKey: 'ingestion.services.agentsTab',
    supported: false,
    residualReason: 'No metadata-agent API is wired for services.',
  },
  {
    key: 'versions',
    labelKey: 'ingestion.services.versionsTab',
    supported: false,
    residualReason: 'No service versions API is wired; the generic version resolver has no service collections.',
  },
];

export const INGESTION_PIPELINE_TABS: IngestionTab[] = [
  { key: 'overview', labelKey: 'crud.overview', supported: true },
  { key: 'status', labelKey: 'ingestion.pipelines.statusTab', supported: true },
  {
    key: 'trigger',
    labelKey: 'ingestion.pipelines.triggerTab',
    supported: false,
    residualReason: 'No pipeline trigger/deploy endpoint is wired; jobs run with smartmetadata-ingest.',
  },
];

export const PIPELINE_ENTITY_TABS: IngestionTab[] = [
  { key: 'tasks', labelKey: 'ingestion.pipelines.tasksTab', supported: true },
  { key: 'executions', labelKey: 'ingestion.pipelines.executionsTab', supported: true },
];

/** Tabs a view renders from a registry list (supported + honest residuals). */
export function ingestionTabKeys(tabs: readonly IngestionTab[]): string[] {
  return tabs.map((tab) => tab.key);
}
