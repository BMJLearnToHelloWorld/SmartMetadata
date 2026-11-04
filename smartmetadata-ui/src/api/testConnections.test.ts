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
  createTestConnectionWorkflow,
  getTestConnectionDefinition,
  getTestConnectionWorkflow,
  isTestConnectionComplete,
  triggerTestConnectionWorkflow,
} from './testConnections';
import { getServiceVersion, listServiceVersions } from './serviceVersions';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

function stubJson(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
}

describe('test-connection workflow API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fetches the definition by connection type FQN', async () => {
    stubJson({ steps: [{ name: 'CheckAccess', mandatory: true }] });
    const steps = await getTestConnectionDefinition('Postgres');
    expect(steps).toMatchObject([{ name: 'CheckAccess', mandatory: true }]);
    expect(lastFetch().url).toContain(
      '/api/v1/services/testConnectionDefinitions/name/Postgres.testConnectionDefinition',
    );
  });

  it('creates a TEST_CONNECTION automations workflow with the official request shape', async () => {
    stubJson({ id: 'w1', status: 'Pending' });
    const workflow = await createTestConnectionWorkflow({
      serviceName: 'warehouse',
      kind: 'database',
      connectionType: 'Postgres',
      connection: { config: { type: 'Postgres' } },
    });
    expect(workflow).toMatchObject({ id: 'w1', status: 'Pending' });
    expect(lastFetch().url).toContain('/api/v1/automations/workflows');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('triggers via POST /v1/automations/workflows/trigger/{id} and reads workflow responses', async () => {
    stubJson({ id: 'w1', status: 'Successful', response: { status: 'Successful', steps: [] } });
    await triggerTestConnectionWorkflow('w1');
    expect(lastFetch().url).toContain('/api/v1/automations/workflows/trigger/w1');
    stubJson({ id: 'w1', status: 'Successful', response: { status: 'Successful', steps: [] } });
    const workflow = await getTestConnectionWorkflow('w1');
    expect(workflow.response?.status).toBe('Successful');
    expect(isTestConnectionComplete('Successful')).toBe(true);
    expect(isTestConnectionComplete('Running')).toBe(false);
  });
});

describe('service versions API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists versions from the per-kind collection endpoint', async () => {
    stubJson({ versions: [{ version: 0.1, updatedAt: 1000, updatedBy: 'admin' }] });
    const versions = await listServiceVersions('api', 's1');
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(0.1);
    expect(lastFetch().url).toContain('/api/v1/services/apiServices/s1/versions');
  });

  it('loads a version snapshot through the per-kind mapper', async () => {
    stubJson({ id: 's1', name: 'svc', serviceType: 'Rest' });
    const snapshot = await getServiceVersion('api', 's1', 0.1);
    expect(snapshot).toMatchObject({ id: 's1', kind: 'api', serviceType: 'Rest' });
    expect(lastFetch().url).toContain('/api/v1/services/apiServices/s1/versions/0.1');
  });
});
