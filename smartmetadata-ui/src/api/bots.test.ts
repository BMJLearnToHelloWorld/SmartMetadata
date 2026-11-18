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
import type { AdminBot } from '@/types/admin';
import * as botsModule from './bots';
import {
  BOT_SEARCH_PAGE_SIZE,
  JWT_TOKEN_EXPIRY_NUMERIC_DAYS,
  JWT_TOKEN_EXPIRY_OPTIONS,
  buildBotSearchQueryFilter,
  createBot,
  deleteBot,
  enrichBotWithMatchedUser,
  escapeESReservedCharacters,
  formatSearchUsers,
  generateBotToken,
  getAuthMechanismForBotUser,
  getBot,
  getBotByName,
  indexBotsByLowerName,
  listBots,
  mapBot,
  matchBotsBySearchTerm,
  restoreBot,
  revokeBotToken,
  searchBots,
  updateBotDetail,
} from './bots';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response,
): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

function queryOf(url: string): URLSearchParams {
  return new URL(url, 'http://test.local').searchParams;
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? '{}')) as Record<string, unknown>;
}

function botRecord(overrides: Partial<AdminBot> = {}): AdminBot {
  return {
    id: 'b1',
    name: 'ingest-bot',
    displayName: 'Ingest Bot',
    description: 'ingestion bot',
    botUser: { id: 'u1', name: 'ingest-bot', type: 'user' },
    ...overrides,
  };
}

describe('bots API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('has no getBotToken or createBotWithUser exports (B34 deletion)', () => {
    expect('getBotToken' in botsModule).toBe(false);
    expect('createBotWithUser' in botsModule).toBe(false);
    expect(typeof botsModule.generateBotToken).toBe('function');
    expect(typeof botsModule.revokeBotToken).toBe('function');
    expect(typeof botsModule.getAuthMechanismForBotUser).toBe('function');
    expect(typeof botsModule.getBot).toBe('function');
    expect(typeof botsModule.mapJwt).toBe('function');
  });

  it('listBots sends the param object and maps the generated-Bot fields', async () => {
    const calls = stubFetch(() =>
      jsonResponse({
        data: [
          {
            id: 'b1',
            name: 'ingest-bot',
            displayName: 'Ingest Bot',
            description: 'ingestion',
            fullyQualifiedName: 'ingest-bot',
            provider: 'system',
            domains: [{ id: 'd1', name: 'domain', type: 'domain' }],
            updatedAt: 1700000000000,
            updatedBy: 'admin',
            version: 0.3,
            botUser: { id: 'u1', name: 'ingest-bot', type: 'user' },
          },
          { id: 'no-name' },
          { name: 'no-id' },
        ],
        paging: { after: 'after-cursor', before: 'before-cursor', total: 3 },
      }),
    );

    const page = await listBots({
      limit: 15,
      after: 'a1',
      before: 'b1',
      include: 'deleted',
      fields: ['domains', 'provider'],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/v1/bots');
    const query = queryOf(calls[0].url);
    expect(query.get('limit')).toBe('15');
    expect(query.get('after')).toBe('a1');
    expect(query.get('before')).toBe('b1');
    expect(query.get('include')).toBe('deleted');
    expect(query.get('fields')).toBe('domains,provider');
    expect(page.after).toBe('after-cursor');
    expect(page.before).toBe('before-cursor');
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      id: 'b1',
      name: 'ingest-bot',
      fullyQualifiedName: 'ingest-bot',
      provider: 'system',
      updatedAt: 1700000000000,
      updatedBy: 'admin',
      version: 0.3,
    });
    expect(page.data[0].domains).toEqual([{ id: 'd1', name: 'domain', type: 'domain' }]);
  });

  it('mapBot drops rows missing id or name and maps the bot user ref', () => {
    expect(mapBot({ id: 'x' })).toBeNull();
    expect(mapBot({ name: 'x' })).toBeNull();
    expect(mapBot(null)).toBeNull();
    expect(mapBot({ id: 'b1', name: 'bot', botUser: { id: 'u1', name: 'bot' } })).toMatchObject({
      id: 'b1',
      name: 'bot',
      botUser: { id: 'u1', name: 'bot' },
    });
  });

  it('getBotByName encodes the FQN and forwards include/fields', async () => {
    const calls = stubFetch(() => jsonResponse({ id: 'b1', name: 'my bot' }));
    const bot = await getBotByName('my bot', { include: 'all', fields: 'domains' });
    expect(bot.id).toBe('b1');
    expect(calls[0].url).toContain('/api/v1/bots/name/my%20bot');
    expect(queryOf(calls[0].url).get('include')).toBe('all');
    expect(queryOf(calls[0].url).get('fields')).toBe('domains');
  });

  it('getBot throws when the response has no id and name', async () => {
    stubFetch(() => jsonResponse({}));
    await expect(getBot('b1')).rejects.toThrow('missing id and name');
  });

  it('createBot POSTs the CreateBot payload as-is', async () => {
    const calls = stubFetch(() => jsonResponse({ id: 'b2', name: 'new-bot' }));
    const bot = await createBot({
      botUser: 'new-bot',
      name: 'new-bot',
      displayName: 'New Bot',
      description: 'desc',
      allowImpersonation: true,
      domains: ['domain-a'],
    });
    expect(bot.id).toBe('b2');
    expect(calls[0].init?.method).toBe('POST');
    expect(bodyOf(calls[0])).toEqual({
      botUser: 'new-bot',
      name: 'new-bot',
      displayName: 'New Bot',
      description: 'desc',
      allowImpersonation: true,
      domains: ['domain-a'],
    });
  });

  it('updateBotDetail PATCHes with the json-patch content type', async () => {
    const calls = stubFetch(() => jsonResponse({ id: 'b1', name: 'bot', displayName: 'New' }));
    const patch = [{ op: 'replace' as const, path: '/displayName', value: 'New' }];
    const bot = await updateBotDetail('b1', patch);
    expect(bot.displayName).toBe('New');
    expect(calls[0].init?.method).toBe('PATCH');
    expect(new Headers(calls[0].init?.headers).get('Content-Type')).toBe(
      'application/json-patch+json',
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(patch);
  });

  it('restoreBot PUTs the id to /v1/bots/restore', async () => {
    const calls = stubFetch(() => jsonResponse({ id: 'b1', name: 'bot' }));
    await restoreBot('b1');
    expect(calls[0].url).toContain('/api/v1/bots/restore');
    expect(calls[0].init?.method).toBe('PUT');
    expect(bodyOf(calls[0])).toEqual({ id: 'b1' });
  });

  it('deleteBot DELETEs with hardDelete and recursive flags', async () => {
    const calls = stubFetch(() => new Response('', { status: 200 }));
    await deleteBot('b1', { hardDelete: true, recursive: false });
    expect(calls[0].url).toContain('/api/v1/bots/b1');
    expect(calls[0].init?.method).toBe('DELETE');
    expect(queryOf(calls[0].url).get('hardDelete')).toBe('true');
    expect(queryOf(calls[0].url).get('recursive')).toBe('false');
  });

  it('generateBotToken POSTs {id, JWTTokenExpiry} and maps the config', async () => {
    const calls = stubFetch(() =>
      jsonResponse({ config: { JWTToken: 'jwt-bot', JWTTokenExpiry: '7', JWTTokenExpiresAt: 42 } }),
    );
    const token = await generateBotToken('u-bot', '7');
    expect(token).toEqual({ JWTToken: 'jwt-bot', JWTTokenExpiry: '7', JWTTokenExpiresAt: 42 });
    expect(calls[0].url).toContain('/api/v1/users/generateToken');
    expect(calls[0].url).not.toContain('/generateToken/u-bot');
    expect(calls[0].init?.method).toBe('POST');
    expect(bodyOf(calls[0])).toEqual({ id: 'u-bot', JWTTokenExpiry: '7' });
  });

  it('revokeBotToken PUTs {id} and returns the mapped user', async () => {
    const calls = stubFetch(() =>
      jsonResponse({ id: 'u-bot', name: 'ingest-bot', isAdmin: false, roles: [] }),
    );
    const user = await revokeBotToken('u-bot');
    expect(user).toMatchObject({ id: 'u-bot', name: 'ingest-bot', isAdmin: false, roles: [] });
    expect(calls[0].url).toContain('/api/v1/users/revokeToken');
    expect(calls[0].init?.method).toBe('PUT');
    expect(bodyOf(calls[0])).toEqual({ id: 'u-bot' });
  });

  it('getAuthMechanismForBotUser keeps an empty response an empty object', async () => {
    const calls = stubFetch(() => jsonResponse({}));
    const empty = await getAuthMechanismForBotUser('u-bot');
    expect(empty).toEqual({});
    expect(Object.keys(empty)).toHaveLength(0);
    expect(calls[0].url).toContain('/api/v1/users/auth-mechanism/u-bot');

    stubFetch(() =>
      jsonResponse({ authType: 'JWT', config: { JWTToken: 't', JWTTokenExpiresAt: 7 } }),
    );
    const filled = await getAuthMechanismForBotUser('u-bot');
    expect(filled).toEqual({
      authType: 'JWT',
      config: { JWTToken: 't', JWTTokenExpiry: undefined, JWTTokenExpiresAt: 7 },
    });
  });

  describe('ES escaping (StringUtils port)', () => {
    it('escapes each reserved character', () => {
      expect(escapeESReservedCharacters('a+b')).toBe('a\\+b');
      expect(escapeESReservedCharacters('a-b')).toBe('a\\-b');
      expect(escapeESReservedCharacters('a=b')).toBe('a\\=b');
      expect(escapeESReservedCharacters('a&b')).toBe('a\\&b');
      expect(escapeESReservedCharacters('a|b')).toBe('a\\|b');
      expect(escapeESReservedCharacters('a>b')).toBe('a\\>b');
      expect(escapeESReservedCharacters('a<b')).toBe('a\\<b');
      expect(escapeESReservedCharacters('a!b')).toBe('a\\!b');
      expect(escapeESReservedCharacters('a(b)')).toBe('a\\(b\\)');
      expect(escapeESReservedCharacters('a{b}')).toBe('a\\{b\\}');
      expect(escapeESReservedCharacters('a[b]')).toBe('a\\[b\\]');
      expect(escapeESReservedCharacters('a^b')).toBe('a\\^b');
      expect(escapeESReservedCharacters('a"b')).toBe('a\\"b');
      expect(escapeESReservedCharacters('a~b')).toBe('a\\~b');
      expect(escapeESReservedCharacters('a*b')).toBe('a\\*b');
      expect(escapeESReservedCharacters('a?b')).toBe('a\\?b');
      expect(escapeESReservedCharacters('a:b')).toBe('a\\:b');
      expect(escapeESReservedCharacters('a\\b')).toBe('a\\\\b');
      expect(escapeESReservedCharacters('a/b')).toBe('a\\/b');
    });

    it('returns unchanged text as-is and undefined as empty', () => {
      expect(escapeESReservedCharacters('plain text')).toBe('plain text');
      expect(escapeESReservedCharacters('')).toBe('');
      expect(escapeESReservedCharacters(undefined)).toBe('');
      // '#' matches the regex but has no table entry: it passes through.
      expect(escapeESReservedCharacters('a#b')).toBe('a#b');
    });
  });

  it('buildBotSearchQueryFilter matches the official bool query', () => {
    expect(buildBotSearchQueryFilter('ingest+bot')).toEqual({
      query: {
        bool: {
          must: [{ term: { isBot: true } }],
          should: [
            { wildcard: { 'name.keyword': { value: '*ingest\\+bot*', case_insensitive: true } } },
            {
              wildcard: {
                'displayName.keyword': { value: '*ingest\\+bot*', case_insensitive: true },
              },
            },
            {
              wildcard: {
                'fullyQualifiedName.keyword': { value: '*ingest\\+bot*', case_insensitive: true },
              },
            },
            {
              wildcard: { 'email.keyword': { value: '*ingest\\+bot*', case_insensitive: true } },
            },
          ],
          minimum_should_match: 1,
        },
      },
    });
  });

  it('formatSearchUsers carries only _source fields', () => {
    expect(formatSearchUsers({})).toEqual([]);
    expect(formatSearchUsers({ hits: { hits: [{ _source: null }, {}] } })).toEqual([]);
    const users = formatSearchUsers({
      hits: {
        hits: [
          {
            _source: {
              id: 'u1',
              name: 'ingest-bot',
              displayName: 'Ingest',
              fullyQualifiedName: 'ingest-bot',
              email: 'a@b.c',
              type: 'user',
              isBot: true,
              teams: [{ id: 't1', name: 'Team' }],
              roles: [],
              href: '/api/v1/users/u1',
              extra: 'dropped',
            },
          },
        ],
      },
    });
    expect(users).toHaveLength(1);
    expect(users[0]).not.toHaveProperty('extra');
    expect(users[0]).toMatchObject({ id: 'u1', name: 'ingest-bot', email: 'a@b.c', isBot: true });
  });

  it('indexBotsByLowerName keys by lowercase name, last wins', () => {
    const map = indexBotsByLowerName([
      botRecord({ id: 'first', name: 'Bot' }),
      botRecord({ id: 'second', name: 'BOT' }),
    ]);
    expect([...map.keys()]).toEqual(['bot']);
    expect(map.get('bot')?.id).toBe('second');
  });

  it('enrichBotWithMatchedUser keeps the type and defaults it to user', () => {
    const enriched = enrichBotWithMatchedUser(botRecord({ botUser: undefined }), {
      id: 'u9',
      name: 'ingest-bot',
    });
    expect(enriched.botUser).toEqual({
      id: 'u9',
      name: 'ingest-bot',
      displayName: undefined,
      fullyQualifiedName: undefined,
      type: 'user',
    });
    const kept = enrichBotWithMatchedUser(
      botRecord({ botUser: { id: 'u1', name: 'x', type: 'user' } }),
      { id: 'u9', name: 'ingest-bot', displayName: 'D', fullyQualifiedName: 'fqn' },
    );
    expect(kept.botUser).toMatchObject({ type: 'user', displayName: 'D', fullyQualifiedName: 'fqn' });
    const untouched = botRecord();
    expect(enrichBotWithMatchedUser(untouched, undefined)).toBe(untouched);
  });

  it('matchBotsBySearchTerm joins hits and client-matches bot fields', () => {
    const bots = indexBotsByLowerName([
      botRecord({ id: 'b1', name: 'ingest-bot', displayName: 'Ingest', description: 'runs jobs' }),
      botRecord({ id: 'b2', name: 'quality-bot', displayName: 'Quality', description: 'checks data' }),
      botRecord({ id: 'b3', name: 'other', displayName: 'Other', description: 'nothing here' }),
    ]);
    // Hit match (user name equals bot name), term otherwise absent.
    expect(
      matchBotsBySearchTerm(bots, [{ name: 'OTHER' }], 'zzz').map((bot) => bot.id),
    ).toEqual(['b3']);
    // Name-key match.
    expect(matchBotsBySearchTerm(bots, [], 'INGEST').map((bot) => bot.id)).toEqual(['b1']);
    // Display-name match.
    expect(matchBotsBySearchTerm(bots, [], 'quality').map((bot) => bot.id)).toEqual(['b2']);
    // Description match.
    expect(matchBotsBySearchTerm(bots, [], 'jobs').map((bot) => bot.id)).toEqual(['b1']);
    // No match.
    expect(matchBotsBySearchTerm(bots, [], 'nomatch')).toEqual([]);
    // Hit enriches the matched bot.
    const [enriched] = matchBotsBySearchTerm(
      bots,
      [{ id: 'u2', name: 'quality-bot', displayName: 'Q User' }],
      'quality',
    );
    expect(enriched.botUser).toMatchObject({ id: 'u2', displayName: 'Q User' });
  });

  it('searchBots sends the official ES query and joins to the bot map', async () => {
    const calls = stubFetch(() =>
      jsonResponse({ hits: { hits: [{ _source: { id: 'u1', name: 'ingest-bot' } }] } }),
    );
    const matched = await searchBots(' ingest ', {
      showDeleted: true,
      bots: [botRecord()],
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].botUser?.id).toBe('u1');
    expect(calls).toHaveLength(1);
    const query = queryOf(calls[0].url);
    expect(calls[0].url).toContain('/api/v1/search/query');
    expect(query.get('q')).toBe('');
    expect(query.get('index')).toBe('user');
    expect(query.get('from')).toBe('0');
    expect(query.get('size')).toBe(String(BOT_SEARCH_PAGE_SIZE));
    expect(query.get('deleted')).toBe('true');
    expect(JSON.parse(query.get('query_filter') ?? '{}')).toEqual(
      buildBotSearchQueryFilter('ingest'),
    );
  });

  it('searchBots returns [] without fetching for a blank term', async () => {
    const calls = stubFetch(() => jsonResponse({}));
    await expect(searchBots('   ', { showDeleted: false, bots: [] })).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('JWT expiry options are the 7 official values in numeric order', () => {
    expect(JWT_TOKEN_EXPIRY_OPTIONS.map((option) => option.value)).toEqual([
      'OneHour',
      '1',
      '7',
      '30',
      '60',
      '90',
      'Unlimited',
    ]);
    const days = JWT_TOKEN_EXPIRY_OPTIONS.map(
      (option) => JWT_TOKEN_EXPIRY_NUMERIC_DAYS[option.value],
    );
    expect(days).toEqual([0.0417, 1, 7, 30, 60, 90, Infinity]);
    expect(JWT_TOKEN_EXPIRY_OPTIONS[0].labelKey).toBe('label.1-hr');
    expect(JWT_TOKEN_EXPIRY_OPTIONS[1].labelKey).toBe('label.1-day');
    expect(JWT_TOKEN_EXPIRY_OPTIONS[2]).toEqual({
      value: '7',
      labelKey: 'label.number-day-plural',
      labelParams: { number: 7 },
    });
    expect(JWT_TOKEN_EXPIRY_OPTIONS[6].labelKey).toBe('label.unlimited');
  });
});
