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
import { toEntityLink } from '@/quality/entityLink';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  parseAnnouncementEntityLink,
  patchAnnouncement,
} from './announcements';

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

describe('announcements API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists announcements from GET /v1/announcements', async () => {
    stubFetch({
      data: [{ id: 'a1', displayName: 'Maintenance', description: 'Window', type: 'Notice' }],
      paging: { total: 1 },
    });
    const page = await listAnnouncements({ limit: 50 });
    expect(page.data[0]?.displayName).toBe('Maintenance');
    expect(lastFetch().url).toContain('/api/v1/announcements');
  });

  it('passes the system/status/type filters through as query params', async () => {
    stubFetch({ data: [], paging: { total: 0 } });
    await listAnnouncements({ system: true, status: 'Active', type: 'Custom', limit: 1000 });
    const url = urlOf(lastFetch().url);
    expect(url.searchParams.get('system')).toBe('true');
    expect(url.searchParams.get('status')).toBe('Active');
    expect(url.searchParams.get('type')).toBe('Custom');
    expect(url.searchParams.get('limit')).toBe('1000');
  });

  it('maps the full announcement shape, including color, customTypeName, and createdBy', async () => {
    stubFetch({
      data: [
        {
          id: 'a1',
          name: 'announcement-x',
          displayName: 'Downtime',
          description: 'Window',
          type: 'Custom',
          color: 'pink',
          customTypeName: 'Outage',
          entityLink: '<#E::table::svc.db.t>',
          startTime: 100,
          endTime: 200,
          createdBy: 'amy',
          createdAt: 90,
          updatedAt: 95,
        },
      ],
      paging: { total: 1 },
    });
    const page = await listAnnouncements({});
    expect(page.data[0]).toMatchObject({
      id: 'a1',
      name: 'announcement-x',
      displayName: 'Downtime',
      type: 'Custom',
      color: 'pink',
      customTypeName: 'Outage',
      entityLink: '<#E::table::svc.db.t>',
      startTime: 100,
      endTime: 200,
      createdBy: 'amy',
      createdAt: 90,
      updatedAt: 95,
    });
  });

  it('creates an announcement with schema-required description, startTime, and endTime', async () => {
    const entityLink = toEntityLink('table', 'svc.db.schema.orders');
    stubFetch({ id: 'a2', description: 'Table rebuild' }, (init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body).toMatchObject({
        description: 'Table rebuild',
        startTime: 100,
        endTime: 200,
        type: 'Notice',
        entityLink,
      });
    });
    const created = await createAnnouncement({
      description: 'Table rebuild',
      startTime: 100,
      endTime: 200,
      type: 'Notice',
      entityLink,
    });
    expect(created.id).toBe('a2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/announcements');
  });

  it('creates a system-wide announcement with color/customTypeName and no entityLink', async () => {
    stubFetch({ id: 'a3', displayName: 'Outage' }, (init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body).toMatchObject({
        displayName: 'Outage',
        description: 'Down',
        startTime: 100,
        endTime: 200,
        type: 'Custom',
        color: 'pink',
        customTypeName: 'Outage',
      });
      expect(body).not.toHaveProperty('entityLink');
    });
    const created = await createAnnouncement({
      displayName: 'Outage',
      description: 'Down',
      startTime: 100,
      endTime: 200,
      type: 'Custom',
      color: 'pink',
      customTypeName: 'Outage',
    });
    expect(created.id).toBe('a3');
  });

  it('getAnnouncementById: GET /{encodedId} and throws when the response has no id', async () => {
    stubFetch({ id: 'a/b', displayName: 'Found' });
    const found = await getAnnouncementById('a/b');
    expect(found.displayName).toBe('Found');
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/announcements/a%2Fb');

    stubFetch({ displayName: 'No id' });
    await expect(getAnnouncementById('x')).rejects.toThrow('missing id');
  });

  it('patchAnnouncement: PATCH /{encodedId} with the json-patch content type', async () => {
    const ops = [
      { op: 'replace', path: '/displayName', value: 'New' },
      { op: 'remove', path: '/color' },
    ] as const;
    stubFetch({ id: 'a1', displayName: 'New' }, (init) => {
      expect(init?.method).toBe('PATCH');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json-patch+json');
      expect(JSON.parse(String(init?.body ?? '[]'))).toEqual(ops);
    });
    const updated = await patchAnnouncement('a/b', [...ops]);
    expect(updated.displayName).toBe('New');
    expect(urlOf(lastFetch().url).pathname).toBe('/api/v1/announcements/a%2Fb');
  });

  it('patchAnnouncement: an empty op list is SENT, not thrown', async () => {
    stubFetch({ id: 'a1', displayName: 'Same' }, (init) => {
      expect(JSON.parse(String(init?.body ?? 'null'))).toEqual([]);
    });
    const updated = await patchAnnouncement('a1', []);
    expect(updated.id).toBe('a1');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  describe('deleteAnnouncement', () => {
    function stubDeleteFetch(): void {
      stubFetch({});
    }

    it('sends hardDelete=true when the caller passes it', async () => {
      stubDeleteFetch();
      await deleteAnnouncement('a1', true);
      expect(lastFetch().url).toContain('/api/v1/announcements/a1?hardDelete=true');
      expect(lastFetch().init?.method).toBe('DELETE');
    });

    it('defaults to hardDelete=false, matching the pin API shape', async () => {
      stubDeleteFetch();
      await deleteAnnouncement('a1');
      expect(lastFetch().url).toContain('/api/v1/announcements/a1?hardDelete=false');
      expect(lastFetch().init?.method).toBe('DELETE');
    });

    it('encodes special characters in the id', async () => {
      stubDeleteFetch();
      await deleteAnnouncement('a/b c', true);
      expect(lastFetch().url).toContain('/api/v1/announcements/a%2Fb%20c?hardDelete=true');
      expect(lastFetch().init?.method).toBe('DELETE');
    });
  });
});

describe('parseAnnouncementEntityLink', () => {
  it('parses domain and data-product links, keeping dotted fqns whole', () => {
    expect(parseAnnouncementEntityLink('<#E::domain::sales>')).toEqual({
      entityType: 'domain',
      fullyQualifiedName: 'sales',
    });
    expect(parseAnnouncementEntityLink('<#E::dataProduct::marketing.churn-scores>')).toEqual({
      entityType: 'dataProduct',
      fullyQualifiedName: 'marketing.churn-scores',
    });
  });

  it('returns null for other entity types, malformed links, and missing links', () => {
    expect(parseAnnouncementEntityLink('<#E::table::svc.db.t')).toBeNull();
    expect(parseAnnouncementEntityLink('not-a-link')).toBeNull();
    expect(parseAnnouncementEntityLink('<#E::domain::>')).toBeNull();
    expect(parseAnnouncementEntityLink(undefined)).toBeNull();
  });
});
