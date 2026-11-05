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
import {
  addConversationReaction,
  addConversationReplyReaction,
  createConversation,
  createConversationReply,
  listConversationReplies,
  listConversations,
  removeConversationReaction,
  removeConversationReplyReaction,
} from './conversations';

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

  it('adds and removes a conversation reaction with PUT / DELETE on the reaction path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reactions =
          init?.method === 'DELETE'
            ? []
            : [{ reactionType: 'thumbsUp', user: { id: 'u1', name: 'u1' } }];
        return new Response(
          JSON.stringify({
            id: 'c1',
            about: '<#E::table::svc.db.orders>',
            message: 'please review',
            reactions,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const added = await addConversationReaction('c1', 'thumbsUp');
    expect(added.reactions?.[0]?.reactionType).toBe('thumbsUp');
    expect(lastFetch().url).toContain('/api/v1/conversations/c1/reaction/thumbsUp');
    expect(lastFetch().init?.method).toBe('PUT');
    const removed = await removeConversationReaction('c1', 'thumbsUp');
    expect(removed.reactions).toEqual([]);
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('lists replies and toggles a reply reaction on the reply reaction path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              id: 'r1',
              conversationId: 'c1',
              message: 'done',
              reactions: [{ reactionType: 'heart', user: { id: 'u1', name: 'u1' } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (init?.method === 'DELETE') {
          return new Response(
            JSON.stringify({ id: 'r1', conversationId: 'c1', message: 'done', reactions: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            data: [{ id: 'r1', conversationId: 'c1', message: 'done' }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const page = await listConversationReplies('c1');
    expect(page.data[0]?.message).toBe('done');
    expect(lastFetch().url).toContain('/api/v1/conversations/c1/replies');
    const reacted = await addConversationReplyReaction('c1', 'r1', 'heart');
    expect(reacted.reactions?.[0]?.reactionType).toBe('heart');
    expect(lastFetch().url).toContain('/api/v1/conversations/c1/replies/r1/reaction/heart');
    expect(lastFetch().init?.method).toBe('PUT');
    const unreacted = await removeConversationReplyReaction('c1', 'r1', 'heart');
    expect(unreacted.reactions).toEqual([]);
    expect(lastFetch().init?.method).toBe('DELETE');
  });
});
