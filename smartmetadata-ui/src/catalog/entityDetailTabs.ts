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

const OFFICIAL_TABS: Record<string, EntityDetailTabDef[]> = {
  table: TABLE_TABS,
  topic: TOPIC_TABS,
  dashboard: DASHBOARD_TABS,
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
