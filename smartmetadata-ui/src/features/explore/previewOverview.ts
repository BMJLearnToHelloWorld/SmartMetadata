/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { bytesToSize } from '@/components/shared/fileNode';
import { splitFqn } from '@/catalog/fqn';
import { getUsageData } from '@/catalog/usagePercentile';
import { assetLocation, assetTabLocation } from '@/catalog/entityRoutes';
import type { SearchHitLocation } from '@/catalog/entityRoutes';
import { formatTierLabel, getTierTag } from '@/ingestion/tierTags';
import type { AssetDetail, EntityRef, SearchHit, TagRef } from '@/types/api';

/**
 * E-3a: pin `DataAssetSummaryPanelUtils.tsx` (a3012259ca) overview builders,
 * filtered to the explore-visible rows (`visible` includes `explore`).
 * Pin's `getEntityOverview` dispatches to 13 per-type builders; types
 * without a builder get no overview rows. The old product preview showed
 * one generic row set for every type — including service / database /
 * schema / usage rows pin shows only in its lineage-drawer mode.
 *
 * Tab gating sets are pin `EntityRightPanelVerticalNav.constants.ts`
 * (`SCHEMA_TABS_SET`, `LINEAGE_TABS_SET`, `CUSTOM_PROPERTIES_TABS_SET`).
 * Layout variants are pin `DataAssetSummaryPanelV1.tsx:731-953`
 * (knowledge page, data product, misc).
 */

// Pin SCHEMA_TABS_SET (11 types).
export const PREVIEW_SCHEMA_TAB_TYPES: ReadonlySet<string> = new Set([
  'apiCollection',
  'apiEndpoint',
  'container',
  'dashboard',
  'dashboardDataModel',
  'database',
  'databaseSchema',
  'pipeline',
  'searchIndex',
  'table',
  'topic',
]);

// Pin LINEAGE_TABS_SET (11 types).
export const PREVIEW_LINEAGE_TAB_TYPES: ReadonlySet<string> = new Set([
  'apiEndpoint',
  'chart',
  'container',
  'dashboard',
  'dashboardDataModel',
  'directory',
  'mlmodel',
  'pipeline',
  'searchIndex',
  'table',
  'topic',
]);

// Pin CUSTOM_PROPERTIES_TABS_SET (23 types).
export const PREVIEW_CUSTOM_PROPERTIES_TAB_TYPES: ReadonlySet<string> = new Set([
  'apiCollection',
  'apiEndpoint',
  'chart',
  'container',
  'dashboard',
  'dashboardDataModel',
  'database',
  'databaseSchema',
  'dataProduct',
  'directory',
  'domain',
  'file',
  'glossaryTerm',
  'metric',
  'mlmodel',
  'pipeline',
  'searchIndex',
  'spreadsheet',
  'storedProcedure',
  'table',
  'topic',
  'worksheet',
  'tableColumn',
]);

/** Pin MISC_LAYOUT_ENTITY_TYPES (DataAssetSummaryPanelV1.tsx:123-151), mapped to product entityType strings. */
export const PREVIEW_MISC_LAYOUT_TYPES: ReadonlySet<string> = new Set([
  'user',
  'team',
  'role',
  'policy',
  'bot',
  'webhook',
  'persona',
  'kpi',
  'dataInsightChart',
  'docStore',
  'type',
  'sampleData',
  'customMetric',
  'notificationTemplate',
  'ingestionRunner',
  'appMarketPlaceDefinition',
  'service',
  'subscription',
  'lineageEdge',
  'entityReportData',
  'webAnalyticEntityViewReportData',
  'webAnalyticUserActivityReportData',
  'testCaseResolutionStatus',
  'testCaseResult',
  'all',
  'knowledgePanels',
]);

export type PreviewLayout = 'common' | 'knowledgePage' | 'dataProduct' | 'misc';

/**
 * Pin layout dispatch (DataAssetSummaryPanelV1.tsx:954-968): knowledge page
 * and data product have their own layouts, the misc set has the minimal
 * one, and everything else renders the common layout. Pin returns null for
 * a type in none of the sets; the product falls back to the common layout
 * instead — every search-index type the product emits is in pin's common
 * set, so the fallback only ever covers a future unknown type, which
 * still needs its description and owners shown.
 */
export function previewLayoutFor(entityType: string): PreviewLayout {
  if (entityType === 'page') {
    return 'knowledgePage';
  }
  if (entityType === 'dataProduct') {
    return 'dataProduct';
  }
  if (PREVIEW_MISC_LAYOUT_TYPES.has(entityType)) {
    return 'misc';
  }
  return 'common';
}

export interface PreviewOverviewRow {
  key: string;
  label: string;
  value: string;
  /** Internal router destination (pin `isLink` rows). */
  to?: SearchHitLocation;
  /** External URL (pin `isExternal` rows). */
  href?: string;
}

export interface PreviewOverviewInput {
  hit: SearchHit;
  /** Canonical entity fetched by FQN, or null when the type has no detail endpoint / the fetch failed (pin: hit data as-is). */
  detail: AssetDetail | null;
  /** Table query count (pin `QueryCount`); omitted while still loading. */
  queryCount?: number;
  /** Table incident count, last 30 days (pin `fetchIncidentCount`); omitted while still loading. */
  incidentCount?: number;
}

export type PreviewTranslate = (key: string) => string;

const NO_DATA = '-';

/** Overview row values are display strings; counts render as decimal text. */
function numValue(value: number | undefined): string {
  return value === undefined ? NO_DATA : String(value);
}

function refName(ref: EntityRef | undefined): string | undefined {
  return ref?.displayName || ref?.name || ref?.fullyQualifiedName || undefined;
}

function tierLabel(hit: SearchHit, detail: AssetDetail | null): string {
  const tag = getTierTag(detail?.tags ?? hit.tags ?? []);
  if (tag) {
    return formatTierLabel(tag.tagFQN);
  }
  return hit.tier ? formatTierLabel(hit.tier) : NO_DATA;
}

function ownersText(hit: SearchHit, detail: AssetDetail | null): string {
  const owners = detail?.owners ?? hit.owners ?? [];
  return owners.length
    ? owners.map((owner) => owner.displayName || owner.name).join(', ')
    : NO_DATA;
}

function displayName(hit: SearchHit, detail: AssetDetail | null): string {
  return detail?.displayName || hit.displayName || hit.name || NO_DATA;
}

function serviceName(hit: SearchHit, detail: AssetDetail | null): string {
  return refName(detail?.service) ?? hit.serviceName ?? NO_DATA;
}

function serviceType(hit: SearchHit, detail: AssetDetail | null): string {
  return detail?.serviceType ?? hit.serviceType ?? NO_DATA;
}

type Builder = (input: PreviewOverviewInput, t: PreviewTranslate) => PreviewOverviewRow[];

const tableBuilder: Builder = ({ hit, detail, queryCount, incidentCount }, t) => {
  const rows: PreviewOverviewRow[] = [
    { key: 'type', label: t('asset.fields.type'), value: detail?.tableType ?? 'Regular' },
  ];
  // Pin QueryCount: loading skeleton, then "No queries" at 0.
  if (queryCount !== undefined) {
    rows.push({
      key: 'queries',
      label: t('asset.tabs.tableQueries'),
      value: queryCount === 0 ? t('explore.noQueries') : String(queryCount),
    });
  }
  rows.push({
    key: 'columns',
    label: t('explore.rowColumns'),
    value: detail ? String(detail.schemaRows.length) : NO_DATA,
  });
  // E-3d: pin Incidents links to the detail page's profiler tab
  // (`getEntityDetailsPath(TABLE, fqn, EntityTabs.PROFILER)`); the
  // product profiler tab is `?tab=profiler` on the asset route.
  if (incidentCount !== undefined) {
    rows.push({
      key: 'incidents',
      label: t('asset.tabs.incidents'),
      value: String(incidentCount),
      to: assetTabLocation('table', hit.fullyQualifiedName, 'profiler'),
    });
  }
  return rows;
};

// Pin getColumnOverview reads the search result, not a fetched column
// entity (tableColumn has no fetch entry in pin's entityFetchMap).
const tableColumnBuilder: Builder = ({ hit }, t) => {
  const rows: PreviewOverviewRow[] = [
    { key: 'dataType', label: t('explore.dataType'), value: hit.dataType ?? NO_DATA },
    {
      key: 'table',
      label: t('explore.table'),
      value: hit.tableName ?? NO_DATA,
      ...(hit.tableFqn ? { to: assetLocation('table', hit.tableFqn) } : {}),
    },
    { key: 'service', label: t('asset.fields.service'), value: hit.serviceName ?? NO_DATA },
    { key: 'database', label: t('asset.fields.database'), value: hit.databaseName ?? NO_DATA },
    { key: 'schema', label: t('asset.fields.schema'), value: hit.schemaName ?? NO_DATA },
  ];
  if (hit.constraint) {
    rows.push({ key: 'constraint', label: t('explore.constraint'), value: hit.constraint });
  }
  return rows;
};

const topicBuilder: Builder = ({ detail }, t) => [
  { key: 'partitions', label: t('asset.fields.partitions'), value: numValue(detail?.partitions) },
  {
    key: 'replicationFactor',
    label: t('explore.rowReplicationFactor'),
    value: numValue(detail?.replicationFactor),
  },
  {
    key: 'retentionSize',
    label: t('explore.rowRetentionSize'),
    value: bytesToSize(detail?.retentionSize ?? 0),
  },
  {
    key: 'cleanupPolicies',
    label: t('explore.rowCleanupPolicies'),
    value: detail?.cleanupPolicies?.length ? detail.cleanupPolicies.join(', ') : NO_DATA,
  },
  {
    key: 'maxMessageSize',
    label: t('explore.rowMaxMessageSize'),
    value: bytesToSize(detail?.maximumMessageSize ?? 0),
  },
  {
    key: 'schemaType',
    label: t('explore.rowSchemaType'),
    value: detail?.messageSchemaType ?? NO_DATA,
  },
];

const pipelineBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'pipelineUrl',
    label: t('explore.rowPipelineUrl'),
    value: displayName(hit, detail),
    ...(detail?.sourceUrl ? { href: detail.sourceUrl } : {}),
  },
];

const dashboardBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'dashboardUrl',
    label: t('explore.rowDashboardUrl'),
    value: displayName(hit, detail),
    ...(detail?.sourceUrl ? { href: detail.sourceUrl } : {}),
  },
  { key: 'project', label: t('asset.fields.project'), value: detail?.project ?? NO_DATA },
];

const mlmodelBuilder: Builder = ({ detail }, t) => [
  { key: 'algorithm', label: t('asset.fields.algorithm'), value: detail?.algorithm ?? NO_DATA },
  { key: 'target', label: t('asset.fields.target'), value: detail?.target ?? NO_DATA },
  {
    key: 'server',
    label: t('explore.rowServer'),
    value: detail?.server ?? NO_DATA,
    ...(detail?.server ? { href: detail.server } : {}),
  },
  {
    key: 'dashboard',
    label: t('explore.rowDashboard'),
    value: refName(detail?.dashboard) ?? NO_DATA,
    ...(detail?.dashboard?.fullyQualifiedName
      ? { to: assetLocation('dashboard', detail.dashboard.fullyQualifiedName) }
      : {}),
  },
];

const containerBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'objects',
    label: t('explore.rowObjects'),
    value: numValue(detail?.numberOfObjects),
  },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
  {
    key: 'columns',
    label: t('explore.rowColumns'),
    value: detail ? String(detail.schemaRows.length) : NO_DATA,
  },
];

const chartBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'chartUrl',
    label: t('explore.rowChartUrl'),
    value: displayName(hit, detail),
    ...(detail?.sourceUrl ? { href: detail.sourceUrl } : {}),
  },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
  { key: 'chartType', label: t('asset.fields.chartType'), value: detail?.chartType ?? NO_DATA },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const dataModelBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'dataModelUrl',
    label: t('explore.rowDataModelUrl'),
    value: displayName(hit, detail),
    to: assetLocation('dashboardDataModel', hit.fullyQualifiedName),
  },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
  { key: 'tier', label: t('explore.facets.tier'), value: tierLabel(hit, detail) },
  {
    key: 'dataModelType',
    label: t('asset.fields.dataModelType'),
    value: detail?.dataModelType ?? NO_DATA,
  },
];

const storedProcedureBuilder: Builder = ({ hit, detail }, t) => {
  const rows: PreviewOverviewRow[] = [
    {
      key: 'schema',
      label: t('asset.fields.schema'),
      // Pin derives service/database/schema from the FQN parts.
      value: splitFqn(hit.fullyQualifiedName)[2] ?? refName(detail?.databaseSchema) ?? hit.schemaName ?? NO_DATA,
    },
    { key: 'tier', label: t('explore.facets.tier'), value: tierLabel(hit, detail) },
  ];
  // Pin only adds the Language row when storedProcedureCode is an object.
  if (detail?.storedProcedureCode) {
    rows.push({
      key: 'language',
      label: t('explore.rowLanguage'),
      value: detail.storedProcedureCode.language ?? NO_DATA,
    });
  }
  return rows;
};

const databaseBuilder: Builder = ({ hit, detail }, t) => [
  { key: 'owners', label: t('asset.fields.owners'), value: ownersText(hit, detail) },
  { key: 'tier', label: t('explore.facets.tier'), value: tierLabel(hit, detail) },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
  {
    key: 'usage',
    label: t('usage.usage'),
    value: getUsageData(detail?.usageSummary?.weeklyStats?.percentileRank, (key) => t(key)),
  },
];

const databaseSchemaBuilder: Builder = ({ hit, detail }, t) => [
  { key: 'owners', label: t('asset.fields.owners'), value: ownersText(hit, detail) },
  { key: 'tier', label: t('explore.facets.tier'), value: tierLabel(hit, detail) },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
  {
    key: 'database',
    label: t('asset.fields.database'),
    value: refName(detail?.database) ?? hit.databaseName ?? NO_DATA,
  },
  {
    key: 'usage',
    label: t('usage.usage'),
    value: getUsageData(detail?.usageSummary?.weeklyStats?.percentileRank, (key) => t(key)),
  },
];

// Pin getEntityServiceOverview: database, messaging, dashboard, ML model,
// pipeline, search, and API services only.
const entityServiceBuilder: Builder = ({ hit, detail }, t) => [
  { key: 'owners', label: t('asset.fields.owners'), value: ownersText(hit, detail) },
  { key: 'tier', label: t('explore.facets.tier'), value: tierLabel(hit, detail) },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const apiCollectionBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'endpointUrl',
    label: t('explore.rowEndpointUrl'),
    value: detail?.apiEndpointUrl ?? NO_DATA,
    ...(detail?.apiEndpointUrl ? { href: detail.apiEndpointUrl } : {}),
  },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
];

const apiEndpointBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'endpointUrl',
    label: t('explore.rowEndpointUrl'),
    value: detail?.apiEndpointUrl ?? NO_DATA,
    ...(detail?.apiEndpointUrl ? { href: detail.apiEndpointUrl } : {}),
  },
  {
    key: 'apiCollection',
    label: t('explore.rowApiCollection'),
    value: refName(detail?.apiCollection) ?? NO_DATA,
    ...(detail?.apiCollection?.fullyQualifiedName
      ? { to: assetLocation('apiCollection', detail.apiCollection.fullyQualifiedName) }
      : {}),
  },
  { key: 'service', label: t('asset.fields.service'), value: serviceName(hit, detail) },
  {
    key: 'requestMethod',
    label: t('explore.rowRequestMethod'),
    value: detail?.apiRequestMethod ?? hit.requestMethod ?? NO_DATA,
  },
];

const metricBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'metricType',
    label: t('asset.fields.metricType'),
    value: detail?.metricType ?? hit.metricType ?? NO_DATA,
  },
  {
    key: 'unitOfMeasurement',
    label: t('asset.fields.unitOfMeasurement'),
    value: detail?.unitOfMeasurement ?? NO_DATA,
  },
  {
    key: 'granularity',
    label: t('asset.fields.granularity'),
    value: detail?.granularity ?? hit.granularity ?? NO_DATA,
  },
];

const directoryBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'directories',
    label: t('explore.rowDirectories'),
    value: numValue(detail?.numberOfSubDirectories),
  },
  {
    key: 'files',
    label: t('explore.rowFiles'),
    value: numValue(detail?.numberOfFiles),
  },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const fileBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'fileExtension',
    label: t('explore.rowFileExtension'),
    value: detail?.fileExtension ?? NO_DATA,
  },
  { key: 'fileType', label: t('explore.rowFileType'), value: detail?.fileType ?? NO_DATA },
  {
    key: 'fileVersion',
    label: t('explore.rowFileVersion'),
    value: detail?.fileVersion ?? NO_DATA,
  },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const spreadsheetBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'fileVersion',
    label: t('explore.rowFileVersion'),
    value: detail?.fileVersion ?? NO_DATA,
  },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const worksheetBuilder: Builder = ({ hit, detail }, t) => [
  {
    key: 'columns',
    label: t('explore.rowColumns'),
    value: detail ? String(detail.schemaRows.length) : NO_DATA,
  },
  { key: 'rows', label: t('explore.rowRows'), value: numValue(detail?.rowCount) },
  { key: 'serviceType', label: t('asset.fields.serviceType'), value: serviceType(hit, detail) },
];

const PREVIEW_OVERVIEW_BUILDERS: Record<string, Builder> = {
  table: tableBuilder,
  tableColumn: tableColumnBuilder,
  topic: topicBuilder,
  pipeline: pipelineBuilder,
  dashboard: dashboardBuilder,
  searchIndex: () => [],
  mlmodel: mlmodelBuilder,
  container: containerBuilder,
  chart: chartBuilder,
  dashboardDataModel: dataModelBuilder,
  storedProcedure: storedProcedureBuilder,
  database: databaseBuilder,
  databaseSchema: databaseSchemaBuilder,
  databaseService: entityServiceBuilder,
  messagingService: entityServiceBuilder,
  dashboardService: entityServiceBuilder,
  mlmodelService: entityServiceBuilder,
  pipelineService: entityServiceBuilder,
  searchService: entityServiceBuilder,
  apiService: entityServiceBuilder,
  apiCollection: apiCollectionBuilder,
  apiEndpoint: apiEndpointBuilder,
  metric: metricBuilder,
  directory: directoryBuilder,
  file: fileBuilder,
  spreadsheet: spreadsheetBuilder,
  worksheet: worksheetBuilder,
};

/**
 * Pin `getEntityOverview` (DataAssetSummaryPanelUtils.tsx:1356-1369):
 * dispatch to the per-type builder, or no rows when the type has none.
 * Rows are already filtered to the explore-visible set — the builders
 * above only emit those rows.
 */
export function buildPreviewOverviewRows(
  input: PreviewOverviewInput,
  t: PreviewTranslate,
): PreviewOverviewRow[] {
  const builder = PREVIEW_OVERVIEW_BUILDERS[input.hit.entityType];
  return builder ? builder(input, t) : [];
}

/** Classification tags only (pin data-product layout filters Glossary tags out of the Tags section). */
export function classificationTagsOf(tags: TagRef[] | undefined): TagRef[] {
  return (tags ?? []).filter((tag) => tag.source !== 'Glossary');
}

/**
 * E-3a permission target (part-4 #28). Mirrors pin EntitySummaryPanel's
 * resource + identifier precedence: by-id when the hit carries one, else
 * by FQN; a tableColumn inherits its parent table's permissions (pin
 * substitutes the parent table's type and id — the product has only the
 * parent FQN, so it gates by-FQN on the parent table). The set mirrors
 * the product's `ResourceEntity` union in
 * `composables/useEntityPermissions.ts`; a hit type outside it stays
 * ungated (recorded open in the lane report) rather than inventing a
 * resource the server does not evaluate.
 */
export const PREVIEW_PERMISSION_RESOURCES: ReadonlySet<string> = new Set([
  'type', 'ontology', 'ontologyConcept', 'ontologyProperty', 'ontologyAxiom', 'ontologyRelease',
  'relationshipType', 'glossary', 'glossaryTerm', 'role', 'policy', 'persona', 'table',
  'database', 'databaseSchema', 'dashboard', 'pipeline', 'topic', 'container', 'mlmodel',
  'searchIndex', 'dashboardDataModel', 'storedProcedure', 'chart', 'metric', 'apiCollection',
  'apiEndpoint', 'query', 'domain', 'dataProduct', 'tag', 'classification', 'ingestionPipeline',
  'testCase', 'testSuite', 'testDefinition', 'testCaseResolutionStatus', 'kpi', 'dataInsightChart',
  'feed', 'report', 'webhook', 'page', 'eventsubscription', 'app', 'task', 'dataContract',
  'tableColumn', 'auditLog', 'notificationTemplate', 'contextMemory', 'ontologyChangeSet', 'bot',
  'dashboardService', 'databaseService', 'searchService', 'securityService', 'messagingService',
  'metadataService', 'mlmodelService', 'pipelineService', 'apiService', 'driveService',
  'storageService', 'ingestionRunner', 'location', 'directory', 'file', 'spreadsheet',
  'worksheet', 'team', 'user',
]);

export interface PreviewPermissionTarget {
  resource: string;
  identifier: string | { id: string };
}

export function previewPermissionTarget(hit: SearchHit): PreviewPermissionTarget | null {
  if (hit.entityType === 'tableColumn') {
    return { resource: 'table', identifier: hit.tableFqn ?? hit.fullyQualifiedName };
  }
  if (!PREVIEW_PERMISSION_RESOURCES.has(hit.entityType)) {
    return null;
  }
  return {
    resource: hit.entityType,
    identifier: hit.id ? { id: hit.id } : hit.fullyQualifiedName,
  };
}
