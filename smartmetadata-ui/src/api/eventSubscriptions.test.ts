/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  createNotificationAlert,
  createObservabilityAlert,
  deleteEventSubscription,
  getAlertCapabilities,
  getAlertEventsDiagnosticsInfo,
  getAlertEventsFromId,
  getAlertsFromName,
  getAllAlerts,
  getDiagnosticInfo,
  getObservabilityAlertByFQN,
  syncOffset,
  testAlertDestination,
  updateNotificationAlert,
  updateObservabilityAlert,
} from './eventSubscriptions';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(payload: unknown, assert?: (init?: RequestInit) => void): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert?.(init);
      return jsonResponse(payload);
    }),
  );
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function urlOf(fetchUrl: string): URL {
  return new URL(fetchUrl, 'http://test.invalid');
}

const ALERT_ROW = {
  id: 'al1',
  name: 'dq-fail',
  fullyQualifiedName: 'dq-fail',
  displayName: 'DQ Fail',
  description: 'Fails loudly',
  alertType: 'Observability',
  enabled: true,
  provider: 'user',
  filteringRules: {
    resources: ['table', 'testCase'],
    rules: [{ name: 'matchAnyTag', effect: 'include', condition: 'PII' }],
  },
  input: { filters: [{ name: 'matchAnyTag', effect: 'include', arguments: [{ name: 'tags', input: ['PII'] }] }] },
  owners: [{ id: 'u1', name: 'amy', displayName: 'Amy' }],
  destinations: [
    {
      category: 'External',
      type: 'Slack',
      timeout: 10,
      readTimeout: 12,
      config: { endpoint: 'https://hooks.slack.com/x' },
    },
  ],
  trigger: { triggerType: 'RealTime', scheduleInfo: 'Daily' },
  batchSize: 10,
};

describe('eventSubscriptions API (pin method table)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('getAlertsFromName: GET /name/{encodedFqn} with include=all forced over caller params', async () => {
    stubFetch(ALERT_ROW);
    const alert = await getAlertsFromName('my alert', { fields: 'owners', include: 'non-deleted' });
    expect(alert.id).toBe('al1');
    const url = urlOf(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/events/subscriptions/name/my%20alert');
    expect(url.searchParams.get('fields')).toBe('owners');
    expect(url.searchParams.get('include')).toBe('all');
  });

  it('getObservabilityAlertByFQN: the identical wire, separate export', async () => {
    stubFetch(ALERT_ROW);
    await getObservabilityAlertByFQN('dq-fail', { fields: 'owners' });
    const url = urlOf(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/events/subscriptions/name/dq-fail');
    expect(url.searchParams.get('include')).toBe('all');
    expect(url.searchParams.get('fields')).toBe('owners');
  });

  it('getAllAlerts: GET the collection with the params spread as-is', async () => {
    stubFetch({ data: [ALERT_ROW], paging: { total: 1 } });
    const page = await getAllAlerts({ limit: 15, alertType: 'Notification', after: 'cursor-1' });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.name).toBe('dq-fail');
    const url = urlOf(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/events/subscriptions');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.get('alertType')).toBe('Notification');
    expect(url.searchParams.get('after')).toBe('cursor-1');
  });

  it('maps the full alert shape: filteringRules, input, owners, destinations, trigger', async () => {
    stubFetch({ data: [ALERT_ROW], paging: { total: 1 } });
    const page = await getAllAlerts({});
    const alert = page.data[0];
    expect(alert?.filteringRules?.resources).toEqual(['table', 'testCase']);
    expect(alert?.filteringRules?.rules).toEqual([
      { name: 'matchAnyTag', effect: 'include', condition: 'PII' },
    ]);
    expect(alert?.input?.filters?.[0]?.arguments?.[0]).toEqual({ name: 'tags', input: ['PII'] });
    expect(alert?.owners?.[0]?.displayName).toBe('Amy');
    expect(alert?.destinations[0]).toMatchObject({
      category: 'External',
      type: 'Slack',
      timeout: 10,
      readTimeout: 12,
    });
    expect(alert?.trigger).toMatchObject({ triggerType: 'RealTime', scheduleInfo: 'Daily' });
    expect(alert?.batchSize).toBe(10);
    expect(alert?.provider).toBe('user');
  });

  it('create calls POST the body as-is: no payload whitelist, no client-side resource validation', async () => {
    const body = {
      name: 'dq-webhook',
      alertType: 'Observability',
      resources: ['table', 'testCase'],
      destinations: [{ category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com/hook' } }],
    } as never;
    stubFetch({ id: 'al2', name: 'dq-webhook' }, (init) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body ?? '{}'))).toEqual(body);
    });
    const created = await createNotificationAlert(body);
    expect(created.id).toBe('al2');
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/events/subscriptions');

    stubFetch({ id: 'al3', name: 'dq-webhook' });
    await createObservabilityAlert(body);
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('update calls PATCH /{id} with the id NOT encoded and the json-patch content type', async () => {
    const ops = [{ op: 'replace', path: '/displayName', value: 'New' }] as const;
    stubFetch(ALERT_ROW, (init) => {
      expect(init?.method).toBe('PATCH');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json-patch+json');
      expect(JSON.parse(String(init?.body ?? '[]'))).toEqual(ops);
    });
    await updateNotificationAlert('a/b', [...ops]);
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/events/subscriptions/a/b');

    stubFetch(ALERT_ROW);
    await updateObservabilityAlert('plain-id', [...ops]);
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/events/subscriptions/plain-id');
  });

  it('getAlertCapabilities: POST /capabilities and falls the alertType back to the request', async () => {
    stubFetch(
      {
        filters: [{ condition: { name: 'c1' }, sources: ['table'] }],
        sources: [{ name: 'table', kind: 'entity', selected: true }],
        triggers: [],
        recipientCategories: ['Owners'],
      },
      (init) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({
          alertType: 'Notification',
          sources: ['table'],
          input: {},
        });
      },
    );
    const caps = await getAlertCapabilities({ alertType: 'Notification', sources: ['table'], input: {} });
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/events/subscriptions/capabilities');
    expect(caps.alertType).toBe('Notification');
    expect(caps.filters[0]?.condition.name).toBe('c1');
    expect(caps.sources[0]).toMatchObject({ name: 'table', selected: true });
    expect(caps.recipientCategories).toEqual(['Owners']);
  });

  it('getAlertEventsFromId: GET /id/{id}/listEvents with the id NOT encoded and no listCountOnly', async () => {
    stubFetch({ data: [{ status: 'Success', timestamp: 7, data: [] }], paging: { total: 1 } });
    const page = await getAlertEventsFromId({
      id: 'a/b',
      params: { status: 'failed', limit: 10, paginationOffset: 20 },
    });
    const url = urlOf(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/events/subscriptions/id/a/b/listEvents');
    expect(url.searchParams.get('status')).toBe('failed');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('paginationOffset')).toBe('20');
    expect(url.searchParams.has('listCountOnly')).toBe(false);
    expect(page.data[0]?.status).toBe('Success');
  });

  it('testAlertDestination: POST {destinations} and maps the bare array response', async () => {
    const destinations = [
      { category: 'External', type: 'Webhook', config: { endpoint: 'https://example.com' } },
    ] as never;
    stubFetch(
      [{ category: 'External', type: 'Webhook', statusDetails: { status: 'Success' } }],
      (init) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body ?? '{}'))).toEqual({ destinations });
      },
    );
    const result = await testAlertDestination({ destinations });
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/events/subscriptions/testDestination');
    expect(result[0]?.statusDetails).toEqual({ status: 'Success' });
  });

  it('syncOffset: PUT with no body', async () => {
    stubFetch({}, (init) => {
      expect(init?.method).toBe('PUT');
      expect(init?.body).toBeUndefined();
    });
    await syncOffset('dq-fail');
    expect(urlOf(lastFetch().url).pathname).toBe(
      '/api/v1/events/subscriptions/name/dq-fail/syncOffset',
    );
  });

  it('getDiagnosticInfo: GET /name/{encodedFqn}/diagnosticInfo', async () => {
    stubFetch({ currentOffset: 5, hasProcessedAllEvents: true });
    const info = await getDiagnosticInfo('my alert');
    expect(urlOf(lastFetch().url).pathname).toBe(
      '/api/v1/events/subscriptions/name/my%20alert/diagnosticInfo',
    );
    expect(info.currentOffset).toBe(5);
    expect(info.hasProcessedAllEvents).toBe(true);
  });

  it('getAlertEventsDiagnosticsInfo: fqn NOT encoded, listCountOnly always sent, default false', async () => {
    stubFetch({ totalEventsCount: 3, countsAreLowerBound: true });
    const record = await getAlertEventsDiagnosticsInfo({ fqn: 'a/b' });
    const url = urlOf(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/events/subscriptions/name/a/b/eventsRecord');
    expect(url.searchParams.get('listCountOnly')).toBe('false');
    expect(record.totalEventsCount).toBe(3);
    expect(record.countsAreLowerBound).toBe(true);

    stubFetch({ totalEventsCount: 1 });
    await getAlertEventsDiagnosticsInfo({ fqn: 'a/b', listCountOnly: true });
    expect(urlOf(lastFetch().url).searchParams.get('listCountOnly')).toBe('true');
  });

  it('deleteEventSubscription: DELETE /{encodedId}?hardDelete=true&recursive=false, in that key order', async () => {
    stubFetch({});
    await deleteEventSubscription('id/with slash');
    const { url, init } = lastFetch();
    expect(init?.method).toBe('DELETE');
    const parsed = urlOf(url);
    expect(parsed.pathname).toBe('/api/v1/events/subscriptions/id%2Fwith%20slash');
    expect(parsed.search).toBe('?hardDelete=true&recursive=false');
  });

  it('throws when a single-alert response carries neither id nor name', async () => {
    stubFetch({ displayName: 'Nameless' });
    await expect(getAlertsFromName('x')).rejects.toThrow('missing id and name');
  });
});
