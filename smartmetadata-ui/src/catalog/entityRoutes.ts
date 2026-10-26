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
    fields: 'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType',
  },
  topic: { collection: 'topics', fields: 'owners,tags,domains,extension,service,messageSchema,partitions' },
  dashboard: {
    collection: 'dashboards',
    fields: 'owners,tags,domains,extension,service,charts,dataModels,project',
  },
  pipeline: {
    collection: 'pipelines',
    fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state',
  },
  mlmodel: {
    collection: 'mlmodels',
    fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard',
  },
  container: {
    collection: 'containers',
    fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats',
  },
  searchIndex: {
    collection: 'searchIndexes',
    fields: 'owners,tags,domains,extension,service,fields,indexType',
  },
  storedProcedure: {
    collection: 'storedProcedures',
    fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType',
  },
  chart: {
    collection: 'charts',
    fields: 'owners,tags,domains,extension,service,dashboards,chartType,sourceUrl',
  },
  metric: {
    collection: 'metrics',
    fields: 'owners,tags,domains,extension,metricExpression,metricType,unitOfMeasurement,granularity',
  },
  dashboardDataModel: {
    collection: 'dashboard/datamodels',
    fields: 'owners,tags,domains,extension,service,columns,dataModelType,project,sql,sourceUrl',
  },
  database: {
    collection: 'databases',
    fields: 'owners,tags,domains,extension,service,databaseSchemas,sourceUrl',
  },
  databaseSchema: {
    collection: 'databaseSchemas',
    fields: 'owners,tags,domains,extension,service,database,tables,sourceUrl',
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

export function resolvePatchPath(entityType: string, id: string): string | null {
  const spec = DETAIL_ENDPOINTS[entityType];
  if (!spec || !id) {
    return null;
  }
  return `/v1/${spec.collection}/${encodeURIComponent(id)}`;
}
