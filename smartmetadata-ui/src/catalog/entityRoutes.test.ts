/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  assetLocation,
  encodeFqnForApi,
  lineageLocation,
  resolveDetailEndpoint,
  resolvePatchPath,
} from './entityRoutes';

describe('entityRoutes', () => {
  it('builds a Vue route that keeps the raw FQN in params', () => {
    expect(assetLocation('table', 'svc.db.schema.orders')).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('percent-encodes FQNs for GET /v1/{collection}/name/{fqn}', () => {
    expect(encodeFqnForApi('svc.db."Sales Schema".orders')).toBe(
      encodeURIComponent('svc.db."Sales Schema".orders'),
    );
  });

  it('maps wired catalog types onto documented collections', () => {
    expect(resolveDetailEndpoint('table', 'svc.db.schema.orders')).toEqual({
      path: `/v1/tables/name/${encodeURIComponent('svc.db.schema.orders')}`,
      fields: 'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType',
    });
    expect(resolveDetailEndpoint('topic', 'kafka.events')).toEqual({
      path: `/v1/topics/name/${encodeURIComponent('kafka.events')}`,
      fields: 'owners,tags,domains,extension,service,messageSchema,partitions',
    });
    expect(resolveDetailEndpoint('dashboard', 'bi.sales')).toEqual({
      path: `/v1/dashboards/name/${encodeURIComponent('bi.sales')}`,
      fields: 'owners,tags,domains,extension,service,charts,dataModels,project',
    });
    expect(resolveDetailEndpoint('pipeline', 'airflow.etl')).toEqual({
      path: `/v1/pipelines/name/${encodeURIComponent('airflow.etl')}`,
      fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state',
    });
    expect(resolveDetailEndpoint('mlmodel', 'ml.churn')).toEqual({
      path: `/v1/mlmodels/name/${encodeURIComponent('ml.churn')}`,
      fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard',
    });
    expect(resolveDetailEndpoint('container', 's3.lake')).toEqual({
      path: `/v1/containers/name/${encodeURIComponent('s3.lake')}`,
      fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats',
    });
    expect(resolveDetailEndpoint('searchIndex', 'os.logs')).toEqual({
      path: `/v1/searchIndexes/name/${encodeURIComponent('os.logs')}`,
      fields: 'owners,tags,domains,extension,service,fields,indexType',
    });
    expect(resolveDetailEndpoint('storedProcedure', 'svc.db.schema.sp')).toEqual({
      path: `/v1/storedProcedures/name/${encodeURIComponent('svc.db.schema.sp')}`,
      fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType',
    });
  });

  it('builds a lineage route that keeps the raw FQN in params', () => {
    expect(lineageLocation('table', 'svc.db.schema.orders')).toEqual({
      name: 'lineage',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('does not invent endpoints for unwired entity types', () => {
    expect(resolveDetailEndpoint('chart', 'bi.sales.chart')).toBeNull();
    expect(resolveDetailEndpoint('', 'x')).toBeNull();
    expect(resolvePatchPath('chart', 'id-1')).toBeNull();
  });

  it('maps wired types onto PATCH /v1/{collection}/{id}', () => {
    expect(resolvePatchPath('table', 'tbl-1')).toBe('/v1/tables/tbl-1');
    expect(resolvePatchPath('topic', 'top-1')).toBe('/v1/topics/top-1');
  });
});
