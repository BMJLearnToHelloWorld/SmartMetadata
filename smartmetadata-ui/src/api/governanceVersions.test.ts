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
import { getGovernanceVersion, latestGovernanceVersionPath, listGovernanceVersions } from './governanceVersions';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('governanceVersions API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists domain versions and fetches a version snapshot from the per-kind collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/versions/0.2')) {
          return new Response(
            JSON.stringify({ id: 'd1', name: 'Finance', description: 'old desc', version: 0.2 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            versions: [
              {
                version: 0.2,
                updatedAt: 10,
                changeDescription: {
                  fieldsUpdated: [{ name: 'description', oldValue: 'old desc', newValue: 'new desc' }],
                },
              },
              { version: 0.1, updatedAt: 5 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const versions = await listGovernanceVersions('domain', 'd1');
    expect(versions).toHaveLength(2);
    expect(versions[0]?.changeDescription?.fieldsUpdated?.[0]?.field).toBe('description');
    expect(lastFetch().url).toContain('/api/v1/domains/d1/versions');
    const snapshot = await getGovernanceVersion('domain', 'd1', '0.2');
    expect(snapshot.name).toBe('Finance');
    expect(lastFetch().url).toContain('/api/v1/domains/d1/versions/0.2');
  });

  it('maps each kind to its own collection and picks the newest version path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ versions: [{ version: 0.1 }, { version: 0.3 }, { version: 0.2 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const path = await latestGovernanceVersionPath('term', 't1', (version) => `/governance/terms/t1/versions/${version}`);
    expect(path).toBe('/governance/terms/t1/versions/0.3');
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms/t1/versions');
  });

  it('returns null for the deep link when there are no versions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ versions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      latestGovernanceVersionPath('classification', 'c1', (version) => `/governance/classifications/c1/versions/${version}`),
    ).resolves.toBeNull();
  });

  it('lists tag versions from the tags collection (M-Next A4)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ versions: [{ version: 0.1 }, { version: 0.2 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const versions = await listGovernanceVersions('tag', 't1');
    expect(versions).toHaveLength(2);
    expect(lastFetch().url).toContain('/api/v1/tags/t1/versions');
    const path = await latestGovernanceVersionPath('tag', 't1', (version) => `/governance/tags/t1/versions/${version}`);
    expect(path).toBe('/governance/tags/t1/versions/0.2');
  });
});
