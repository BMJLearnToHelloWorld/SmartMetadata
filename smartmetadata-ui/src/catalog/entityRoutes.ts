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
    fields: 'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType,followers',
  },
  topic: { collection: 'topics', fields: 'owners,tags,domains,extension,service,messageSchema,partitions,followers' },
  dashboard: {
    collection: 'dashboards',
    fields: 'owners,tags,domains,extension,service,charts,dataModels,project,followers',
  },
  pipeline: {
    collection: 'pipelines',
    fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state,followers',
  },
  mlmodel: {
    collection: 'mlmodels',
    fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard,followers',
  },
  container: {
    collection: 'containers',
    fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats,followers',
  },
  searchIndex: {
    collection: 'searchIndexes',
    fields: 'owners,tags,domains,extension,service,fields,indexType,followers',
  },
  storedProcedure: {
    collection: 'storedProcedures',
    fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType,followers',
  },
  chart: {
    collection: 'charts',
    fields: 'owners,tags,domains,extension,service,dashboards,chartType,sourceUrl,followers',
  },
  metric: {
    collection: 'metrics',
    fields: 'owners,tags,domains,extension,metricExpression,metricType,unitOfMeasurement,granularity,followers',
  },
  dashboardDataModel: {
    collection: 'dashboard/datamodels',
    fields: 'owners,tags,domains,extension,service,columns,dataModelType,project,sql,sourceUrl,followers',
  },
  database: {
    collection: 'databases',
    fields: 'owners,tags,domains,extension,service,databaseSchemas,sourceUrl,followers',
  },
  databaseSchema: {
    collection: 'databaseSchemas',
    fields: 'owners,tags,domains,extension,service,database,tables,sourceUrl,followers',
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
