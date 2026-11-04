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
  createContextMemory,
  createKnowledgePage,
  deleteKnowledgePage,
  getKnowledgePageVersion,
  listArchivedContextFiles,
  listContextMemories,
  listKnowledgePageVersions,
  listKnowledgePages,
  pinContextMemory,
  restoreKnowledgePage,
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
