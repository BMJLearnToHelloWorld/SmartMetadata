/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  configureApp,
  deployApp,
  fetchAppLogsRecursively,
  getApplicationByName,
  getApplicationList,
  getApplicationLogs,
  getApplicationRuns,
  getApp,
  getExternalApplicationRuns,
  getInstalledApplicationList,
  getLatestApplicationRuns,
  getLiveIndexingQueue,
  getLogsFromAppResponse,
  listApps,
  mapApp,
  mapAppRunRecord,
  patchApplication,
  restoreApp,
  stopApp,
  triggerOnDemandApp,
  uninstallApp,
} from './apps';

function lastFetch(): string {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return String(call[0]);
}

function lastInit(): RequestInit {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return (call[1] ?? {}) as RequestInit;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(payload: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)));
}

function stubFetchEmpty(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
}

const sampleApp = {
  id: 'a1',
  name: 'DataInsightsReportApplication',
  fullyQualifiedName: 'DataInsightsReportApplication',
  displayName: 'Data Insights',
  description: 'Reports',
  appType: 'internal',
  scheduleType: 'Scheduled',
  enabled: true,
  deleted: false,
  developer: 'Collate',
  developerUrl: 'https://example.com',
  appSchedule: { cronExpression: '0 0 * * 0', scheduleTimeline: 'Weekly' },
  appConfiguration: { batchSize: 100 },
  supportsInterrupt: true,
  system: false,
  allowConfiguration: true,
  updatedAt: 1700000000000,
  owners: [{ id: 'u1', name: 'admin', type: 'user' }],
  pipelines: [{ id: 'p1', name: 'pipe', type: 'ingestionPipeline' }],
};

describe('apps API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps the full generated App shape without inventing fields', () => {
    expect(mapApp(sampleApp)).toMatchObject({
      id: 'a1',
      name: 'DataInsightsReportApplication',
      appType: 'internal',
      scheduleType: 'Scheduled',
      appSchedule: { cronExpression: '0 0 * * 0', scheduleTimeline: 'Weekly' },
      appConfiguration: { batchSize: 100 },
      owners: [{ id: 'u1', name: 'admin', type: 'user' }],
    });
    expect(mapApp({ displayName: 'orphan' })).toBeNull();
    expect(mapApp({ id: 'x' })).toBeNull();
    expect(mapApp(null)).toBeNull();
  });

  it('lists apps from GET /v1/apps with caller-supplied params and no baked-in default', async () => {
    stubFetch({ data: [sampleApp], paging: { total: 1 } });
    const page = await listApps({ limit: 25 });
    expect(page.data[0]?.name).toBe('DataInsightsReportApplication');
    expect(lastFetch()).toContain('/api/v1/apps');
    expect(lastFetch()).toContain('limit=25');

    stubFetch({ data: [], paging: { total: 0 } });
    await getApplicationList({ before: 'c1', include: 'deleted' });
    expect(lastFetch()).toContain('before=c1');
    expect(lastFetch()).toContain('include=deleted');
    expect(lastFetch()).not.toContain('limit=');
  });

  it('gets one app from GET /v1/apps/{id}', async () => {
    stubFetch(sampleApp);
    const app = await getApp('a1');
    expect(app.displayName).toBe('Data Insights');
    expect(lastFetch()).toContain('/api/v1/apps/a1');
  });

  it('gets an app by name with the caller field list, encoded', async () => {
    stubFetch(sampleApp);
    await getApplicationByName('My App', { fields: 'owners,pipelines', include: 'all' });
    const url = lastFetch();
    expect(url).toContain('/api/v1/apps/name/My%20App');
    expect(url).toContain('fields=owners%2Cpipelines');
    expect(url).toContain('include=all');
  });

  it('lists installed apps as entity references with no params', async () => {
    stubFetch([{ id: 'a1', name: 'SearchIndexingApplication', type: 'application' }]);
    const refs = await getInstalledApplicationList();
    expect(refs).toEqual([
      { id: 'a1', name: 'SearchIndexingApplication', type: 'application' },
    ]);
    expect(lastFetch()).toContain('/api/v1/apps/installed');
    expect(lastFetch()).not.toContain('?');
  });

  it('patches an app by id with RFC 6902 content type', async () => {
    stubFetch(sampleApp);
    const ops = [{ op: 'replace', path: '/appConfiguration/batchSize', value: 200 }];
    await patchApplication('a1', ops as never);
    expect(lastFetch()).toContain('/api/v1/apps/a1');
    const init = lastInit();
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json-patch+json',
    );
    expect(JSON.parse(String(init.body))).toEqual(ops);
  });

  it('restores an app with PUT /v1/apps/restore and {id} body', async () => {
    stubFetch(sampleApp);
    await restoreApp('a1');
    expect(lastFetch()).toContain('/api/v1/apps/restore');
    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(String(lastInit().body))).toEqual({ id: 'a1' });
  });

  it('uninstalls with hardDelete=true and disables with hardDelete=false', async () => {
    stubFetchEmpty();
    await uninstallApp('My App', true);
    expect(lastFetch()).toContain('/api/v1/apps/name/My%20App');
    expect(lastFetch()).toContain('hardDelete=true');
    expect(lastInit().method).toBe('DELETE');

    await uninstallApp('My App', false);
    expect(lastFetch()).toContain('hardDelete=false');

    await uninstallApp('My App');
    expect(lastFetch()).toContain('hardDelete=false');
  });

  it('triggers an on-demand app with the JSON body the pin sends', async () => {
    stubFetchEmpty();
    const result = await triggerOnDemandApp('AutoPilotApplication', {
      entityLink: '<#E::databaseService::pg.warehouse>',
    });
    expect(result).toBeUndefined();
    expect(lastFetch()).toContain('/api/v1/apps/trigger/AutoPilotApplication');
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(String(lastInit().body))).toEqual({
      entityLink: '<#E::databaseService::pg.warehouse>',
    });
  });

  it('URL-encodes the app name and defaults the trigger body to an empty object', async () => {
    stubFetchEmpty();
    await triggerOnDemandApp('My App');
    expect(lastFetch()).toContain('/api/v1/apps/trigger/My%20App');
    expect(JSON.parse(String(lastInit().body))).toEqual({});
  });

  it('deploys and configures apps', async () => {
    stubFetchEmpty();
    await deployApp('SearchIndexingApplication');
    expect(lastFetch()).toContain('/api/v1/apps/deploy/SearchIndexingApplication');
    expect(lastInit().method).toBe('POST');

    await configureApp('SearchIndexingApplication', { batchSize: 50 });
    expect(lastFetch()).toContain('/api/v1/apps/configure/SearchIndexingApplication');
    expect(JSON.parse(String(lastInit().body))).toEqual({ batchSize: 50 });
  });

  it('stops an app with runId only when given', async () => {
    stubFetchEmpty();
    await stopApp('My App', 'run-1');
    expect(lastFetch()).toContain('/api/v1/apps/stop/My%20App');
    expect(lastFetch()).toContain('runId=run-1');

    await stopApp('My App');
    expect(lastFetch()).not.toContain('runId=');
  });

  it('fetches runs from /v1/apps/name/{fqn}/status with offset paging', async () => {
    stubFetch({ data: [], paging: { total: 0 } });
    await getApplicationRuns('SearchIndexingApplication', { offset: 15, limit: 15 });
    const url = lastFetch();
    expect(url).toContain('/api/v1/apps/name/SearchIndexingApplication/status');
    expect(url).toContain('offset=15');
    expect(url).toContain('limit=15');
  });

  it('fetches external runs from the same status endpoint with a time window', async () => {
    stubFetch({ data: [], paging: { total: 0 } });
    await getExternalApplicationRuns('RdfIndexApp', {
      startTs: 1000,
      endTs: 2000,
      limit: 30,
    });
    const url = lastFetch();
    expect(url).toContain('/api/v1/apps/name/RdfIndexApp/status');
    expect(url).toContain('startTs=1000');
    expect(url).toContain('endTs=2000');
  });

  it('maps run records including stats contexts and preserves a null success context', () => {
    const record = mapAppRunRecord({
      appId: 'a1',
      appName: 'SearchIndexingApplication',
      status: 'success',
      timestamp: 100,
      startTime: 90,
      successContext: null,
      failureContext: { stats: { jobStats: { totalRecords: 5, successRecords: 5 } } },
    });
    expect(record?.successContext).toBeNull();
    expect(record?.failureContext?.stats?.jobStats?.totalRecords).toBe(5);

    const withStats = mapAppRunRecord({
      successContext: {
        stats: { jobStats: { totalRecords: 3, successRecords: 2, failedRecords: 1 } },
        serverStats: { s1: { processedRecords: 3, completedPartitions: 1, totalPartitions: 2 } },
        serverCount: 1,
      },
    });
    expect(withStats?.successContext?.serverStats?.s1.processedRecords).toBe(3);
    expect(withStats?.successContext?.serverCount).toBe(1);
    expect(mapAppRunRecord(null)).toBeNull();
  });

  it('fetches latest runs with an optional runId', async () => {
    stubFetch({ total: '2', pipelineStatus: { runId: 'r1' } });
    const latest = await getLatestApplicationRuns('DataInsightsApplication', 'r1');
    expect(latest.total).toBe('2');
    expect(lastFetch()).toContain('/api/v1/apps/name/DataInsightsApplication/logs');
    expect(lastFetch()).toContain('runId=r1');

    stubFetch({});
    await getLatestApplicationRuns('DataInsightsApplication');
    expect(lastFetch()).not.toContain('runId=');
  });

  it('fetches application logs WITHOUT encoding the name, per pin', async () => {
    stubFetch({ total: 10, after: '5', logs: 'line1' });
    const logs = await getApplicationLogs('a/b', undefined, 'run-9');
    expect(logs.logs).toBe('line1');
    // Pin does not call getEncodedFqn here: a '/' in the name travels
    // verbatim instead of arriving as %2F. (URL serialization still
    // percent-encodes characters the URL parser itself must escape.)
    expect(lastFetch()).toContain('/api/v1/apps/name/a/b/logs');
    expect(lastFetch()).toContain('runId=run-9');
    expect(lastFetch()).not.toContain('after=');
  });

  it('prefers the generic logs key, then application_task', () => {
    expect(getLogsFromAppResponse({ logs: 'generic', application_task: 'task' })).toBe('generic');
    expect(getLogsFromAppResponse({ application_task: 'task' })).toBe('task');
    expect(getLogsFromAppResponse({})).toBe('');
  });

  it('fetches app logs recursively following the after cursor', async () => {
    const responses = [
      { total: 10, after: '5', logs: 'page1\n' },
      { total: 10, logs: 'page2' },
    ];
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = responses[call];
        call += 1;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const logs = await fetchAppLogsRecursively('SearchIndexingApplication', 'run-1');
    expect(logs).toBe('page1\npage2');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('after=5');
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('runId=run-1');
  });

  it('stops the recursion when no cursor is returned', async () => {
    stubFetch({ total: 10, logs: 'only' });
    const logs = await fetchAppLogsRecursively('SearchIndexingApplication');
    expect(logs).toBe('only');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('fetches the live indexing queue with limit/offset', async () => {
    stubFetch({
      data: [
        {
          entityId: 'e1',
          entityFqn: 'db.schema.table',
          failureReason: 'boom',
          status: 'FAILED',
          entityType: 'table',
          retryCount: 2,
          claimedAt: null,
        },
      ],
      paging: { total: 1 },
    });
    const page = await getLiveIndexingQueue('SearchIndexingApplication', {
      limit: 15,
      offset: 0,
    });
    expect(page.data[0]?.entityFqn).toBe('db.schema.table');
    expect(page.total).toBe(1);
    const url = lastFetch();
    expect(url).toContain('/api/v1/apps/name/SearchIndexingApplication/live-indexing-queue');
    expect(url).toContain('limit=15');
    expect(url).toContain('offset=0');
  });
});
