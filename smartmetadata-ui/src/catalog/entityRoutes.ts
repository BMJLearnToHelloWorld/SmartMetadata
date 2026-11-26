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
 * Catalog types with a slim GET /v1/{collection}/name/{fqn}. Search hits for
 * any other type stay navigable but unwired — do not invent collections.
 *
 * `usageSummary` is deliberately NOT in any field set below: the pin
 * requests it only when the viewer holds VIEW_USAGE, appending it to the
 * detail field set of exactly the four entity types whose detail header
 * renders the usage percentile (table, dashboard, pipeline, ML model —
 * DataAssetsHeader.utils.tsx header sites). Callers append
 * TABLE_USAGE_SUMMARY_FIELD through fetchAssetDetail's extraFields once
 * the permission is known; `joins` is in the VIEW_BASIC group and is
 * requested unconditionally for tables.
 */
export const TABLE_USAGE_SUMMARY_FIELD = 'usageSummary';

/**
 * Entity types whose pin detail page appends `usageSummary` to the
 * detail request when ViewUsage is granted (TableDetailsPageV1,
 * DashboardDetailsPage, PipelineDetailsPage, MlModelPage) and whose
 * header renders the percentile. Server-side, Table/Dashboard/MlModel
 * resources gate the field on VIEW_USAGE via addViewOperation;
 * PipelineResource has no such mapping (its repository still fetches
 * the field when requested), so the client-side ViewUsage gate is the
 * operative one for pipelines — the pin UI gates it identically.
 * Other VIEW_USAGE-gated resources (chart, database, databaseSchema,
 * drive entities) have no pin header percentile site and stay out.
 */
export const USAGE_SUMMARY_ENTITY_TYPES: readonly string[] = ['table', 'dashboard', 'pipeline', 'mlmodel'];

const DETAIL_ENDPOINTS: Record<string, { collection: string; fields: string }> = {
  table: {
    collection: 'tables',
    fields:
      'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType,tablePartition,tableConstraints,aliases,followers,votes,joins,dataProducts,certification,testSuite',
  },
  topic: { collection: 'topics', fields: 'owners,tags,domains,extension,service,messageSchema,partitions,replicationFactor,retentionSize,cleanupPolicies,maximumMessageSize,followers,votes,dataProducts,certification' },
  dashboard: {
    collection: 'dashboards',
    fields: 'owners,tags,domains,extension,service,charts,dataModels,project,followers,votes,dataProducts,certification',
  },
  pipeline: {
    collection: 'pipelines',
    fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state,followers,votes,dataProducts,certification',
  },
  mlmodel: {
    collection: 'mlmodels',
    fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard,followers,votes,dataProducts,certification',
  },
  container: {
    collection: 'containers',
    fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats,followers,votes,dataProducts,certification',
  },
  searchIndex: {
    collection: 'searchIndexes',
    fields: 'owners,tags,domains,extension,service,fields,indexType,followers,votes,dataProducts,certification',
  },
  storedProcedure: {
    collection: 'storedProcedures',
    fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType,followers,votes,dataProducts,certification',
  },
  chart: {
    collection: 'charts',
    fields: 'owners,tags,domains,extension,service,dashboards,chartType,sourceUrl,followers,votes,dataProducts,certification',
  },
  metric: {
    collection: 'metrics',
    fields: 'owners,tags,domains,extension,metricExpression,metricType,unitOfMeasurement,customUnitOfMeasurement,granularity,followers,votes,dataProducts,certification,relatedMetrics',
  },
  dashboardDataModel: {
    collection: 'dashboard/datamodels',
    fields: 'owners,tags,domains,extension,service,columns,dataModelType,project,sql,sourceUrl,followers,votes,dataProducts,certification',
  },
  database: {
    collection: 'databases',
    fields: 'owners,tags,domains,extension,service,databaseSchemas,sourceUrl,followers,votes,dataProducts,certification',
  },
  databaseSchema: {
    collection: 'databaseSchemas',
    fields: 'owners,tags,domains,extension,service,database,tables,sourceUrl,followers,votes,dataProducts,certification',
  },
  // P2 B5: official APICollectionPage / APIEndpointPage, reached through
  // the generic entity detail route (no explicit router entries exist
  // officially either — EntityDetailComponentUtils maps the types).
  apiCollection: {
    collection: 'apiCollections',
    fields: 'owners,tags,domains,extension,service,followers,votes,dataProducts,certification',
  },
  apiEndpoint: {
    collection: 'apiEndpoints',
    fields: 'owners,tags,domains,extension,service,apiCollection,endpointURL,requestMethod,requestSchema,responseSchema,followers,votes,dataProducts,certification',
  },
  // D-TAB-2 (host lane): DriveService detail pages. Pin `rest/driveAPI.ts`
  // (a3012259ca): BASE_URL '/drives', APIByEntityType
  // {file:'/files', directory:'/directories', spreadsheet:'/spreadsheets',
  // worksheet:'/worksheets'}; `getDriveAssetByFqn` is
  // GET /v1/drives/{segment}/name/{fqn}. The collections below carry the
  // same segments, so the generic fetch/patch/vote/followers/versions
  // resolvers all build the pin paths. Field sets are pin's
  // `defaultFields` per type (DirectoryDetailsUtils.tsx:60-73,
  // FileDetailsUtils.tsx:63-76, SpreadsheetDetailsUtils.tsx:61-74,
  // WorksheetDetailsUtils.tsx:60-71; worksheet's duplicated rowCount
  // kept once).
  directory: {
    collection: 'drives/directories',
    fields:
      'owners,children,followers,tags,domains,dataProducts,votes,extension,directoryType,numberOfFiles,numberOfSubDirectories',
  },
  file: {
    collection: 'drives/files',
    fields:
      'owners,followers,tags,domains,dataProducts,votes,extension,fileType,fileExtension,fileVersion,columns,sampleData',
  },
  spreadsheet: {
    collection: 'drives/spreadsheets',
    fields:
      'owners,worksheets,followers,tags,domains,dataProducts,votes,extension,mimeType,fileVersion,createdTime,modifiedTime',
  },
  worksheet: {
    collection: 'drives/worksheets',
    fields: 'owners,followers,tags,domains,dataProducts,votes,extension,rowCount,columns',
  },
  // C-14: queries are wired for vote/patch (PUT /v1/queries/{id}/vote,
  // PATCH /v1/queries/{id}) and for GET /v1/queries/name/{fqn}, all
  // verified on QueryResource. The field set is the pin vote-refetch set
  // (owners, votes, tags, queryUsedIn, users).
  query: {
    collection: 'queries',
    fields: 'owners,votes,tags,queryUsedIn,users',
  },
};

export function assetLocation(entityType: string, fqn: string): { name: string; params: { entityType: string; fqn: string } } {
  return {
    name: 'asset',
    params: { entityType, fqn },
  };
}

export function lineageLocation(entityType: string, fqn: string): { name: string; params: { entityType: string; fqn: string } } {
  return {
    name: 'lineage',
    params: { entityType, fqn },
  };
}

/**
 * E-3d: pin `EntitySummaryPanel.handleLineageClick`
 * (`EntitySummaryPanel.component.tsx:866-874`) navigates to the entity
 * detail page's Lineage tab
 * (`getEntityDetailsPath(type, fqn, EntityTabs.LINEAGE)`). The product
 * detail page addresses its tabs through the `?tab=` query param
 * (`AssetDetailView.onTabChange` / `getRenderedActiveTab`), so the
 * product analogue is the `asset` route with `query: { tab }`.
 */
export function assetTabLocation(
  entityType: string,
  fqn: string,
  tab: string,
): { name: string; params: { entityType: string; fqn: string }; query: { tab: string } } {
  return {
    name: 'asset',
    params: { entityType, fqn },
    query: { tab },
  };
}

export function encodeFqnForApi(fqn: string): string {
  return encodeURIComponent(fqn);
}

export function resolveDetailEndpoint(
  entityType: string,
  fqn: string,
): { path: string; fields: string } | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !fqn) {
    return null;
  }
  return {
    path: `/v1/${spec.collection}/name/${encodeFqnForApi(fqn)}`,
    fields: spec.fields,
  };
}

export function isDetailWired(entityType: string): boolean {
  return entityType in DETAIL_ENDPOINTS;
}

/**
 * D26: glossaryTerm / tag / dataProduct detail pages live on governance
 * routes (governance/terms/:id, governance/tags/:id,
 * governance/data-products/:id) and their detail views load BY ID
 * (getGlossaryTerm / getTag / getDataProduct) — they deliberately stay
 * OUT of DETAIL_ENDPOINTS, whose map drives the generic `asset` route
 * that has no rendering for them. Pin likewise routes them through
 * their own detail paths (getGlossaryTermDetailsPath /
 * getClassificationTagPath / getDataProductDetailsPath), not the generic
 * entity-details path. The id is never derived from the FQN: a search
 * hit without an id stays unwired rather than navigating to a
 * nonexistent page.
 */
const GOVERNANCE_DETAIL_ROUTES: Record<string, string> = {
  glossaryTerm: 'governance-term',
  tag: 'governance-tag',
  dataProduct: 'governance-data-product',
};

export function governanceDetailLocation(
  entityType: string,
  id?: string,
): { name: string; params: { id: string } } | null {
  const name = GOVERNANCE_DETAIL_ROUTES[entityType];
  if (!name || !id) {
    return null;
  }
  return { name, params: { id } };
}

/** A router location a search hit can navigate to: asset/lineage
 * locations carry entityType + fqn, governance detail locations carry
 * the entity id. An asset location may also carry a `?tab=` query
 * (E-3d: pin's detail-page tab links, e.g. the Lineage tab). */
export type SearchHitLocation =
  | { name: string; params: { entityType: string; fqn: string }; query?: { tab: string } }
  | { name: string; params: { id: string } };

/**
 * Single navigation target for a search hit: parent table for a column
 * hit, generic asset detail for a wired type, governance detail for
 * glossaryTerm / tag / dataProduct when the hit carries an id. Null is
 * the honest unwired marker — callers keep the hit selected (preview)
 * instead of navigating.
 */
export function detailLocationForHit(
  hit: { entityType: string; fullyQualifiedName: string; tableFqn?: string; id?: string },
): SearchHitLocation | null {
  const parent = parentTableLocation(hit.entityType, hit.tableFqn);
  if (parent) {
    return parent;
  }
  if (hit.entityType && hit.fullyQualifiedName && isDetailWired(hit.entityType)) {
    return assetLocation(hit.entityType, hit.fullyQualifiedName);
  }
  return governanceDetailLocation(hit.entityType, hit.id);
}

/**
 * D25: pin EntitySummaryPanel shows its Lineage tab for exactly these
 * 11 entity types (EntityRightPanelVerticalNav.constants.ts
 * LINEAGE_TABS_SET); glossaryTerm, tag and dataProduct are NOT in it.
 * The preview lineage entry is gated on this set.
 */
export const LINEAGE_CAPABLE_ENTITY_TYPES: readonly string[] = [
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
];

export function isLineageCapable(entityType: string): boolean {
  return LINEAGE_CAPABLE_ENTITY_TYPES.includes(entityType);
}

/**
 * Parent-table location for a tableColumn search hit. Official column cards
 * link to the parent table (ExploreSearchCard buildColumnDetails and the
 * column breadcrumb both use the embedded `table` reference); there is no
 * column detail page, so tableColumn deliberately stays out of
 * DETAIL_ENDPOINTS and this helper is the only column navigation path.
 * Returns null when the hit carries no parent table FQN — callers keep the
 * honest unwired marker instead of inventing a target.
 */
export function parentTableLocation(
  entityType: string,
  tableFqn?: string,
): { name: string; params: { entityType: string; fqn: string } } | null {
  if (entityType !== 'tableColumn' || !tableFqn) {
    return null;
  }
  return assetLocation('table', tableFqn);
}

/**
 * Shared search-hit opener (pin ExploreSearchCard title link, as
 * already implemented inline in MembersAssetList and AssetsTabs):
 * a column hit opens its parent table, a wired type opens its asset
 * detail, a governance type with an id opens its governance detail
 * page, anything else is unwired and the caller keeps the hit
 * selected (preview) instead of navigating. Returns true when a
 * navigation was pushed.
 */
export function openSearchHit(
  push: (to: SearchHitLocation) => unknown,
  hit: { entityType: string; fullyQualifiedName: string; tableFqn?: string; id?: string },
): boolean {
  const location = detailLocationForHit(hit);
  if (!location) {
    return false;
  }
  void push(location);
  return true;
}

export function resolveVersionsPath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}/versions`;
}

/**
 * Official vote endpoint, per collection (openmetadata-ui rest/*API.ts
 * updateVote): PUT /v1/{collection}/{id}/vote. Every DETAIL_ENDPOINTS
 * collection has a server updateVote (EntityResource generic), so the
 * collection map is the single source — no per-type enumeration here.
 */
export function resolveVotePath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}/vote`;
}

/**
 * Followers path for the official add/remove-follower pattern
 * (PUT /v1/{collection}/{id}/followers, DELETE .../followers/{userId}).
 * `followers` is part of the official detail payload field surface, so the
 * detail GET fields below also request it for every wired entity.
 */
export function resolveFollowersPath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}/followers`;
}

export function resolvePatchPath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}`;
}
