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
import { createBotWithUser, generateBotToken, revokeBotToken } from './bots';

describe('bots API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('creates a bot user then POST /v1/bots with that user name', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        calls.push({ url, body });
        if (url.includes('/api/v1/users') && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'u-bot', name: 'ingest-bot', isBot: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            id: 'b1',
            name: 'ingest-bot',
            botUser: { id: 'u-bot', name: 'ingest-bot', type: 'user' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const bot = await createBotWithUser({
      name: 'ingest-bot',
      botUser: 'ingest-bot',
      botUserEmail: 'ingest-bot@example.com',
      description: 'ingestion',
    });
    expect(bot.id).toBe('b1');
    expect(calls[0].url).toContain('/api/v1/users');
    expect(calls[0].body).toMatchObject({ name: 'ingest-bot', email: 'ingest-bot@example.com', isBot: true });
    expect(calls[1].url).toContain('/api/v1/bots');
    expect(calls[1].body).toMatchObject({ name: 'ingest-bot', botUser: 'ingest-bot' });
  });

  it('generates and revokes bot JWT via the user token endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/generateToken/')) {
          expect(init?.method).toBe('PUT');
          expect(JSON.parse(String(init?.body))).toEqual({ JWTTokenExpiry: '7' });
          return new Response(JSON.stringify({ JWTToken: 'jwt-bot', JWTTokenExpiry: '7' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        expect(url).toContain('/api/v1/users/revokeToken');
        expect(JSON.parse(String(init?.body))).toEqual({ id: 'u-bot' });
        return new Response('{}', { status: 200 });
      }),
    );

    const token = await generateBotToken('u-bot', '7');
    expect(token.JWTToken).toBe('jwt-bot');
    await revokeBotToken('u-bot');
  });
});
