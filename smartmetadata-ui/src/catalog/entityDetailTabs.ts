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
  { key: 'table_queries', labelKey: 'tableQueries', slot: 'tableQueries' },
  { key: 'profiler', labelKey: 'dataObservability', slot: 'profiler' },
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
// B2-G1: the assets tab is served by GET /v1/metrics/{id}/assets
// (getMetricAssets), so it is no longer a residual.
const METRIC_TABS: EntityDetailTabDef[] = [
  { key: 'overview', labelKey: 'overview', slot: 'metricOverview' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'assets', labelKey: 'assets', slot: 'assets' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// Official: pages/APICollectionPage (overview + endpoints tab) and
// pages/APIEndpointPage (overview + endpoint tab), reached through the
// generic entity detail route.
const API_COLLECTION_TABS: EntityDetailTabDef[] = [
  { key: 'overview', labelKey: 'overview', slot: 'overview' },
  { key: 'apiEndpoints', labelKey: 'apiEndpoints', slot: 'apiEndpoints' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const API_ENDPOINT_TABS: EntityDetailTabDef[] = [
  { key: 'overview', labelKey: 'overview', slot: 'overview' },
  { key: 'endpoint', labelKey: 'endpoint', slot: 'endpoint' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  // L6: pin APIEndpointUtils mounts the lineage tab after activity
  // (SCHEMA → ACTIVITY_FEED → LINEAGE → CONTRACT → CUSTOM_PROPERTIES);
  // the product has no schema/contract tabs, so lineage sits here.
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

// D-TAB-2 (host lane + tab-mount lane): DriveService detail tabs. Pin tab
// order per type (DirectoryDetailsUtils.tsx / FileDetailsUtils.tsx /
// SpreadsheetDetailsUtils.tsx / WorksheetDetailsUtils.tsx, a3012259ca):
// first tab → activity_feed → LINEAGE → contract → custom_properties.
// The lineage entry is mounted here (L3d); the `#lineage` slot in
// AssetDetailView renders `<LineageCanvas variant="tab">` for any tab with
// slot `lineage`, and drive types are unflipped so the slot's fallback pane
// renders it (PIN-MEMO.md §1.2). Contract is residual, as for every other
// split type (no contract API is wired). File's schema tab is unconditional
// in the product — pin adds it only when the file has columns; the schema
// piece renders its own empty state for column-less files (bounded
// divergence, PIN-MEMO.md §4 of the host lane).
const DIRECTORY_TABS: EntityDetailTabDef[] = [
  { key: 'children', labelKey: 'children', slot: 'children' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const FILE_TABS: EntityDetailTabDef[] = [
  { key: 'overview', labelKey: 'overview', slot: 'overview' },
  { key: 'schema', labelKey: 'schema', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const SPREADSHEET_TABS: EntityDetailTabDef[] = [
  { key: 'worksheets', labelKey: 'worksheets', slot: 'worksheets' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
  { key: 'custom_properties', labelKey: 'customProperties', slot: 'customProperties' },
];

const WORKSHEET_TABS: EntityDetailTabDef[] = [
  { key: 'schema', labelKey: 'schema', slot: 'schema' },
  { key: 'activity_feed', labelKey: 'activityFeed', slot: 'activity' },
  { key: 'lineage', labelKey: 'lineage', slot: 'lineage' },
  { key: 'contract', labelKey: 'contract', slot: 'residual', residual: 'asset.tabResidual.contract' },
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
  apiCollection: API_COLLECTION_TABS,
  apiEndpoint: API_ENDPOINT_TABS,
  directory: DIRECTORY_TABS,
  file: FILE_TABS,
  spreadsheet: SPREADSHEET_TABS,
  worksheet: WORKSHEET_TABS,
};

/** True when the entity's tabs follow the official tab ids in this stage. */
export function isOfficiallySplit(entityType: string): boolean {
  return entityType in OFFICIAL_TABS;
}

/**
 * Rendered tabs the editor's tab model can never mention, kept and
 * appended in default order when the customized list omits them (the
 * `preserveKeys` of `getDetailsTabWithNewLabel`): the editor's tab
 * model writes official ids only, so a product-only surface would
 * otherwise vanish the moment any customization exists, with no way
 * for the customization to keep it. Split tab sets are otherwise
 * fully resolvable, except the API views' `overview` (the
 * APICollection/APIEndpoint tab builders and TabsIds carry no
 * OVERVIEW). Official entity-detail TabsIds have no top-level Quality
 * tab on any asset type (table quality lives under Profiler / Data
 * Observability), so fallback sets do not preserve a product-invented
 * `quality` slot. The pipeline, directory, spreadsheet, and worksheet
 * sets still carry an `overview` no official id resolves to (their
 * TabsIds name neither `overview` nor an id aliasing to it). Chart's
 * `overview` resolves through the `details` alias and File's matches
 * the official OVERVIEW id, so neither is preserved.
 * `hasSplitDefs` is whether the entity has split tab definitions
 * (`entityDetailTabDefs(...) !== null`), decided by the caller. The
 * directory/file/spreadsheet/worksheet branches below are the fallback
 * policy for unsplit states: since the D-TAB-2 host lane split those
 * types, they no longer fire through the view (which passes
 * `hasSplitDefs: true` for them) and are kept — locked by direct-call
 * tests — so a future unsplit state still preserves the right keys.
 */
export function preservedTabKeys(entityType: string, hasSplitDefs: boolean): string[] {
  if (hasSplitDefs) {
    return entityType === 'apiCollection' || entityType === 'apiEndpoint' ? ['overview'] : [];
  }
  const keys: string[] = [];
  if (
    entityType === 'pipeline' ||
    entityType === 'directory' ||
    entityType === 'spreadsheet' ||
    entityType === 'worksheet'
  ) {
    keys.push('overview');
  }
  return keys;
}

export function entityDetailTabDefs(entityType: string): EntityDetailTabDef[] | null {
  return OFFICIAL_TABS[entityType] ?? null;
}

export function entityDetailTabDef(entityType: string, key: string): EntityDetailTabDef | null {
  return entityDetailTabDefs(entityType)?.find((tab) => tab.key === key) ?? null;
}
