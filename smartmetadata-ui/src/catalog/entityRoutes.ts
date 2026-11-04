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
 */
const DETAIL_ENDPOINTS: Record<string, { collection: string; fields: string }> = {
  table: {
    collection: 'tables',
    fields: 'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType,followers,votes',
  },
  topic: { collection: 'topics', fields: 'owners,tags,domains,extension,service,messageSchema,partitions,followers,votes' },
  dashboard: {
    collection: 'dashboards',
    fields: 'owners,tags,domains,extension,service,charts,dataModels,project,followers,votes',
  },
  pipeline: {
    collection: 'pipelines',
    fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state,followers,votes',
  },
  mlmodel: {
    collection: 'mlmodels',
    fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard,followers,votes',
  },
  container: {
    collection: 'containers',
    fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats,followers,votes',
  },
  searchIndex: {
    collection: 'searchIndexes',
    fields: 'owners,tags,domains,extension,service,fields,indexType,followers,votes',
  },
  storedProcedure: {
    collection: 'storedProcedures',
    fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType,followers,votes',
  },
  chart: {
    collection: 'charts',
    fields: 'owners,tags,domains,extension,service,dashboards,chartType,sourceUrl,followers,votes',
  },
  metric: {
    collection: 'metrics',
    fields: 'owners,tags,domains,extension,metricExpression,metricType,unitOfMeasurement,granularity,followers,votes',
  },
  dashboardDataModel: {
    collection: 'dashboard/datamodels',
    fields: 'owners,tags,domains,extension,service,columns,dataModelType,project,sql,sourceUrl,followers,votes',
  },
  database: {
    collection: 'databases',
    fields: 'owners,tags,domains,extension,service,databaseSchemas,sourceUrl,followers,votes',
  },
  databaseSchema: {
    collection: 'databaseSchemas',
    fields: 'owners,tags,domains,extension,service,database,tables,sourceUrl,followers,votes',
  },
  // P2 B5: official APICollectionPage / APIEndpointPage, reached through
  // the generic entity detail route (no explicit router entries exist
  // officially either — EntityDetailComponentUtils maps the types).
  apiCollection: {
    collection: 'apiCollections',
    fields: 'owners,tags,domains,extension,service,followers,votes',
  },
  apiEndpoint: {
    collection: 'apiEndpoints',
    fields: 'owners,tags,domains,extension,service,apiCollection,endpointURL,requestMethod,requestSchema,responseSchema,followers,votes',
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
