/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { RestClient } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';
import {
  boolParam,
  fetchUserContext,
  limitParam,
  ownedQueryFilter,
  resolveOwnedFilter,
  summarizeHit,
  summarizeOwned,
} from '../src/userContext.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
  readOnly: false,
  disabledTools: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('boolParam', () => {
  it('parses only true/false, case-insensitively, and keeps the default otherwise', () => {
    expect(boolParam('TRUE', false)).toBe(true);
    expect(boolParam('false', true)).toBe(false);
    expect(boolParam('yes', true)).toBe(true);
    expect(boolParam('1', false)).toBe(false);
    expect(boolParam(true, false)).toBe(true);
    expect(boolParam(undefined, true)).toBe(true);
  });
});

describe('limitParam', () => {
  it('clamps to 1–100 with a 20 default', () => {
    expect(limitParam(undefined)).toBe(20);
    expect(limitParam(0)).toBe(1);
    expect(limitParam(500)).toBe(100);
    expect(limitParam(7)).toBe(7);
  });
});

describe('resolveOwnedFilter', () => {
  it('accepts the four values case-insensitively and treats blank as NONE', () => {
    expect(resolveOwnedFilter(undefined)).toEqual({ filter: 'NONE' });
    expect(resolveOwnedFilter('  ')).toEqual({ filter: 'NONE' });
    expect(resolveOwnedFilter('missing_tier')).toEqual({ filter: 'MISSING_TIER' });
  });

  it('falls back to NONE with a warning for an unrecognized value', () => {
    const resolved = resolveOwnedFilter('bogus');
    expect(resolved.filter).toBe('NONE');
    expect(resolved.warnings?.[0]).toMatch(/Unrecognized ownedFilter 'bogus'/);
    expect(resolved.warnings?.[0]).toMatch(/Valid values: NONE, MISSING_DESCRIPTION, MISSING_TIER, ANY_GAP/);
  });
});

describe('ownedQueryFilter', () => {
  it('nests the owner ids and pins the gap entity types', () => {
    const filter = ownedQueryFilter(['u1', 't1'], 'MISSING_DESCRIPTION');
    const must = (filter.query as { bool: { must: unknown[] } }).bool.must;
    expect(must[0]).toEqual({
      nested: {
        path: 'owners',
        query: { terms: { 'owners.id': ['u1', 't1'] } },
        ignore_unmapped: true,
      },
    });
    expect(must[1]).toEqual({ terms: { entityType: expect.arrayContaining(['table', 'glossaryTerm']) } });
    expect(must[2]).toEqual({
      bool: { must_not: [{ term: { descriptionStatus: 'COMPLETE' } }] },
    });
  });

  it('uses a should clause for ANY_GAP', () => {
    const filter = ownedQueryFilter(['u1'], 'ANY_GAP');
    const must = (filter.query as { bool: { must: unknown[] } }).bool.must;
    expect(must[2]).toEqual({
      bool: { should: expect.any(Array), minimum_should_match: 1 },
    });
  });
});

describe('summarizeHit', () => {
  it('keeps type, fqn, name, displayName and updatedAt', () => {
    expect(
      summarizeHit({
        _source: {
          entityType: 'table',
          fullyQualifiedName: 'svc.db.orders',
          name: 'orders',
          displayName: 'Orders',
          updatedAt: 123,
        },
      }),
    ).toEqual({
      type: 'table',
      fqn: 'svc.db.orders',
      name: 'orders',
      displayName: 'Orders',
      updatedAt: 123,
    });
  });

  it('defaults the name to the FQN and drops hits without type or FQN', () => {
    expect(summarizeHit({ _source: { entityType: 'table', fullyQualifiedName: 'f' } })?.name).toBe('f');
    expect(summarizeHit({ _source: { fullyQualifiedName: 'f' } })).toBeNull();
    expect(summarizeHit({ _source: { entityType: 'table' } })).toBeNull();
  });
});

describe('fetchUserContext', () => {
  it('reads the logged-in user and both summaries', async () => {
    const user = {
      id: 'u1',
      name: 'ada',
      displayName: 'Ada',
      email: 'ada@example.com',
      isAdmin: false,
      isBot: false,
      teams: [{ id: 't1', name: 'data', displayName: 'Data' }],
      roles: [{ id: 'r1', name: 'DataConsumer' }],
      inheritedRoles: [],
      domains: [{ name: 'finance', fullyQualifiedName: 'Finance' }],
      persona: { name: 'analyst', displayName: 'Analyst' },
    };
    const searchPage = {
      hits: {
        total: { value: 2 },
        hits: [
          { _source: { entityType: 'table', fullyQualifiedName: 'svc.db.orders', name: 'orders' } },
          { _source: { entityType: 'dashboard', fullyQualifiedName: 'd.sales', name: 'sales' } },
        ],
      },
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/users/loggedInUser')) {
        return jsonResponse(user);
      }
      return jsonResponse(searchPage);
    });
    const result = await fetchUserContext(new RestClient(config, fetchImpl), {
      includeOwnedSummary: true,
      includeFollowedSummary: true,
      ownedLimit: 20,
      followedLimit: 20,
      ownedFilter: undefined,
    });
    expect(result.user).toEqual({
      id: 'u1',
      name: 'ada',
      displayName: 'Ada',
      email: 'ada@example.com',
      isAdmin: false,
      isBot: false,
    });
    expect(result.teams).toEqual([{ id: 't1', name: 'data', displayName: 'Data' }]);
    expect(result.roles).toEqual([{ id: 'r1', name: 'DataConsumer' }]);
    expect(result.domains).toEqual([{ name: 'finance', fqn: 'Finance' }]);
    expect(result.persona).toEqual({ name: 'analyst', displayName: 'Analyst' });
    const owned = result.ownedSummary as { totalCount: number; byType: Record<string, number>; byTypeComplete: boolean; recent: unknown[] };
    expect(owned.totalCount).toBe(2);
    expect(owned.byType).toEqual({ table: 1, dashboard: 1 });
    expect(owned.byTypeComplete).toBe(true);
    expect(owned.recent).toHaveLength(2);
    const followed = result.followedSummary as { totalCount: number; entities: unknown[] };
    expect(followed.totalCount).toBe(2);
    expect(followed.entities).toHaveLength(2);
    expect(result.warnings).toBeUndefined();
    // Owned and followed summaries both read the search endpoint.
    expect(fetchImpl.mock.calls.filter(([u]) => (u as string).includes('/v1/search/query'))).toHaveLength(2);
  });

  it('reports an unrecognized ownedFilter in warnings and still summarizes', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/users/loggedInUser')) {
        return jsonResponse({ id: 'u1', name: 'ada', teams: [] });
      }
      return jsonResponse({ hits: { total: { value: 0 }, hits: [] } });
    });
    const result = await fetchUserContext(new RestClient(config, fetchImpl), {
      includeOwnedSummary: true,
      includeFollowedSummary: false,
      ownedLimit: 20,
      followedLimit: 20,
      ownedFilter: 'bogus',
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.ownedSummary).toEqual({ totalCount: 0, byType: {}, byTypeComplete: true, recent: [] });
    expect(result.followedSummary).toBeUndefined();
  });

  it('returns an empty owned summary without a search call when there are no owner ids', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hits: { total: { value: 0 }, hits: [] } }));
    const summary = await summarizeOwned(new RestClient(config, fetchImpl), [], 'NONE', 20);
    expect(summary).toEqual({ totalCount: 0, byType: {}, recent: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
