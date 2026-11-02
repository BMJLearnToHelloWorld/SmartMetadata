/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Per-entity detail tab definitions, mapped from the official detail-page
 * tab ids (EntityTabs): TableClassBase.getTableDetailPageTabsIds,
 * TopicClassBase.getTopicDetailPageTabsIds,
 * DashboardDetailsClassBase.getDashboardDetailPageTabsIds.
 *
 * `slot` names the content slot in AssetDetailView that renders the tab;
 * `residual` tabs have a key but no product API behind them, so the view
 * renders an honest empty state with the stated reason instead of content.
 * Entities not listed here are not yet split in this stage: the view keeps
 * the pre-existing product tab set for them and this module says so.
 */
export interface EntityDetailTabDef {
  key: string;
  labelKey: string;
  slot: string;
  residual?: string;
}

const TABLE_TABS: EntityDetailTabDef[] = [
  { key: 'schema', labelKey: 'schema', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'sample_data', labelKey: 'sampleData', slot: 'sample' },
  { key: 'table_queries', labelKey: 'tableQueries', slot: 'residual', residual: 'asset.tabResidual.tableQueries' },
  { key: 'profiler', labelKey: 'profiler', slot: 'profiler' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'dbt', labelKey: 'dbt', slot: 'residual', residual: 'asset.tabResidual.dbt' },
  { key: 'view_definition', labelKey: 'viewDefinition', slot: 'residual', residual: 'asset.tabResidual.viewDefinition' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const TOPIC_TABS: EntityDetailTabDef[] = [
  { key: 'schema', labelKey: 'schema', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'sample_data', labelKey: 'sampleData', slot: 'sample' },
  { key: 'config', labelKey: 'config', slot: 'residual', residual: 'asset.tabResidual.config' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const DASHBOARD_TABS: EntityDetailTabDef[] = [
  { key: 'details', labelKey: 'details', slot: 'details' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/Database/DatabaseClassBase.ts getDatabaseDetailPageTabsIds
const DATABASE_TABS: EntityDetailTabDef[] = [
  { key: 'schemas', labelKey: 'schemas', slot: 'related' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/DatabaseSchemaClassBase.ts getDatabaseSchemaPageTabsIds
const DATABASE_SCHEMA_TABS: EntityDetailTabDef[] = [
  { key: 'table', labelKey: 'table', slot: 'related' },
  { key: 'stored_procedure', labelKey: 'storedProcedure', slot: 'residual', residual: 'asset.tabResidual.storedProcedure' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/ContainerDetailsClassBase.ts getContainerDetailPageTabsIds
const CONTAINER_TABS: EntityDetailTabDef[] = [
  { key: 'schema', labelKey: 'schema', slot: 'schema' },
  { key: 'children', labelKey: 'children', slot: 'related' },
  { key: 'sample_data', labelKey: 'sampleData', slot: 'residual', residual: 'asset.tabResidual.sampleData' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/DashboardDataModelClassBase.ts getDashboardDataModelDetailPageTabsIds
const DATA_MODEL_TABS: EntityDetailTabDef[] = [
  { key: 'model', labelKey: 'model', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/MlModel/MlModelClassBase.ts getMlModelDetailPageTabsIds
const MLMODEL_TABS: EntityDetailTabDef[] = [
  { key: 'features', labelKey: 'features', slot: 'features' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'details', labelKey: 'details', slot: 'details' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/SearchIndexDetailsClassBase.ts getSearchIndexDetailPageTabsIds
const SEARCH_INDEX_TABS: EntityDetailTabDef[] = [
  { key: 'fields', labelKey: 'fields', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'sample_data', labelKey: 'sampleData', slot: 'residual', residual: 'asset.tabResidual.sampleData' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'search_index_settings', labelKey: 'searchIndexSettings', slot: 'residual', residual: 'asset.tabResidual.searchIndexSettings' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/StoredProcedureClassBase.ts getStoredProcedureDetailPageTabsIds
const STORED_PROCEDURE_TABS: EntityDetailTabDef[] = [
  { key: 'code', labelKey: 'code', slot: 'code' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: utils/MetricEntityUtils/MetricDetailsClassBase.ts getMetricDetailPageTabsIds
const METRIC_TABS: EntityDetailTabDef[] = [
  { key: 'overview', labelKey: 'overview', slot: 'metricOverview' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'assets', labelKey: 'assets', slot: 'residual', residual: 'asset.tabResidual.assets' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const OFFICIAL_TABS: Record<string, EntityDetailTabDef[]> = {
  table: TABLE_TABS,
  topic: TOPIC_TABS,
  dashboard: DASHBOARD_TABS,
  database: DATABASE_TABS,
  databaseSchema: DATABASE_SCHEMA_TABS,
  container: CONTAINER_TABS,
  dashboardDataModel: DATA_MODEL_TABS,
  mlmodel: MLMODEL_TABS,
  searchIndex: SEARCH_INDEX_TABS,
  storedProcedure: STORED_PROCEDURE_TABS,
  metric: METRIC_TABS,
};

/** True when the entity's tabs follow the official tab ids in this stage. */
export function isOfficiallySplit(entityType: string): boolean {
  return entityType in OFFICIAL_TABS;
}

export function entityDetailTabDefs(entityType: string): EntityDetailTabDef[] | null {
  return OFFICIAL_TABS[entityType] ?? null;
}

export function entityDetailTabDef(entityType: string, key: string): EntityDetailTabDef | null {
  return entityDetailTabDefs(entityType)?.find((tab) => tab.key === key) ?? null;
}
