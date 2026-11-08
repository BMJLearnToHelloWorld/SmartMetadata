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
  bulkDeleteDriveFiles,
  bulkMoveFilesToFolder,
  createContextMemory,
  createKnowledgePage,
  deleteKnowledgePage,
  downloadDriveFiles,
  getBulkSuccessfulIds,
  getKnowledgePageByFqn,
  getKnowledgePageVersion,
  listArchivedContextFiles,
  listContextMemories,
  listKnowledgePageVersions,
  listKnowledgePages,
  patchKnowledgePage,
  pinContextMemory,
  restoreKnowledgePage,
  searchContextFiles,
  unpinContextMemory,
  updateKnowledgePage,
  uploadDriveFile,
} from './contextCenter';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('contextCenter API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists knowledge pages from GET /v1/contextCenter/pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'p1',
              name: 'getting-started',
              fullyQualifiedName: 'getting-started',
              displayName: 'Getting Started',
              pageType: 'Article',
              page: {},
            },
            {
              id: 'p2',
              name: 'quicklink-abc',
              fullyQualifiedName: 'quicklink-abc',
              pageType: 'QuickLink',
              page: { url: 'https://example.com/docs' },
            },
          ],
          paging: { total: 2 },
        }),
      ),
    );
    const page = await listKnowledgePages({ limit: 25 });
    expect(page.data[0]?.displayName).toBe('Getting Started');
    expect(page.data[0]?.pageType).toBe('Article');
    expect(page.data[1]?.pageUrl).toBe('https://example.com/docs');
    expect(lastFetch().url).toContain('/api/v1/contextCenter/pages');
  });

  it('creates a quick link with page.url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'quicklink-xyz',
          pageType: 'QuickLink',
          page: { url: 'https://example.com' },
        });
        return jsonResponse({ id: 'p9', name: 'quicklink-xyz', pageType: 'QuickLink' });
      }),
    );
    const created = await createKnowledgePage({
      name: 'quicklink-xyz',
      pageType: 'QuickLink',
      pageUrl: 'https://example.com',
    });
    expect(created?.id).toBe('p9');
  });

  it('updates a page with the create-shaped body and no id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).not.toHaveProperty('id');
        expect(body).toMatchObject({ name: 'getting-started', pageType: 'Article' });
        expect(init?.method).toBe('PUT');
        return jsonResponse({ id: 'p1', name: 'getting-started', pageType: 'Article' });
      }),
    );
    const updated = await updateKnowledgePage({ name: 'getting-started', pageType: 'Article' });
    expect(updated?.id).toBe('p1');
  });

  it('maps extension values on a fetched page (M-Next A17)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'p1',
          name: 'getting-started',
          fullyQualifiedName: 'getting-started',
          pageType: 'Article',
          page: {},
          extension: { sensitivity: 'high', retentionDays: 30, reviewed: true },
        }),
      ),
    );
    const page = await getKnowledgePageByFqn('getting-started');
    expect(page?.extension).toEqual({ sensitivity: 'high', retentionDays: 30, reviewed: true });
  });

  it('patches a page with JSON Patch and the json-patch content type (M-Next A17)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as unknown;
        expect(body).toEqual([
          { op: 'add', path: '/extension', value: { sensitivity: 'high' } },
        ]);
        expect(init?.method).toBe('PATCH');
        expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
          'application/json-patch+json',
        );
        return jsonResponse({
          id: 'p1',
          name: 'getting-started',
          pageType: 'Article',
          extension: { sensitivity: 'high' },
        });
      }),
    );
    const patched = await patchKnowledgePage('p1', [
      { op: 'add', path: '/extension', value: { sensitivity: 'high' } },
    ]);
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/contextCenter/pages/p1');
    expect(patched.extension).toEqual({ sensitivity: 'high' });
  });

  it('restores a page with PUT /restore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ id: 'p1' });
        return jsonResponse({});
      }),
    );
    await restoreKnowledgePage('p1');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/contextCenter/pages/restore');
    expect(init?.method).toBe('PUT');
  });

  it('deletes a page recursively by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await deleteKnowledgePage('p1');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/contextCenter/pages/p1');
    expect(url).toContain('recursive=true');
    expect(init?.method).toBe('DELETE');
  });

  it('lists memories with status and pinned filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('statuses=Approved');
        expect(url).toContain('pinned=true');
        return jsonResponse({
          data: [
            {
              id: 'm1',
              question: 'What is churn?',
              answer: 'Lost customers.',
              entityStatus: 'Approved',
              pinned: true,
            },
          ],
          paging: { total: 1 },
        });
      }),
    );
    const page = await listContextMemories({ statuses: 'Approved', pinned: true });
    expect(page.data[0]?.question).toBe('What is churn?');
    expect(page.data[0]?.pinned).toBe(true);
  });

  it('creates a memory from question and answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ question: 'Q?' });
        return jsonResponse({ id: 'm2', question: 'Q?' });
      }),
    );
    const created = await createContextMemory({ question: 'Q?', answer: 'A.' });
    expect(created?.id).toBe('m2');
  });

  it('pins a memory with PUT /pin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await pinContextMemory('m1');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/contextCenter/memories/m1/pin');
    expect(init?.method).toBe('PUT');
  });

  it('unpins a memory with DELETE /pin (no PUT /unpin route exists server-side)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await unpinContextMemory('m1');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/contextCenter/memories/m1/pin');
    expect(url).not.toContain('/unpin');
    expect(init?.method).toBe('DELETE');
  });

  it('passes the new list parameters through for memories and pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/contextCenter/memories')) {
          expect(url).toContain('author=alice');
          expect(url).toContain('assets=a1');
          expect(url).toContain('offset=25');
          expect(url).toContain('fields=appliedCount');
          expect(url).toContain('before=cursor-b');
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        if (url.includes('/contextCenter/pages')) {
          expect(url).toContain('q=guide');
          expect(url).toContain('sortBy=updatedAt');
          expect(url).toContain('sortOrder=desc');
          expect(url).toContain('offset=10');
          expect(url).toContain('fields=owners');
          expect(url).toContain('before=cursor-b');
          return jsonResponse({ data: [], paging: { total: 0 } });
        }
        return jsonResponse({});
      }),
    );
    await listContextMemories({ author: 'alice', assets: 'a1', offset: 25, fields: 'appliedCount', before: 'cursor-b' });
    await listKnowledgePages({ q: 'guide', sortBy: 'updatedAt', sortOrder: 'desc', offset: 10, fields: 'owners', before: 'cursor-b' });
  });

  it('maps appliedCount on a fetched memory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'm1', question: 'What is churn?', appliedCount: 7 }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listContextMemories({ limit: 10, sortBy: 'appliedCount', sortOrder: 'desc' });
    expect(page.data[0]?.appliedCount).toBe(7);
  });

  it('searches context files from _source with size 100 and a folder term filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe('/api/v1/search/query');
        expect(url.searchParams.get('q')).toBe('guide');
        expect(url.searchParams.get('index')).toBe('contextFile');
        expect(url.searchParams.get('size')).toBe('100');
        expect(url.searchParams.get('sort_field')).toBe('updatedAt');
        expect(url.searchParams.get('sort_order')).toBe('desc');
        expect(JSON.parse(url.searchParams.get('query_filter') ?? '')).toEqual({
          query: { bool: { filter: { term: { 'folder.id': 'd1' } } } },
        });
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _source: {
                  id: 'f1',
                  name: 'guide.pdf',
                  fileExtension: 'pdf',
                  fileSize: 42,
                  folder: { id: 'd1', name: 'handbook' },
                  memoryCount: 2,
                  processingStatus: 'COMPLETED',
                  updatedBy: 'alice',
                },
              },
            ],
          },
        });
      }),
    );
    const { data, total } = await searchContextFiles('guide', { folderId: 'd1' });
    expect(total).toBe(1);
    expect(data[0]?.fileExtension).toBe('pdf');
    expect(data[0]?.fileSize).toBe(42);
    expect(data[0]?.folder?.id).toBe('d1');
    expect(data[0]?.memoryCount).toBe(2);
    expect(data[0]?.processingStatus).toBe('COMPLETED');
    expect(data[0]?.updatedBy).toBe('alice');
  });

  it('omits the folder term filter when no folder is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        expect(url.searchParams.has('query_filter')).toBe(false);
        return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
      }),
    );
    const { data, total } = await searchContextFiles('guide');
    expect(data).toEqual([]);
    expect(total).toBe(0);
  });

  it('bulk-deletes with soft delete by default and reports successful ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ ids: ['f1', 'f2'], hardDelete: false });
        return jsonResponse({
          numberOfRowsProcessed: 2,
          numberOfRowsPassed: 1,
          numberOfRowsFailed: 1,
          successRequest: [{ request: 'f1', status: 200 }],
          failedRequest: [{ request: 'f2', status: 404, message: 'not found' }],
          status: 'PARTIAL_SUCCESS',
        });
      }),
    );
    const result = await bulkDeleteDriveFiles(['f1', 'f2']);
    expect(lastFetch().url).toContain('/api/v1/contextCenter/drive/files/bulk/delete');
    expect(result.numberOfRowsFailed).toBe(1);
    expect(getBulkSuccessfulIds(result)).toEqual(new Set(['f1']));
  });

  it('bulk-moves with the official folder body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PUT');
        expect(JSON.parse(String(init?.body))).toEqual({
          ids: ['f1'],
          folder: { id: 'd2', type: 'folder' },
        });
        return jsonResponse({
          numberOfRowsProcessed: 1,
          numberOfRowsPassed: 1,
          numberOfRowsFailed: 0,
          successRequest: [{ request: 'f1', status: 200 }],
          status: 'SUCCESS',
        });
      }),
    );
    const result = await bulkMoveFilesToFolder(['f1'], 'd2');
    expect(lastFetch().url).toContain('/api/v1/contextCenter/drive/files/bulk/move');
    expect(getBulkSuccessfulIds(result)).toEqual(new Set(['f1']));
  });

  it('bulk-downloads a zip blob', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ ids: ['f1'] });
        // String body, not a Blob body: Node 22's Response constructor calls
        // blob.stream(), which jsdom's Blob lacks (CI failure on Node 22,
        // while Node 24 tolerates it); .blob() still yields type
        // 'application/zip' from the Content-Type header.
        return new Response('PK\x03\x04', { status: 200, headers: { 'Content-Type': 'application/zip' } });
      }),
    );
    const out = await downloadDriveFiles(['f1']);
    expect(lastFetch().url).toContain('/api/v1/contextCenter/drive/files/bulk/download');
    expect(out.type).toBe('application/zip');
  });

  it('refuses to save an error JSON body as a zip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Object storage is not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(downloadDriveFiles(['f1'])).rejects.toThrow('Object storage is not configured');
  });

  it('refuses to download with no selection', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadDriveFiles([])).rejects.toThrow('No files selected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists archived files with include=deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain('include=deleted');
        return jsonResponse({
          data: [{ id: 'f1', name: 'old.pdf', fileExtension: 'pdf' }],
          paging: { total: 1 },
        });
      }),
    );
    const page = await listArchivedContextFiles();
    expect(page.data[0]?.fileExtension).toBe('pdf');
  });

  it('uploads a file with folder field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body as FormData;
        expect(body.get('file')).toBeInstanceOf(File);
        expect(body.get('folder')).toBe('handbook');
        return jsonResponse({ id: 'f2', name: 'guide.pdf' });
      }),
    );
    const uploaded = await uploadDriveFile(new File(['x'], 'guide.pdf'), 'handbook');
    expect(uploaded?.id).toBe('f2');
    expect(lastFetch().url).toContain('/api/v1/contextCenter/drive/files/upload');
  });

  it('lists knowledge page versions from GET /v1/contextCenter/pages/{id}/versions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          versions: [
            {
              version: 0.2,
              updatedAt: 1700000000000,
              updatedBy: 'alice',
              changeDescription: {
                fieldsUpdated: [{ name: 'description', oldValue: 'old', newValue: 'new' }],
              },
            },
          ],
        }),
      ),
    );
    const versions = await listKnowledgePageVersions('p1');
    expect(lastFetch().url).toContain('/api/v1/contextCenter/pages/p1/versions');
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(0.2);
    expect(versions[0]?.updatedBy).toBe('alice');
    expect(versions[0]?.changeDescription?.fieldsUpdated?.[0]?.field).toBe('description');
  });

  it('returns an empty list when the versions payload carries no array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(listKnowledgePageVersions('p1')).resolves.toEqual([]);
  });

  it('fetches one knowledge page version with its changeDescription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'p1',
          name: 'getting-started',
          fullyQualifiedName: 'getting-started',
          version: 0.1,
          description: 'old text',
          changeDescription: {
            fieldsAdded: [{ name: 'tags', newValue: 'a' }],
          },
        }),
      ),
    );
    const snapshot = await getKnowledgePageVersion('p1', '0.1');
    expect(lastFetch().url).toContain('/api/v1/contextCenter/pages/p1/versions/0.1');
    expect(snapshot?.version).toBe(0.1);
    expect(snapshot?.changeDescription?.fieldsAdded?.[0]?.field).toBe('tags');
  });
});
