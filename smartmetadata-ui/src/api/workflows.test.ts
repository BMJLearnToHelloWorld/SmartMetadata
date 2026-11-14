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
import { createWorkflow, listWorkflowInstances, listWorkflows } from './workflows';

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

describe('workflows API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists workflow definitions from GET /v1/governance/workflowDefinitions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [
            {
              id: 'w1',
              name: 'nightly-dq',
              displayName: 'Nightly DQ',
              fullyQualifiedName: 'nightly-dq',
              description: 'Runs nightly checks',
            },
          ],
          paging: { total: 1, after: 'next-cursor' },
        }),
      ),
    );
    const page = await listWorkflows({ limit: 25 });
    expect(lastFetch().url).toContain('/api/v1/governance/workflowDefinitions');
    expect(lastFetch().url).toContain('limit=25');
    expect(page.data[0]?.displayName).toBe('Nightly DQ');
    expect(page.data[0]?.fullyQualifiedName).toBe('nightly-dq');
    expect(page.after).toBe('next-cursor');
    expect(page.total).toBe(1);
  });

  it('lists workflow instances by definition fqn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'i1', status: 'SUCCESS', startedAt: 1700000000000 }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listWorkflowInstances('nightly-dq');
    expect(lastFetch().url).toContain('/api/v1/governance/workflowInstances');
    expect(lastFetch().url).toContain('workflowDefinitionName=nightly-dq');
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.status).toBe('SUCCESS');
  });

  it('creates a workflow with the official required name + description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'weekly-sync',
          description: 'Syncs weekly',
        });
        return jsonResponse({ id: 'w2', name: 'weekly-sync', description: 'Syncs weekly' });
      }),
    );
    const created = await createWorkflow({ name: 'weekly-sync', description: 'Syncs weekly' });
    expect(created.id).toBe('w2');
    expect(lastFetch().url).toContain('/api/v1/governance/workflowDefinitions');
  });

  it('forwards the entityLink + window params for the AutoPilot running check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: [{ id: 'i1', status: 'RUNNING', startedAt: 1700000000000 }],
          paging: { total: 1 },
        }),
      ),
    );
    const page = await listWorkflowInstances('AutoPilotWorkflow', {
      startTs: 1000,
      endTs: 2000,
      entityLink: '<#E::databaseService::pg.warehouse>',
    });
    expect(lastFetch().url).toContain('workflowDefinitionName=AutoPilotWorkflow');
    expect(lastFetch().url).toContain('startTs=1000');
    expect(lastFetch().url).toContain('endTs=2000');
    expect(lastFetch().url).toContain(
      'entityLink=%3C%23E%3A%3AdatabaseService%3A%3Apg.warehouse%3E',
    );
    expect(page.data[0]?.status).toBe('RUNNING');
  });
});
