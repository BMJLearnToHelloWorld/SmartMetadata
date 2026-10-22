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
import { createConversation, createConversationReply, listConversations } from './conversations';

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('conversations API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('lists conversations from GET /v1/conversations and can scope by entityLink', async () => {
    const about = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'c1', about, message: 'please review', source: 'User', replyCount: 0 }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await listConversations({ entityLink: about, limit: 20 });
    expect(page.data[0]?.message).toBe('please review');
    expect(lastFetch().url).toContain('/api/v1/conversations');
    expect(lastFetch().url).toContain(`entityLink=${encodeURIComponent(about)}`);
  });

  it('creates a conversation with schema-required message and about', async () => {
    const about = toEntityLink('table', 'svc.db.schema.orders');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toEqual({ message: 'please review', about });
        return new Response(JSON.stringify({ id: 'c2', about, message: 'please review' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const created = await createConversation({ message: 'please review', about });
    expect(created.id).toBe('c2');
    expect(lastFetch().init?.method).toBe('POST');
    expect(lastFetch().url).toContain('/api/v1/conversations');
  });

  it('replies with POST /v1/conversations/{id}/replies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        expect(body).toEqual({ message: 'done' });
        return new Response(JSON.stringify({ id: 'r2', conversationId: 'c1', message: 'done' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const reply = await createConversationReply('c1', { message: 'done' });
    expect(reply.conversationId).toBe('c1');
    expect(lastFetch().url).toContain('/api/v1/conversations/c1/replies');
    expect(lastFetch().init?.method).toBe('POST');
  });
});
