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
import { countDriveAssets, listDriveAssets, patchDriveAsset } from './driveAssets';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('drive assets API (pin driveAPI.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastUrl(): URL {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return new URL(String(call[0]));
  }

  it('lists each entity type under its pin path segment, spreading rest then paging', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })));
    await listDriveAssets('directory', {
      service: 'svc.drive',
      fields: 'tags,owners',
      include: 'non-deleted',
      root: true,
      paging: { limit: 15, after: 'abc' },
    });
    const url = lastUrl();
    expect(url.pathname).toBe('/api/v1/drives/directories');
    expect(url.searchParams.get('service')).toBe('svc.drive');
    expect(url.searchParams.get('fields')).toBe('tags,owners');
    expect(url.searchParams.get('include')).toBe('non-deleted');
    expect(url.searchParams.get('root')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.get('after')).toBe('abc');

    await listDriveAssets('file', {});
    expect(lastUrl().pathname).toBe('/api/v1/drives/files');
    await listDriveAssets('spreadsheet', {});
    expect(lastUrl().pathname).toBe('/api/v1/drives/spreadsheets');
    await listDriveAssets('worksheet', {});
    expect(lastUrl().pathname).toBe('/api/v1/drives/worksheets');
  });

  it('maps list items onto the shared page shape with paging cursors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'f1', name: 'budget.xlsx', fullyQualifiedName: 'svc.budget' }],
          paging: { total: 3, after: 'next', before: 'prev' },
        }),
      ),
    );
    const page = await listDriveAssets('spreadsheet', { service: 'svc.drive' });
    expect(page.data).toEqual([
      expect.objectContaining({ id: 'f1', name: 'budget.xlsx', fullyQualifiedName: 'svc.budget' }),
    ]);
    expect(page.total).toBe(3);
    expect(page.after).toBe('next');
    expect(page.before).toBe('prev');
  });

  it('counts root assets with limit 0 and no fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [], paging: { total: 7 } })));
    const total = await countDriveAssets('file', 'svc.drive', 'all');
    expect(total).toBe(7);
    const url = lastUrl();
    expect(url.searchParams.get('limit')).toBe('0');
    expect(url.searchParams.get('root')).toBe('true');
    expect(url.searchParams.get('service')).toBe('svc.drive');
    expect(url.searchParams.get('include')).toBe('all');
    expect(url.searchParams.has('fields')).toBe(false);
  });

  it('PATCHes /v1/drives/{segment}/{id} with the JSON Patch media type', async () => {
    let seenInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seenInit = init;
        return jsonResponse({ id: 'f1', name: 'budget.xlsx', description: 'New' });
      }),
    );
    const patched = await patchDriveAsset('spreadsheet', 'f1', [
      { op: 'replace', path: '/description', value: 'New' },
    ]);
    expect(lastUrl().pathname).toBe('/api/v1/drives/spreadsheets/f1');
    expect(seenInit?.method).toBe('PATCH');
    expect(new Headers(seenInit?.headers).get('Content-Type')).toBe('application/json-patch+json');
    expect(JSON.parse(String(seenInit?.body))).toEqual([
      { op: 'replace', path: '/description', value: 'New' },
    ]);
    expect(patched).toMatchObject({ id: 'f1', name: 'budget.xlsx', description: 'New' });
  });

  it('rejects a patch response with neither id nor name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(
      patchDriveAsset('file', 'f1', [{ op: 'replace', path: '/description', value: 'x' }]),
    ).rejects.toThrow('missing id and name');
  });
});
