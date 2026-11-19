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
import { createRole, deleteRole, getRoleByName, listRoles, patchRole, ROLE_FIELDS } from './roles';

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] as RequestInit | undefined };
}

function stubFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

const sampleRole = {
  id: 'r1',
  name: 'DataSteward',
  fullyQualifiedName: 'DataSteward',
  displayName: 'Data Steward',
  description: 'Steward role',
  policies: [{ id: 'p1', name: 'DataConsumerPolicy', fullyQualifiedName: 'DataConsumerPolicy', description: 'Policy desc' }],
  users: [],
  teams: [],
};

describe('roles API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists roles with the caller fields and cursor', async () => {
    stubFetch({ data: [sampleRole], paging: { total: 1 } });
    const page = await listRoles(15, 'c1', 'policies');
    expect(page.data[0]?.name).toBe('DataSteward');
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/roles');
    expect(url).toContain('fields=policies');
    expect(url).toContain('limit=15');
    expect(url).toContain('after=c1');
  });

  it('keeps the default fields when the caller passes none', async () => {
    stubFetch({ data: [], paging: {} });
    await listRoles();
    expect(decodeURIComponent(lastFetch().url)).toContain(`fields=${ROLE_FIELDS}`);
  });

  it('carries the entity FQN and reference descriptions verbatim', async () => {
    stubFetch({ data: [sampleRole], paging: { total: 1 } });
    const page = await listRoles();
    expect(page.data[0]?.fullyQualifiedName).toBe('DataSteward');
    expect(page.data[0]?.policies[0]).toMatchObject({
      fullyQualifiedName: 'DataConsumerPolicy',
      description: 'Policy desc',
    });
  });

  it('gets one role by name with the requested fields', async () => {
    stubFetch(sampleRole);
    const role = await getRoleByName('DataSteward', ROLE_FIELDS);
    expect(role.name).toBe('DataSteward');
    const url = decodeURIComponent(lastFetch().url);
    expect(url).toContain('/api/v1/roles/name/DataSteward');
    expect(url).toContain(`fields=${ROLE_FIELDS}`);
  });

  it('encodes FQNs with special characters in the by-name path', async () => {
    stubFetch(sampleRole);
    await getRoleByName('a/b c', ROLE_FIELDS);
    expect(lastFetch().url).toContain('/api/v1/roles/name/a%2Fb%20c');
  });

  it('patches a role with the JSON Patch content type', async () => {
    stubFetch(sampleRole);
    await patchRole('r1', [{ op: 'replace', path: '/description', value: 'New' }]);
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/roles/r1');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    expect(JSON.parse(String(init?.body ?? '[]'))).toEqual([
      { op: 'replace', path: '/description', value: 'New' },
    ]);
  });

  it('deletes a role with the hardDelete/recursive wire', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    await deleteRole('r1');
    const parsed = new URL(lastFetch().url);
    expect(`${parsed.pathname}${parsed.search}`).toBe('/api/v1/roles/r1?hardDelete=true&recursive=false');
    await deleteRole('r1', true);
    const recursive = new URL(lastFetch().url);
    expect(`${recursive.pathname}${recursive.search}`).toBe('/api/v1/roles/r1?hardDelete=true&recursive=true');
  });

  it('creates a role with FQN policy strings, no displayName, no object refs', async () => {
    stubFetch(sampleRole, 201);
    await createRole({ name: 'Analyst', description: 'D', policies: ['PolicyA', 'PolicyB'] });
    const { init } = lastFetch();
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(body).toEqual({ name: 'Analyst', description: 'D', policies: ['PolicyA', 'PolicyB'] });
  });
});
