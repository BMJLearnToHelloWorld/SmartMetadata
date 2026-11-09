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
import { toEntityLink } from '@/quality/entityLink';
import { addTaskComment, createTask, deleteTask, getTask, listDataAccessRequests, listMyAssignedTasks, listTasks, patchTask, resolveTask } from './tasks';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('tasks API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('maps a MemoryConflictReview payload to reviewPayload disputes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 't1',
                type: 'MemoryConflictReview',
                status: 'Open',
                payload: {
                  disputes: [
                    {
                      memory: { id: 'm2', type: 'contextMemory', name: 'churn-rate' },
                      detectedAt: 1761955200000,
                    },
                    { memory: { id: 'm3', type: 'contextMemory', name: 'churn-faq' } },
                  ],
                },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTasks({ type: 'MemoryConflictReview', status: 'Open', limit: 1 });
    expect(page.data[0]?.reviewPayload?.disputes).toHaveLength(2);
    expect(page.data[0]?.reviewPayload?.disputes[0]?.memory.id).toBe('m2');
    expect(page.data[0]?.reviewPayload?.disputes[0]?.detectedAt).toBe(1761955200000);
    expect(page.data[0]?.reviewPayload?.disputes[1]?.memory.name).toBe('churn-faq');
  });

  it('skips malformed dispute entries and leaves reviewPayload undefined for non-review tasks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 't1',
                type: 'MemoryConflictReview',
                status: 'Open',
                payload: {
                  disputes: [
                    { memory: { id: 'm2', type: 'contextMemory', name: 'churn-rate' } },
                    { detectedAt: '2026-11-01T00:00:00.000Z' },
                    'junk',
                    null,
                  ],
                },
              },
              {
                id: 't2',
                type: 'CustomTask',
                status: 'Open',
                payload: { disputes: [{ memory: { id: 'm9', type: 'contextMemory' } }] },
              },
            ],
            paging: { total: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTasks({ status: 'Open' });
    expect(page.data[0]?.reviewPayload?.disputes).toHaveLength(1);
    expect(page.data[0]?.reviewPayload?.disputes[0]?.memory.id).toBe('m2');
    expect(page.data[1]?.reviewPayload).toBeUndefined();
  });

  it('lists tasks from GET /v1/tasks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 't1', name: 'review-orders', category: 'Custom', type: 'CustomTask', status: 'Open' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listTasks({ statusGroup: 'open', limit: 50 });
    expect(page.data[0]?.status).toBe('Open');
    expect(lastFetch().url).toContain('/api/v1/tasks');
    expect(lastFetch().url).toContain('statusGroup=open');
  });

  it('lists my assigned tasks from GET /v1/tasks/assigned with cursor paging, not offset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 't9', name: 'review-memory', type: 'MemoryConflictReview', status: 'Open' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listMyAssignedTasks({ after: 'cursor-1' });
    expect(page.data[0]?.type).toBe('MemoryConflictReview');
    const url = new URL(lastFetch().url);
    expect(url.pathname).toBe('/api/v1/tasks/assigned');
    expect(url.searchParams.get('type')).toBe('MemoryConflictReview');
    expect(url.searchParams.get('status')).toBe('Open');
    expect(url.searchParams.get('fields')).toBe('about,createdBy,payload');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('after')).toBe('cursor-1');
    expect(url.searchParams.has('offset')).toBe(false);
  });

  it('creates a CustomTask with schema-required category and type', async () => {
    const about = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toMatchObject({
          category: 'Custom',
          type: 'CustomTask',
          description: 'Check owners',
          about,
        });
        return new Response(JSON.stringify({ id: 't2', category: 'Custom', type: 'CustomTask' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createTask({
      category: 'Custom',
      type: 'CustomTask',
      description: 'Check owners',
      about,
    });
    expect(created.id).toBe('t2');
    expect(lastFetch().init?.method).toBe('POST');
  });

  it('loads one task and can resolve and comment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/comments')) {
          return new Response(
            JSON.stringify({ id: 't1', comments: [{ id: 'cm1', message: 'noted' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.includes('/resolve')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          expect(body).toMatchObject({ resolutionType: 'Completed' });
          return new Response(JSON.stringify({ id: 't1', status: 'Completed' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({ id: 't1', name: 'review-orders', status: 'Open', comments: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const task = await getTask('t1');
    expect(task.id).toBe('t1');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1');

    const resolved = await resolveTask('t1', { resolutionType: 'Completed', comment: 'done' });
    expect(resolved.status).toBe('Completed');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1/resolve');
    expect(lastFetch().init?.method).toBe('POST');

    const commented = await addTaskComment('t1', 'noted');
    expect(commented.comments[0]?.message).toBe('noted');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1/comments');
  });

  it('maps suggestion payloads and available transitions, and resolves with newValue and transitionId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/resolve')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          expect(body).toEqual({
            resolutionType: 'Approved',
            newValue: 'new text',
            transitionId: 'approve',
          });
          return new Response(JSON.stringify({ id: 't1', status: 'Approved' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            id: 't1',
            type: 'DescriptionUpdate',
            status: 'Open',
            comments: [],
            payload: { currentDescription: 'old text', newDescription: 'new text' },
            availableTransitions: [
              {
                id: 'approve',
                label: 'Approve',
                resolutionType: 'Approved',
                targetStageId: 'approved',
                targetTaskStatus: 'Approved',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const loaded = await getTask('t1');
    expect(loaded.suggestionPayload?.newDescription).toBe('new text');
    expect(loaded.availableTransitions?.[0]?.id).toBe('approve');
    expect(loaded.availableTransitions?.[0]?.targetStageId).toBe('approved');
    const resolved = await resolveTask('t1', {
      resolutionType: 'Approved',
      newValue: 'new text',
      transitionId: 'approve',
    });
    expect(resolved.status).toBe('Approved');
  });

  it('deletes via DELETE /v1/tasks/{id} with hardDelete defaulting to false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await deleteTask('t1');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1');
    expect(lastFetch().url).toContain('hardDelete=false');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('patches via PATCH /v1/tasks/{id} with a JSON Patch document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PATCH');
        expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
        expect(JSON.parse(String(init?.body ?? '[]'))).toEqual([
          { op: 'replace', path: '/assignees', value: [{ id: 'u1', type: 'user' }] },
        ]);
        return new Response(
          JSON.stringify({
            id: 't1',
            name: 'review-orders',
            status: 'Open',
            assignees: [{ id: 'u1', type: 'user', name: 'amy' }],
            comments: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const task = await patchTask('t1', [
      { op: 'replace', path: '/assignees', value: [{ id: 'u1', type: 'user' }] },
    ]);
    expect(task.assignees[0]?.id).toBe('u1');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1');
  });

  it('lists data access requests from GET /v1/tasks/dataAccessRequests with DAR filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('/api/v1/tasks/dataAccessRequests');
        expect(url).toContain('statusGroup=active');
        expect(url).toContain('accessType=Masked');
        expect(url).toContain('offset=50');
        expect(url).toContain('fields=');
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'dar1',
                name: 'dar-orders',
                type: 'DataAccessRequest',
                status: 'Open',
                payload: { accessType: 'Masked', requestedAccess: 'Read', reason: 'audit' },
              },
            ],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const page = await listDataAccessRequests({ statusGroup: 'active', accessType: 'Masked', offset: 50 });
    expect(page.data[0]?.payload?.accessType).toBe('Masked');
    expect(page.data[0]?.payload?.reason).toBe('audit');
    expect(page.total).toBe(1);
  });

  it('creates a DataAccessRequest with the spec payload and maps it back on read', async () => {
    const about = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/v1/tasks')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          expect(body).toMatchObject({
            category: 'DataAccess',
            type: 'DataAccessRequest',
            about,
            payload: {
              accessType: 'ColumnLevel',
              requestedAccess: 'Read',
              columns: ['svc.db.schema.orders.email'],
              reason: 'support investigation',
            },
          });
          return new Response(
            JSON.stringify({
              id: 'dar9',
              type: 'DataAccessRequest',
              status: 'Open',
              payload: {
                accessType: 'ColumnLevel',
                requestedAccess: 'Read',
                columns: ['svc.db.schema.orders.email'],
                reason: 'support investigation',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            id: 'dar9',
            type: 'DataAccessRequest',
            status: 'Open',
            payload: {
              accessType: 'ColumnLevel',
              columns: ['svc.db.schema.orders.email'],
              reason: 'support investigation',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const created = await createTask({
      category: 'DataAccess',
      type: 'DataAccessRequest',
      about,
      payload: {
        accessType: 'ColumnLevel',
        requestedAccess: 'Read',
        columns: ['svc.db.schema.orders.email'],
        reason: 'support investigation',
      },
    });
    expect(created.id).toBe('dar9');
    expect(created.payload?.accessType).toBe('ColumnLevel');
    const read = await getTask('dar9');
    expect(read.payload?.columns).toEqual(['svc.db.schema.orders.email']);
  });

  it('drops a non-DAR payload instead of misreading another task type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: 't3', type: 'CustomTask', status: 'Open', payload: { accessType: 'Masked' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const task = await getTask('t3');
    expect(task.payload).toBeUndefined();
  });
});
