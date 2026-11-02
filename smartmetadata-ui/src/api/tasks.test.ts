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
import { addTaskComment, createTask, deleteTask, getTask, listTasks, resolveTask } from './tasks';

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

  it('deletes via DELETE /v1/tasks/{id} with hardDelete defaulting to false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await deleteTask('t1');
    expect(lastFetch().url).toContain('/api/v1/tasks/t1');
    expect(lastFetch().url).toContain('hardDelete=false');
    expect(lastFetch().init?.method).toBe('DELETE');
  });
});
