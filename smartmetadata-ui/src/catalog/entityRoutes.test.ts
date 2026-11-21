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
  openSearchHit,
  parentTableLocation,
  resolveDetailEndpoint,
  resolvePatchPath,
  resolveVersionsPath,
  resolveVotePath,
  USAGE_SUMMARY_ENTITY_TYPES,
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
      fields: 'owners,tags,columns,domains,extension,service,database,databaseSchema,tableType,tablePartition,tableConstraints,aliases,followers,votes,joins,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('topic', 'kafka.events')).toEqual({
      path: `/v1/topics/name/${encodeURIComponent('kafka.events')}`,
      fields: 'owners,tags,domains,extension,service,messageSchema,partitions,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('dashboard', 'bi.sales')).toEqual({
      path: `/v1/dashboards/name/${encodeURIComponent('bi.sales')}`,
      fields: 'owners,tags,domains,extension,service,charts,dataModels,project,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('pipeline', 'airflow.etl')).toEqual({
      path: `/v1/pipelines/name/${encodeURIComponent('airflow.etl')}`,
      fields: 'owners,tags,domains,extension,service,tasks,pipelineStatus,scheduleInterval,sourceUrl,state,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('mlmodel', 'ml.churn')).toEqual({
      path: `/v1/mlmodels/name/${encodeURIComponent('ml.churn')}`,
      fields: 'owners,tags,domains,extension,service,mlFeatures,mlHyperParameters,algorithm,target,dashboard,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('container', 's3.lake')).toEqual({
      path: `/v1/containers/name/${encodeURIComponent('s3.lake')}`,
      fields: 'owners,tags,domains,extension,service,dataModel,parent,children,prefix,fileFormats,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('searchIndex', 'os.logs')).toEqual({
      path: `/v1/searchIndexes/name/${encodeURIComponent('os.logs')}`,
      fields: 'owners,tags,domains,extension,service,fields,indexType,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('storedProcedure', 'svc.db.schema.sp')).toEqual({
      path: `/v1/storedProcedures/name/${encodeURIComponent('svc.db.schema.sp')}`,
      fields: 'owners,tags,domains,extension,service,database,databaseSchema,storedProcedureCode,storedProcedureType,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('chart', 'bi.sales.revenue')).toEqual({
      path: `/v1/charts/name/${encodeURIComponent('bi.sales.revenue')}`,
      fields: 'owners,tags,domains,extension,service,dashboards,chartType,sourceUrl,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('metric', 'kpi.mau')).toEqual({
      path: `/v1/metrics/name/${encodeURIComponent('kpi.mau')}`,
      fields: 'owners,tags,domains,extension,metricExpression,metricType,unitOfMeasurement,customUnitOfMeasurement,granularity,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('dashboardDataModel', 'bi.sales.model')).toEqual({
      path: `/v1/dashboard/datamodels/name/${encodeURIComponent('bi.sales.model')}`,
      fields: 'owners,tags,domains,extension,service,columns,dataModelType,project,sql,sourceUrl,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('database', 'svc.analytics')).toEqual({
      path: `/v1/databases/name/${encodeURIComponent('svc.analytics')}`,
      fields: 'owners,tags,domains,extension,service,databaseSchemas,sourceUrl,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('databaseSchema', 'svc.analytics.marts')).toEqual({
      path: `/v1/databaseSchemas/name/${encodeURIComponent('svc.analytics.marts')}`,
      fields: 'owners,tags,domains,extension,service,database,tables,sourceUrl,followers,votes,dataProducts,certification',
    });
  });

  it('builds a lineage route that keeps the raw FQN in params', () => {
    expect(lineageLocation('table', 'svc.db.schema.orders')).toEqual({
      name: 'lineage',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('does not invent endpoints for unwired entity types', () => {
    expect(resolveDetailEndpoint('kpi', 'retention')).toBeNull();
    expect(resolveDetailEndpoint('', 'x')).toBeNull();
    expect(resolvePatchPath('kpi', 'id-1')).toBeNull();
  });

  // C-14: queries are wired for vote/patch and GET by name (QueryResource).
  it('maps queries onto their collection for detail, vote, patch, and versions', () => {
    expect(resolveDetailEndpoint('query', 'analytics.q1')).toEqual({
      path: `/v1/queries/name/${encodeURIComponent('analytics.q1')}`,
      fields: 'owners,votes,tags,queryUsedIn,users',
    });
    expect(resolvePatchPath('query', 'id-1')).toBe('/v1/queries/id-1');
    expect(resolveVotePath('query', 'id-1')).toBe('/v1/queries/id-1/vote');
    expect(resolveVersionsPath('query', 'q-1')).toBe('/v1/queries/q-1/versions');
  });

  it('maps wired types onto PATCH /v1/{collection}/{id}', () => {
    expect(resolvePatchPath('table', 'tbl-1')).toBe('/v1/tables/tbl-1');
    expect(resolvePatchPath('topic', 'top-1')).toBe('/v1/topics/top-1');
  });

  it('maps wired types onto GET /v1/{collection}/{id}/versions', () => {
    expect(resolveVersionsPath('table', 'tbl-1')).toBe('/v1/tables/tbl-1/versions');
    expect(resolveVersionsPath('dashboard', 'd-1')).toBe('/v1/dashboards/d-1/versions');
    expect(resolveVersionsPath('kpi', 'q-1')).toBeNull();
    expect(resolveVersionsPath('table', '')).toBeNull();
  });

  // P2 B5: API collection / endpoint wired through the generic asset route.
  it('maps API collection and endpoint onto their collections', () => {
    expect(resolveDetailEndpoint('apiCollection', 'svc.coll')).toEqual({
      path: `/v1/apiCollections/name/${encodeURIComponent('svc.coll')}`,
      fields: 'owners,tags,domains,extension,service,followers,votes,dataProducts,certification',
    });
    expect(resolveDetailEndpoint('apiEndpoint', 'svc.coll.getPet')).toEqual({
      path: `/v1/apiEndpoints/name/${encodeURIComponent('svc.coll.getPet')}`,
      fields: 'owners,tags,domains,extension,service,apiCollection,endpointURL,requestMethod,requestSchema,responseSchema,followers,votes,dataProducts,certification',
    });
  });

  it('routes tableColumn hits to the parent table only when a table FQN exists (Fix3)', () => {
    expect(parentTableLocation('tableColumn', 'svc.db.schema.orders')).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
    expect(parentTableLocation('tableColumn', undefined)).toBeNull();
    expect(parentTableLocation('tableColumn', '')).toBeNull();
    expect(parentTableLocation('table', 'svc.db.schema.orders')).toBeNull();
  });

  it('gates usageSummary requests to the four pin header-percentile entity types', () => {
    expect(USAGE_SUMMARY_ENTITY_TYPES).toEqual(['table', 'dashboard', 'pipeline', 'mlmodel']);
    expect(USAGE_SUMMARY_ENTITY_TYPES).not.toContain('topic');
    expect(USAGE_SUMMARY_ENTITY_TYPES).not.toContain('chart');
    expect(USAGE_SUMMARY_ENTITY_TYPES).not.toContain('database');
  });

  it('opens column hits on the parent table, wired hits on their detail, and nothing unwired', () => {
    const pushed: unknown[] = [];
    const push = (to: unknown) => {
      pushed.push(to);
    };
    expect(
      openSearchHit(push, { entityType: 'tableColumn', fullyQualifiedName: 'svc.db.t.c', tableFqn: 'svc.db.t' }),
    ).toBe(true);
    expect(pushed).toEqual([{ name: 'asset', params: { entityType: 'table', fqn: 'svc.db.t' } }]);
    expect(
      openSearchHit(push, { entityType: 'table', fullyQualifiedName: 'svc.db.schema.orders' }),
    ).toBe(true);
    expect(pushed).toHaveLength(2);
    expect(
      openSearchHit(push, { entityType: 'unknownThing', fullyQualifiedName: 'x.y' }),
    ).toBe(false);
    expect(pushed).toHaveLength(2);
  });
});
